import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { all, get, parseJson } from './db.js';
import { all as allRows } from './db.js';
import { isConnected, getServerRow, pingServer } from './mcp/manager.js';
import { schemaShape, validateAgainstSchema } from './validation.js';

export type DiagnosticItem = {
  id: string;
  severity: 'ok' | 'info' | 'warn' | 'error';
  title: string;
  detail: string;
  suggestion?: string;
};

const isPrivateHost = (host: string) => {
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return true;
  if (net.isIP(host)) {
    return (
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith('169.254.')
    );
  }
  return false;
};

function resolveCommand(command: string): { ok: boolean; path?: string } {
  if (command.includes('/') || command.includes('\\') || path.isAbsolute(command)) {
    const resolved = path.isAbsolute(command) ? command : path.resolve(process.cwd(), command);
    return { ok: fs.existsSync(resolved), path: resolved };
  }
  const paths = (process.env.PATH ?? '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of paths) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (fs.existsSync(candidate)) return { ok: true, path: candidate };
    }
  }
  return { ok: false };
}

export async function diagnose(serverId: string): Promise<{
  server: { id: string; name: string; status: string; transport: string };
  items: DiagnosticItem[];
  score: number;
  checkedAt: string;
}> {
  const row = getServerRow(serverId);
  if (!row) throw new Error('Server not found');
  const items: DiagnosticItem[] = [];
  const push = (item: DiagnosticItem) => items.push(item);

  push({
    id: 'registration',
    severity: row.enabled ? 'ok' : 'warn',
    title: row.enabled ? 'Server is registered and enabled' : 'Server is disabled',
    detail: `Registered as ${row.slug} using the ${row.transport.toUpperCase()} transport.`,
    suggestion: row.enabled ? undefined : 'Enable the server in Configuration before starting it.',
  });

  if (row.transport === 'stdio') {
    if (!row.command) {
      push({
        id: 'command',
        severity: 'error',
        title: 'No command configured',
        detail: 'STDIO servers need an executable to spawn.',
        suggestion: 'Set the command and arguments in the server configuration.',
      });
    } else {
      const resolved = resolveCommand(row.command);
      push({
        id: 'command',
        severity: resolved.ok ? 'ok' : 'error',
        title: resolved.ok ? 'Executable resolved' : 'Executable not found',
        detail: resolved.ok
          ? `${row.command} resolved to ${resolved.path ?? row.command}.`
          : `Could not resolve "${row.command}" on PATH or on disk.`,
        suggestion: resolved.ok
          ? undefined
          : 'Install the executable or use an absolute path to the interpreter.',
      });
      const args = parseJson<string[]>(row.args, []);
      const scriptArg = args.find((a) => a.endsWith('.js') || a.endsWith('.mjs') || a.endsWith('.py'));
      if (scriptArg) {
        const scriptPath = path.isAbsolute(scriptArg)
          ? scriptArg
          : path.resolve(process.cwd(), scriptArg);
        const exists = fs.existsSync(scriptPath);
        push({
          id: 'entrypoint',
          severity: exists ? 'ok' : 'error',
          title: exists ? 'Entry point found' : 'Entry point missing',
          detail: `${scriptArg} ${exists ? 'exists' : 'does not exist'} at ${scriptPath}.`,
          suggestion: exists ? undefined : 'Fix the argument list so the server entry point resolves.',
        });
      }
    }
  } else {
    let url: URL | null = null;
    try {
      url = row.url ? new URL(row.url) : null;
    } catch {
      url = null;
    }
    push({
      id: 'url',
      severity: url ? 'ok' : 'error',
      title: url ? 'Endpoint URL is valid' : 'Endpoint URL is invalid',
      detail: row.url ? `Target: ${row.url}` : 'No URL configured for the HTTP transport.',
      suggestion: url ? undefined : 'Provide an absolute http(s) URL.',
    });
    if (url && isPrivateHost(url.hostname)) {
      push({
        id: 'network',
        severity: 'info',
        title: 'Endpoint is on a loopback or private address',
        detail: `${url.hostname} is not publicly routable — expected for local control-plane endpoints.`,
      });
    }
  }

  const connected = isConnected(serverId);
  push({
    id: 'session',
    severity: connected ? 'ok' : row.status === 'error' ? 'error' : 'warn',
    title: connected ? 'Live MCP session established' : 'No live MCP session',
    detail: connected
      ? 'The client completed the initialize handshake and is ready for calls.'
      : `Reported status: ${row.status}. ${row.last_error ?? row.status_message ?? ''}`.trim(),
    suggestion: connected ? undefined : 'Start the server from the Servers page and inspect the logs tab.',
  });

  if (connected) {
    try {
      const latency = await pingServer(serverId);
      push({
        id: 'ping',
        severity: latency > 2000 ? 'warn' : 'ok',
        title: `Ping succeeded in ${latency}ms`,
        detail: 'The server answered a JSON-RPC ping.',
        suggestion: latency > 2000 ? 'High latency may indicate a slow transport or event-loop contention.' : undefined,
      });
    } catch (error: any) {
      push({
        id: 'ping',
        severity: 'error',
        title: 'Ping failed',
        detail: error?.message ?? String(error),
        suggestion: 'Restart the server and check the log output for crashes.',
      });
    }
  }

  const capabilities = parseJson<Record<string, unknown>>(row.capabilities, {});
  const capKeys = Object.keys(capabilities);
  push({
    id: 'capabilities',
    severity: capKeys.length ? 'ok' : 'warn',
    title: capKeys.length ? 'Capabilities advertised' : 'No capabilities advertised',
    detail: capKeys.length ? capKeys.join(', ') : 'The initialize result contained no capabilities.',
    suggestion: capKeys.length ? undefined : 'Confirm the server registers tools, resources or prompts.',
  });

  const tools = all<any>('SELECT * FROM tools WHERE server_id = ?', serverId);
  if (capabilities.tools && tools.length === 0) {
    push({
      id: 'tools',
      severity: 'warn',
      title: 'Tools capability declared but no tools returned',
      detail: 'tools/list returned an empty list.',
      suggestion: 'Check that the server registers tools before connecting.',
    });
  } else if (tools.length) {
    const broken = tools.filter((tool) => {
      const schema = parseJson<any>(tool.input_schema, {});
      return schema.type !== 'object' || !schema.properties;
    });
    push({
      id: 'tools',
      severity: broken.length ? 'error' : 'ok',
      title: `${tools.length} tools discovered`,
      detail: broken.length
        ? `Invalid input schemas: ${broken.map((t) => t.name).join(', ')}`
        : 'Every tool exposes an object input schema.',
      suggestion: broken.length ? 'Fix the tool input schema on the server side.' : undefined,
    });
  }

  const failed = get<any>(
    `SELECT COUNT(*) AS c, MAX(created_at) AS last FROM executions WHERE server_id = ? AND is_error = 1`,
    serverId,
  );
  if ((failed?.c ?? 0) > 0) {
    const lastError = get<any>(
      'SELECT tool_name, error FROM executions WHERE server_id = ? AND is_error = 1 ORDER BY created_at DESC LIMIT 1',
      serverId,
    );
    push({
      id: 'executions',
      severity: 'warn',
      title: `${failed.c} failed executions recorded`,
      detail: `Most recent: ${lastError?.tool_name} — ${lastError?.error ?? 'unknown error'}`,
      suggestion: 'Validate the arguments against the schema and re-run from the Tool Explorer.',
    });
  } else {
    push({
      id: 'executions',
      severity: 'info',
      title: 'No failed executions recorded',
      detail: 'There is no failure history for this server.',
    });
  }

  const weights: Record<DiagnosticItem['severity'], number> = { ok: 0, info: 0, warn: 6, error: 22 };
  const penalty = items.reduce((total, item) => total + weights[item.severity], 0);
  return {
    server: { id: row.id, name: row.name, status: row.status, transport: row.transport },
    items,
    score: Math.max(0, 100 - penalty),
    checkedAt: new Date().toISOString(),
  };
}

