import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  LoggingMessageNotificationSchema,
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { SessionUser } from '../auth.js';
import { CONNECT_TIMEOUT_MS, PLATFORM_VERSION, TOOL_TIMEOUT_MS } from '../config.js';
import { decryptJson } from '../crypto.js';
import { all, get, logServer, nowIso, parseJson, run } from '../db.js';

export type ServerRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  transport: 'stdio' | 'http';
  command: string | null;
  args: string;
  cwd: string | null;
  url: string | null;
  env: string;
  headers: string;
  tags: string;
  enabled: number;
  auto_start: number;
  status: string;
  status_message: string | null;
  last_error: string | null;
  capabilities: string | null;
  server_info: string | null;
  protocol_version: string | null;
  last_connected_at: string | null;
  last_health_at: string | null;
  created_at: string;
  updated_at: string;
};

type Live = {
  client: Client;
  transport: Transport;
  pid: number | null;
  startedAt: number;
  serverName: string;
  syncing?: Promise<void>;
};

const connections = new Map<string, Live>();
const healthTimers = new Map<string, NodeJS.Timeout>();
let healthLoop: NodeJS.Timeout | null = null;

export function isConnected(serverId: string): boolean {
  return connections.has(serverId);
}

export function liveConnectionCount(): number {
  return connections.size;
}

export function connectionPid(serverId: string): number | null {
  return connections.get(serverId)?.pid ?? null;
}

export function getServerRow(id: string): ServerRow | undefined {
  return get<ServerRow>('SELECT * FROM servers WHERE id = ?', id);
}

function setStatus(serverId: string, status: string, message?: string | null) {
  run(
    'UPDATE servers SET status = ?, status_message = ?, updated_at = ? WHERE id = ?',
    status,
    message ?? null,
    nowIso(),
    serverId,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class McpError extends Error {
  code: string;
  constructor(message: string, code = 'mcp_error') {
    super(message);
    this.code = code;
  }
}

function buildTransport(row: ServerRow): Transport {
  if (row.transport === 'http') {
    if (!row.url) throw new McpError('Server is missing a URL', 'invalid_config');
    let headers: Record<string, string> = {};
    try {
      headers = decryptJson<Record<string, string>>(row.headers);
    } catch {
      headers = {};
    }
    const transport = new StreamableHTTPClientTransport(new URL(row.url), {
      requestInit: Object.keys(headers).length ? { headers } : undefined,
    });
    return transport;
  }

  if (!row.command) throw new McpError('Server is missing a command', 'invalid_config');
  const env = { ...getDefaultEnvironment() };
  Object.assign(env, decryptJson<Record<string, string>>(row.env));
  const args = parseJson<string[]>(row.args, []);
  return new StdioClientTransport({
    command: row.command,
    args: args.map((a) => a.replace(/\$\{MCPNEXUS_ROOT\}/g, process.cwd())),
    cwd: row.cwd ?? process.cwd(),
    env,
    stderr: 'pipe',
  });
}

function attachNotifications(serverId: string, serverName: string, client: Client) {
  const sync = () => {
    const live = connections.get(serverId);
    if (!live) return;
    live.syncing = (live.syncing ?? Promise.resolve())
      .then(() => syncDiscovery(serverId))
      .catch((error) => logServer(serverId, 'error', `Discovery refresh failed: ${error.message}`));
  };

  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    logServer(serverId, 'notification', 'Server reported tools/list_changed');
    sync();
  });
  client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
    logServer(serverId, 'notification', 'Server reported resources/list_changed');
    sync();
  });
  client.setNotificationHandler(PromptListChangedNotificationSchema, () => {
    logServer(serverId, 'notification', 'Server reported prompts/list_changed');
    sync();
  });
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
    const uri = (notification.params as any)?.uri ?? 'unknown';
    run(
      'INSERT INTO notifications (id, server_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      serverId,
      'resource_updated',
      JSON.stringify({ uri, server: serverName }),
      nowIso(),
    );
    logServer(serverId, 'notification', `Resource updated: ${uri}`);
  });
  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    const params = notification.params as any;
    const text = typeof params?.data === 'string' ? params.data : JSON.stringify(params?.data);
    logServer(serverId, params?.level ?? 'info', `[server] ${text}`);
  });
}

