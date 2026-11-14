import fs from 'node:fs';
import path from 'node:path';
import { all, get, parseJson } from './db.js';
import { auditToolSchema } from './diagnostics.js';
import { getServerRow, isConnected } from './mcp/manager.js';
import { schemaShape } from './validation.js';

function sdkVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Capabilities our MCP client declares during initialize. */
const CLIENT_CAPABILITIES = {
  roots: false,
  sampling: false,
  elicitation: false,
  experimental: false,
} as const;

const SERVER_FEATURES = ['tools', 'resources', 'prompts', 'logging', 'completions'] as const;

export function inspectCompatibility(serverId: string) {
  const row = getServerRow(serverId);
  if (!row) throw new Error('Server not found');

  const capabilities = parseJson<Record<string, any>>(row.capabilities, {});
  const tools = all<any>('SELECT * FROM tools WHERE server_id = ? ORDER BY name', serverId);
  const resources = all<any>('SELECT * FROM resources WHERE server_id = ?', serverId);
  const prompts = all<any>('SELECT * FROM prompts WHERE server_id = ?', serverId);

  const issues: Array<{
    severity: 'error' | 'warn' | 'info';
    area: string;
    message: string;
    fix?: string;
  }> = [];

  for (const feature of SERVER_FEATURES) {
    if (!capabilities[feature] && (feature === 'tools' || feature === 'resources' || feature === 'prompts')) {
      issues.push({
        severity: 'info',
        area: 'capabilities',
        message: `Server does not advertise the "${feature}" capability`,
        fix: 'Register the capability on the server if you expect these primitives to be available.',
      });
    }
  }

  const toolReports = tools.map((tool) => {
    const schema = parseJson<any>(tool.input_schema, {});
    const audit = auditToolSchema(schema);
    const shape = schemaShape(schema);
    if (audit.issues.length) {
      for (const issue of audit.issues) {
        issues.push({
          severity: issue.includes('type must be') ? 'error' : 'warn',
          area: `tool:${tool.name}`,
          message: issue,
          fix: 'Publish a stricter object schema so clients can validate arguments.',
        });
      }
    }
    if (!tool.description) {
      issues.push({
        severity: 'warn',
        area: `tool:${tool.name}`,
        message: 'Tool has no description',
        fix: 'Add a description; models rely on it to choose the tool.',
      });
    }
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      valid: audit.ok,
      issues: audit.issues,
      required: shape.properties.filter((p) => p.required).map((p) => p.name),
      properties: shape.properties.length,
      additionalPropertiesAllowed: shape.additionalPropertiesAllowed,
      enabled: Boolean(tool.enabled),
      requiresApproval: Boolean(tool.requires_approval),
    };
  });

  const validatedCalls = get<{ total: number; failed: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS failed
       FROM executions WHERE server_id = ?`,
    serverId,
  ) ?? { total: 0, failed: 0 };

  const featureMatrix = [
    ...SERVER_FEATURES.map((feature) => ({
      feature,
      supportedByServer: Boolean(capabilities[feature]),
      supportedByClient: true,
      note:
        capabilities[feature]
          ? 'Negotiated during initialize'
          : 'Not advertised by this server',
    })),
    {
      feature: 'sampling',
      supportedByServer: Boolean(capabilities.sampling),
      supportedByClient: CLIENT_CAPABILITIES.sampling,
      note: CLIENT_CAPABILITIES.sampling
        ? 'Client can serve sampling requests'
        : 'MCPNEXUS does not advertise sampling to servers',
    },
    {
      feature: 'roots',
      supportedByServer: Boolean(capabilities.roots),
      supportedByClient: CLIENT_CAPABILITIES.roots,
      note: CLIENT_CAPABILITIES.roots ? 'Client provides roots' : 'No roots are advertised',
    },
  ];

  const transportOk =
    row.transport === 'stdio' ? Boolean(row.command) : Boolean(row.url && /^https?:/.test(row.url));
  if (!transportOk) {
    issues.push({
      severity: 'error',
      area: 'transport',
      message: `Invalid ${row.transport.toUpperCase()} configuration`,
      fix: 'Set a command for STDIO servers or an http(s) URL for Streamable HTTP servers.',
    });
  }
  if (isConnected(serverId) && !Object.keys(capabilities).length) {
    issues.push({
      severity: 'warn',
      area: 'handshake',
      message: 'Session is live but no capabilities were recorded',
      fix: 'Restart the server to re-run discovery.',
    });
  }
  if (!isConnected(serverId)) {
    issues.push({
      severity: 'info',
      area: 'session',
      message: 'Server is not connected, so live protocol checks are unavailable',
      fix: 'Start the server to complete the inspection.',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;
  const score = Math.max(0, 100 - errorCount * 20 - warnCount * 5);

  return {
    server: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      transport: row.transport,
      status: row.status,
      connected: isConnected(serverId),
      serverInfo: parseJson(row.server_info, {}),
      capabilities,
    },
    platform: {
      sdk: '@modelcontextprotocol/sdk',
      sdkVersion: sdkVersion(),
      clientName: 'mcpnexus-control-plane',
      clientCapabilities: CLIENT_CAPABILITIES,
      transports: ['stdio', 'streamable-http'],
    },
    featureMatrix,
    tools: toolReports,
    counts: {
      tools: tools.length,
      resources: resources.length,
      resourceTemplates: resources.filter((r) => r.is_template).length,
      prompts: prompts.length,
      validatedCalls: validatedCalls.total,
      failedCalls: validatedCalls.failed ?? 0,
    },
    issues,
    score,
    inspectedAt: new Date().toISOString(),
  };
}