export function diagnosticHistory(serverId: string) {
  const healthChecks = allRows<any>(
    'SELECT status, latency_ms, error, checked_at FROM health_checks WHERE server_id = ? ORDER BY checked_at DESC LIMIT 40',
    serverId,
  );
  const failures = allRows<any>(
    `SELECT tool_name, error, created_at FROM executions
      WHERE server_id = ? AND is_error = 1 ORDER BY created_at DESC LIMIT 20`,
    serverId,
  );
  return { healthChecks, failures };
}

/** Validate a single tool schema for the compatibility inspector. */
export function auditToolSchema(inputSchema: any) {
  const issues: string[] = [];
  if (!inputSchema || typeof inputSchema !== 'object') {
    issues.push('Input schema is missing');
    return { issues, ok: false };
  }
  if (inputSchema.type !== 'object') {
    issues.push('Input schema type must be "object" for MCP tool arguments');
  }
  for (const [name, prop] of Object.entries<any>(inputSchema.properties ?? {})) {
    if (!prop || typeof prop !== 'object') issues.push(`Property "${name}" is not a schema object`);
    else if (!prop.type && !prop.anyOf && !prop.oneOf && !prop.enum) {
      issues.push(`Property "${name}" has no type declaration`);
    }
    if (typeof prop?.pattern === 'string') {
      try {
        new RegExp(prop.pattern);
      } catch {
        issues.push(`Property "${name}" has an invalid regex pattern`);
      }
    }
  }
  for (const required of inputSchema.required ?? []) {
    if (!(required in (inputSchema.properties ?? {}))) {
      issues.push(`Required property "${required}" is not declared in properties`);
    }
  }
  const probe = validateAgainstSchema(inputSchema, {});
  void probe;
  return { issues, ok: issues.length === 0, shape: schemaShape(inputSchema) };
}