export async function connectServer(serverId: string, actor?: SessionUser): Promise<ServerRow> {
  const row = getServerRow(serverId);
  if (!row) throw new McpError('Server not found', 'not_found');
  if (connections.has(serverId)) return row;
  if (!row.enabled) throw new McpError('Server is disabled', 'disabled');

  setStatus(serverId, 'starting', 'Establishing MCP session');
  const transport = buildTransport(row);
  const client = new Client(
    { name: 'mcpnexus-control-plane', version: PLATFORM_VERSION },
    { capabilities: {} },
  );

  if (transport instanceof StdioClientTransport && transport.stderr) {
    transport.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (text) logServer(serverId, 'stderr', text);
    });
  }

  attachNotifications(serverId, row.name, client);

  try {
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'MCP handshake');
  } catch (error: any) {
    setStatus(serverId, 'error', error?.message ?? 'Connection failed');
    run(
      'UPDATE servers SET last_error = ?, status_message = ?, updated_at = ? WHERE id = ?',
      error?.message ?? String(error),
      error?.message ?? 'Connection failed',
      nowIso(),
      serverId,
    );
    logServer(serverId, 'error', `Connection failed: ${error?.message ?? error}`);
    try {
      await transport.close();
    } catch {
      /* already closed */
    }
    throw new McpError(
      `Failed to connect to ${row.name}: ${error?.message ?? error}`,
      'connect_failed',
    );
  }

  const live: Live = {
    client,
    transport,
    pid: transport instanceof StdioClientTransport ? transport.pid : null,
    startedAt: Date.now(),
    serverName: row.name,
  };
  connections.set(serverId, live);

  client.onclose = () => {
    connections.delete(serverId);
    stopHealthTimer(serverId);
    const current = getServerRow(serverId);
    if (current && current.status !== 'stopped') {
      setStatus(serverId, 'stopped', 'MCP session closed by the server');
      logServer(serverId, 'info', 'MCP session closed');
    }
  };
  client.onerror = (error: any) => {
    logServer(serverId, 'error', `Protocol error: ${error?.message ?? error}`);
  };

  const capabilities = client.getServerCapabilities() ?? {};
  const serverInfo = client.getServerVersion() ?? null;
  const instructions = client.getInstructions();

  run(
    `UPDATE servers SET status = 'running', status_message = ?, capabilities = ?, server_info = ?,
       last_connected_at = ?, last_error = NULL, updated_at = ? WHERE id = ?
    `,
    instructions ? `Connected · ${instructions.slice(0, 200)}` : 'Connected',
    JSON.stringify(capabilities),
    JSON.stringify(serverInfo ?? {}),
    nowIso(),
    nowIso(),
    serverId,
  );

  logServer(
    serverId,
    'info',
    `Connected to ${serverInfo?.name ?? row.name} v${serverInfo?.version ?? '?'} over ${row.transport.toUpperCase()} (pid ${live.pid ?? 'n/a'})`,
  );

  await syncDiscovery(serverId);
  startHealthTimer(serverId);
  return getServerRow(serverId)!;
}

