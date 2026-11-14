import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Express, Request, Response } from 'express';
import { PLATFORM_VERSION } from '../config.js';
import { all, get } from '../db.js';
import { buildOverview } from '../metrics.js';
import { getSetting } from '../settings.js';
import { callTool, isConnected, readResource } from './manager.js';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

function resolveServer(identifier: string) {
  return get<any>(
    'SELECT * FROM servers WHERE id = ? OR slug = ? OR lower(name) = lower(?)',
    identifier,
    identifier,
    identifier,
  );
}

/** MCP surface exposed by MCPNEXUS itself over Streamable HTTP. */
function buildControlServer(): McpServer {
  const server = new McpServer(
    { name: 'nexus-control', version: PLATFORM_VERSION },
    {
      instructions:
        'Control plane for MCPNEXUS. Inspect registered MCP servers, their tools, platform metrics and the execution timeline.',
    },
  );

  server.registerTool(
    'list_servers',
    {
      title: 'List MCP servers',
      description: 'List every registered MCP server with status, transport and discovered tool counts.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = all<any>('SELECT * FROM servers ORDER BY name');
      return text(
        JSON.stringify(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            transport: row.transport,
            status: row.status,
            connected: isConnected(row.id),
            tools: get<{ c: number }>('SELECT COUNT(*) AS c FROM tools WHERE server_id = ?', row.id)?.c ?? 0,
            resources:
              get<{ c: number }>('SELECT COUNT(*) AS c FROM resources WHERE server_id = ?', row.id)?.c ?? 0,
            prompts: get<{ c: number }>('SELECT COUNT(*) AS c FROM prompts WHERE server_id = ?', row.id)?.c ?? 0,
            lastError: row.last_error,
          })),
          null,
          2,
        ),
      );
    },
  );

  server.registerTool(
    'list_server_tools',
    {
      title: 'List tools of a server',
      description: 'Return tool names, descriptions and JSON input schemas for a registered server.',
      inputSchema: { server: z.string().describe('Server name, slug or id') },
      annotations: { readOnlyHint: true },
    },
    async ({ server: identifier }) => {
      const serverRow = resolveServer(identifier);
      if (!serverRow) return { content: [{ type: 'text', text: `Unknown server: ${identifier}` }], isError: true };
      const tools = all<any>(
        'SELECT name, description, input_schema, enabled, requires_approval FROM tools WHERE server_id = ?',
        serverRow.id,
      );
      return text(
        JSON.stringify(
          tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            enabled: Boolean(tool.enabled),
            requiresApproval: Boolean(tool.requires_approval),
            inputSchema: JSON.parse(tool.input_schema || '{}'),
          })),
          null,
          2,
        ),
      );
    },
  );

  server.registerTool(
    'execute_tool',
    {
      title: 'Execute a tool on another server',
      description: 'Proxy an MCP tools/call to a registered server. Control-plane servers cannot be targeted.',
      inputSchema: {
        server: z.string().describe('Target server name, slug or id'),
        tool: z.string(),
        arguments: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ server: identifier, tool, arguments: args }) => {
      const target = resolveServer(identifier);
      if (!target) return { content: [{ type: 'text', text: `Unknown server: ${identifier}` }], isError: true };
      if (target.slug === 'nexus-control-http') {
        return { content: [{ type: 'text', text: 'Refusing to proxy into the control plane itself' }], isError: true };
      }
      const record = await callTool({
        serverId: target.id,
        toolName: tool,
        args: (args ?? {}) as Record<string, unknown>,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
        isError: record.isError,
      };
    },
  );

  server.registerTool(
    'read_resource',
    {
      title: 'Read a resource',
      description: 'Read a resource URI from a registered server.',
      inputSchema: { server: z.string(), uri: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ server: identifier, uri }) => {
      const target = resolveServer(identifier);
      if (!target) return { content: [{ type: 'text', text: `Unknown server: ${identifier}` }], isError: true };
      try {
        const result = await readResource({ serverId: target.id, uri });
        return text(JSON.stringify(result, null, 2));
      } catch (error: any) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    },
  );

  server.registerTool(
    'platform_metrics',
    {
      title: 'Platform metrics',
      description: 'Aggregate server, tool and execution metrics computed from persisted data.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const overview = buildOverview();
      return text(JSON.stringify(overview, null, 2));
    },
  );

  server.registerTool(
    'recent_executions',
    {
      title: 'Recent executions',
      description: 'The most recent tool executions with latency and status.',
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const rows = all<any>(
        'SELECT tool_name, server_name, status, duration_ms, error, created_at FROM executions ORDER BY created_at DESC LIMIT ?',
        limit ?? 10,
      );
      return text(JSON.stringify(rows, null, 2));
    },
  );

  return server;
}

/**
 * Mounts the platform's own MCP server at POST /mcp using the Streamable HTTP
 * transport. Requests authenticate with a bearer token stored in settings.
 */
export function mountControlEndpoint(app: Express) {
  const unauthorized = (res: Response) =>
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    });

  app.post('/mcp', async (req: Request, res: Response) => {
    const token = getSetting('mcp.http_token');
    const header = req.headers.authorization ?? '';
    if (!token || header !== `Bearer ${token}`) {
      unauthorized(res);
      return;
    }
    const server = buildControlServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error?.message ?? 'Internal error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({ ok: false, error: 'This endpoint is stateless; use POST for JSON-RPC' });
  });
  app.delete('/mcp', (_req, res) => {
    res.status(405).json({ ok: false, error: 'This endpoint is stateless' });
  });
}