export async function syncDiscovery(serverId: string): Promise<void> {
  const live = connections.get(serverId);
  if (!live) return;
  const capabilities = live.client.getServerCapabilities() ?? {};
  const timestamp = nowIso();

  if (capabilities.tools) {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result: any = await live.client.listTools(cursor ? { cursor } : undefined);
      for (const tool of result.tools ?? []) {
        run(
          `INSERT INTO tools (id, server_id, name, title, description, input_schema, enabled, requires_approval, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
           ON CONFLICT(server_id, name) DO UPDATE SET
             title = excluded.title,
             description = excluded.description,
             input_schema = excluded.input_schema,
             discovered_at = excluded.discovered_at`,
          crypto.randomUUID(),
          serverId,
          tool.name,
          tool.title ?? null,
          tool.description ?? '',
          JSON.stringify(tool.inputSchema ?? {}),
          timestamp,
        );
        const risk = /delete|remove|write|execute|exec|shell|query|drop|update|post/i;
        if (risk.test(tool.name)) {
          run(
            'UPDATE tools SET requires_approval = 1 WHERE server_id = ? AND name = ?',
            serverId,
            tool.name,
          );
        }
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    logServer(serverId, 'info', `Discovered ${(all('SELECT id FROM tools WHERE server_id = ?', serverId)).length} tools`);
  }

  if (capabilities.resources) {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result: any = await live.client.listResources(cursor ? { cursor } : undefined);
      for (const resource of result.resources ?? []) {
        run(
          `INSERT INTO resources (id, server_id, uri, name, description, mime_type, is_template, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(server_id, uri) DO UPDATE SET
             name = excluded.name, description = excluded.description,
             mime_type = excluded.mime_type, is_template = 0, discovered_at = excluded.discovered_at`,
          crypto.randomUUID(),
          serverId,
          resource.uri,
          resource.name ?? '',
          resource.description ?? '',
          resource.mimeType ?? null,
          timestamp,
        );
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    const templates: any = await live.client.listResourceTemplates().catch(() => ({ resourceTemplates: [] }));
    for (const template of templates.resourceTemplates ?? []) {
      run(
        `INSERT INTO resources (id, server_id, uri, name, description, mime_type, is_template, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(server_id, uri) DO UPDATE SET
           name = excluded.name, description = excluded.description,
           mime_type = excluded.mime_type, is_template = 1, discovered_at = excluded.discovered_at`,
        crypto.randomUUID(),
        serverId,
        template.uriTemplate,
        template.name ?? '',
        template.description ?? '',
        template.mimeType ?? null,
        timestamp,
      );
    }
  }

  if (capabilities.prompts) {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result: any = await live.client.listPrompts(cursor ? { cursor } : undefined);
      for (const prompt of result.prompts ?? []) {
        run(
          `INSERT INTO prompts (id, server_id, name, description, arguments, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(server_id, name) DO UPDATE SET
             description = excluded.description, arguments = excluded.arguments,
             discovered_at = excluded.discovered_at`,
          crypto.randomUUID(),
          serverId,
          prompt.name,
          prompt.description ?? '',
          JSON.stringify(prompt.arguments ?? []),
          timestamp,
        );
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
  }
}

export async function disconnectServer(serverId: string): Promise<void> {
  const live = connections.get(serverId);
  stopHealthTimer(serverId);
  if (!live) {
    setStatus(serverId, 'stopped', 'Not connected');
    return;
  }
  connections.delete(serverId);
  setStatus(serverId, 'stopped', 'Stopped by user');
  try {
    await withTimeout(live.transport.close(), 5000, 'Transport close').catch(() => undefined);
  } catch {
    /* ignore */
  }
  logServer(serverId, 'info', 'Server stopped');
}

export async function restartServer(serverId: string): Promise<ServerRow> {
  await disconnectServer(serverId);
  return connectServer(serverId);
}

/** Ensure a live session exists before a protocol call. */
async function ensureClient(serverId: string): Promise<Client> {
  const row = getServerRow(serverId);
  if (!row) throw new McpError('Server not found', 'not_found');
  if (!row.enabled) throw new McpError('Server is disabled', 'disabled');
  if (!connections.has(serverId)) {
    // Tool/resource calls start the server on demand and keep it running.
    await connectServer(serverId);
  }
  const live = connections.get(serverId);
  if (!live) throw new McpError('Server is not connected', 'not_connected');
  return live.client;
}

export type ToolResultPayload = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError: boolean;
  raw?: unknown;
};

function normalizeToolResult(result: any): ToolResultPayload {
  const content = Array.isArray(result?.content)
    ? result.content.map((part: any) => ({ ...part }))
    : typeof result === 'string'
      ? [{ type: 'text', text: result }]
      : [];
  return {
    content,
    structuredContent: result?.structuredContent,
    isError: Boolean(result?.isError),
    raw: result,
  };
}

export type ExecutionRecord = {
  id: string;
  serverId: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'success' | 'error' | 'pending_approval' | 'denied';
  result: ToolResultPayload | null;
  error: string | null;
  durationMs: number;
  isError: boolean;
  createdAt: string;
};

export async function callTool(params: {
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  user?: SessionUser;
  approvalId?: string;
}): Promise<ExecutionRecord> {
  const row = getServerRow(params.serverId);
  if (!row) throw new McpError('Server not found', 'not_found');
  const tool = get(
    'SELECT * FROM tools WHERE server_id = ? AND name = ?',
    params.serverId,
    params.toolName,
  );
  if (!tool) throw new McpError(`Tool "${params.toolName}" is not registered`, 'tool_not_found');
  if (!tool.enabled) throw new McpError(`Tool "${params.toolName}" is disabled`, 'tool_disabled');

  const client = await ensureClient(params.serverId);
  const started = Date.now();
  const executionId = crypto.randomUUID();

  try {
    const result: any = await client.callTool(
      { name: params.toolName, arguments: params.args },
      undefined,
      { timeout: TOOL_TIMEOUT_MS },
    );
    const durationMs = Date.now() - started;
    const normalized = normalizeToolResult(result);
    run(
      `INSERT INTO executions (id, server_id, server_name, tool_name, arguments, status, result, error, duration_ms, user_id, user_email, approval_id, is_error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      executionId,
      params.serverId,
      row.name,
      params.toolName,
      JSON.stringify(params.args ?? {}),
      normalized.isError ? 'error' : 'success',
      JSON.stringify(normalized),
      durationMs,
      params.user?.id ?? null,
      params.user?.email ?? null,
      params.approvalId ?? null,
      normalized.isError ? 1 : 0,
      nowIso(),
    );
    return {
      id: executionId,
      serverId: params.serverId,
      serverName: row.name,
      toolName: params.toolName,
      arguments: params.args,
      status: normalized.isError ? 'error' : 'success',
      result: normalized,
      error: normalized.isError ? extractText(normalized) : null,
      durationMs,
      isError: normalized.isError,
      createdAt: nowIso(),
    };
  } catch (error: any) {
    const durationMs = Date.now() - started;
    const message =
      error?.code === 'ETIMEDOUT' || /timed out/.test(error?.message ?? '')
        ? `Tool execution timed out after ${TOOL_TIMEOUT_MS}ms`
        : (error?.message ?? String(error));
    run(
      `INSERT INTO executions (id, server_id, server_name, tool_name, arguments, status, result, error, duration_ms, user_id, user_email, approval_id, is_error, created_at)
       VALUES (?, ?, ?, ?, ?, 'error', NULL, ?, ?, ?, ?, ?, 1, ?)`,
      executionId,
      params.serverId,
      row.name,
      params.toolName,
      JSON.stringify(params.args ?? {}),
      message,
      durationMs,
      params.user?.id ?? null,
      params.user?.email ?? null,
      params.approvalId ?? null,
      nowIso(),
    );
    logServer(params.serverId, 'error', `Tool ${params.toolName} failed: ${message}`);
    return {
      id: executionId,
      serverId: params.serverId,
      serverName: row.name,
      toolName: params.toolName,
      arguments: params.args,
      status: 'error',
      result: null,
      error: message,
      durationMs,
      isError: true,
      createdAt: nowIso(),
    };
  }
}

export function extractText(result: ToolResultPayload): string {
  return result.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

export async function readResource(params: {
  serverId: string;
  uri: string;
  user?: SessionUser;
}): Promise<{ contents: any[]; durationMs: number }> {
  const client = await ensureClient(params.serverId);
  const started = Date.now();
  try {
    const result: any = await client.readResource({ uri: params.uri });
    const durationMs = Date.now() - started;
    const contents = (result.contents ?? []).map((c: any) => ({
      uri: c.uri,
      mimeType: c.mimeType ?? null,
      text: c.text ?? null,
      blob: c.blob ?? null,
    }));
    const bytes = contents.reduce(
      (total: number, c: any) => total + (c.text?.length ?? c.blob?.length ?? 0),
      0,
    );
    run(
      `INSERT INTO resource_reads (id, server_id, uri, status, bytes, duration_ms, user_id, error, created_at)
       VALUES (?, ?, ?, 'success', ?, ?, ?, NULL, ?)`,
      crypto.randomUUID(),
      params.serverId,
      params.uri,
      bytes,
      durationMs,
      params.user?.id ?? null,
      nowIso(),
    );
    return { contents, durationMs };
  } catch (error: any) {
    run(
      `INSERT INTO resource_reads (id, server_id, uri, status, bytes, duration_ms, user_id, error, created_at)
       VALUES (?, ?, ?, 'error', 0, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      params.serverId,
      params.uri,
      Date.now() - started,
      params.user?.id ?? null,
      error?.message ?? String(error),
      nowIso(),
    );
    throw new McpError(
      `Failed to read ${params.uri}: ${error?.message ?? error}`,
      'resource_read_failed',
    );
  }
}

export async function getPrompt(params: {
  serverId: string;
  name: string;
  args: Record<string, string>;
}): Promise<{ description?: string; messages: any[] }> {
  const client = await ensureClient(params.serverId);
  const result: any = await client.getPrompt({ name: params.name, arguments: params.args });
  return { description: result.description, messages: result.messages ?? [] };
}

/** Ask the connected server to ping (used by health checks and diagnostics). */
export async function pingServer(serverId: string): Promise<number> {
  const live = connections.get(serverId);
  if (!live) throw new McpError('Server is not connected', 'not_connected');
  const started = Date.now();
  await withTimeout(live.client.ping(), 5000, 'Ping');
  return Date.now() - started;
}

function startHealthTimer(serverId: string) {
  stopHealthTimer(serverId);
  const timer = setInterval(() => {
    void runHealthCheck(serverId);
  }, 30_000);
  timer.unref?.();
  healthTimers.set(serverId, timer);
}

function stopHealthTimer(serverId: string) {
  const timer = healthTimers.get(serverId);
  if (timer) clearInterval(timer);
  healthTimers.delete(serverId);
}

export async function runHealthCheck(serverId: string): Promise<{ ok: boolean; latencyMs: number }> {
  if (!connections.has(serverId)) {
    run(
      'INSERT INTO health_checks (id, server_id, status, latency_ms, error, checked_at) VALUES (?, ?, ?, 0, ?, ?)',
      crypto.randomUUID(),
      serverId,
      'down',
      'Not connected',
      nowIso(),
    );
    return { ok: false, latencyMs: 0 };
  }
  try {
    const latencyMs = await pingServer(serverId);
    run(
      'INSERT INTO health_checks (id, server_id, status, latency_ms, error, checked_at) VALUES (?, ?, ?, ?, NULL, ?)',
      crypto.randomUUID(),
      serverId,
      'up',
      latencyMs,
      nowIso(),
    );
    run('UPDATE servers SET last_health_at = ? WHERE id = ?', nowIso(), serverId);
    run(
      `DELETE FROM health_checks WHERE server_id = ? AND id NOT IN (
         SELECT id FROM health_checks WHERE server_id = ? ORDER BY checked_at DESC LIMIT 300
       )`,
      serverId,
      serverId,
    );
    return { ok: true, latencyMs };
  } catch (error: any) {
    run(
      'INSERT INTO health_checks (id, server_id, status, latency_ms, error, checked_at) VALUES (?, ?, ?, 0, ?, ?)',
      crypto.randomUUID(),
      serverId,
      'down',
      error?.message ?? 'Ping failed',
      nowIso(),
    );
    return { ok: false, latencyMs: 0 };
  }
}

export function startHealthLoop() {
  if (healthLoop) return;
  healthLoop = setInterval(() => {
    for (const [serverId] of connections) {
      void runHealthCheck(serverId);
    }
  }, 30_000);
  healthLoop.unref?.();
}

/** Start every server marked auto_start, sequentially so startup logs stay readable. */
export async function autoStartServers(): Promise<void> {
  const rows = all<ServerRow>('SELECT * FROM servers WHERE auto_start = 1 AND enabled = 1');
  for (const row of rows) {
    try {
      await connectServer(row.id);
    } catch (error: any) {
      logServer(row.id, 'error', `Auto-start failed: ${error?.message ?? error}`);
    }
  }
}

export async function shutdownAll(): Promise<void> {
  const ids = [...connections.keys()];
  for (const id of ids) {
    await disconnectServer(id).catch(() => undefined);
  }
  if (healthLoop) clearInterval(healthLoop);
  healthLoop = null;
}

export function capabilitiesOf(row: ServerRow): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(row.capabilities, {});
}

export const CLIENT_INFO = { name: 'mcpnexus-control-plane', version: PLATFORM_VERSION };
