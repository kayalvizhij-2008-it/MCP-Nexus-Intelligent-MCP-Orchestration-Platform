import type { SessionUser } from './auth.js';
import { encryptJson, hashPassword, randomToken } from './crypto.js';
import {
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_PASSWORD,
  BOOTSTRAP_PASSWORD_FILE,
  DATA_DIR,
  PLATFORM_VERSION,
  PORT,
  WORKSPACE_DIR,
} from './config.js';
import { all, get, logServer, nowIso, run } from './db.js';
import { getSetting, setSetting } from './settings.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

type SeedServer = {
  name: string;
  slug: string;
  description: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  tags: string[];
  autoStart: boolean;
  requiresApproval?: string[];
};

const WORKSPACE_FILES: Record<string, string> = {
  'README.md': `# NEXUS Workspace

This directory is the sandbox exposed by the **Nexus Filesystem** MCP server.
Every tool call is confined to this folder — path traversal attempts are rejected
before the file system is touched.

Try these calls from the Tool Explorer:

- \`list_directory\` with path \`""\`
- \`read_file\` with path \`"README.md"\`
- \`search_files\` with query \`"sandbox"\`
- \`write_file\` with path \`"notes/hello.txt"\` and content \`"Hello from MCPNEXUS"\`
`,
  'notes/architecture.md': `# MCPNEXUS architecture notes

1. \`src/server/mcp/manager.ts\` owns every MCP client session.
2. The official \`@modelcontextprotocol/sdk\` performs the handshake, discovery and calls.
3. Each call is persisted with latency, status and payload metadata in SQLite.
4. Tools marked \`requires_approval\` are parked until an administrator decides.
`,
  'data/sample.json': `{
  "project": "MCPNEXUS",
  "servers": ["nexus-toolbox", "nexus-filesystem", "nexus-data"],
  "transports": ["stdio", "streamable-http"]
}
`,
};

/** Describes how the first administrator account was created. Never holds a secret in logs. */
export type BootstrapNotice = {
  email: string;
  /** Present only when the password was generated and written to disk. */
  passwordFile?: string;
};

export function seedDatabase(): BootstrapNotice | null {
  const notice = seedAdmin();
  seedDemoUser();
  seedSettings();
  seedServers();
  seedPolicies();
  seedIntegrations();
  seedCustomPrompts();
  seedWorkspace();
  return notice;
}

function seedAdmin(): BootstrapNotice | null {
  const count = get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0;
  if (count > 0) return null;

  // A supplied password wins; otherwise a random one is generated and written
  // to a 0600 file so no guessable credential ever exists by default.
  const generated = !ADMIN_PASSWORD;
  const password = ADMIN_PASSWORD ?? randomToken(18);
  const passwordFile = generated ? BOOTSTRAP_PASSWORD_FILE : undefined;

  run(
    'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    ADMIN_EMAIL,
    ADMIN_NAME,
    hashPassword(password),
    'admin',
    nowIso(),
  );

  if (passwordFile) {
    fs.writeFileSync(
      passwordFile,
      `MCPNEXUS first-run administrator\n\nemail: ${ADMIN_EMAIL}\npassword: ${password}\n\nSign in, change this password, then delete this file.\n`,
      { mode: 0o600 },
    );
  }
  run(
    'INSERT INTO audit_log (id, actor_id, actor_email, action, target_type, target_id, detail, ip, created_at) VALUES (?, NULL, ?, ?, ?, NULL, ?, NULL, ?)',
    crypto.randomUUID(),
    'system',
    'platform.bootstrap',
    'platform',
    JSON.stringify({ admin: ADMIN_EMAIL, version: PLATFORM_VERSION, generated }),
    nowIso(),
  );

  return { email: ADMIN_EMAIL, passwordFile };
}

function seedDemoUser() {
  const existing = get('SELECT id FROM users WHERE lower(email) = lower(?)', 'demo@mcpnexus.com');
  if (existing) return;
  run(
    'INSERT INTO users (id, email, name, password_hash, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    'demo@mcpnexus.com',
    'Demo User',
    hashPassword('MCPNexus@Demo2026'),
    'viewer',
    nowIso(),
    null,
  );
}

function seedSettings() {
  if (getSetting('platform.initialised')) return;
  setSetting('platform.initialised', nowIso());
  setSetting('platform.name', 'MCPNEXUS');
  setSetting('platform.version', PLATFORM_VERSION);
  setSetting('mcp.http_token', randomToken(24));
  setSetting('security.require_approval_destructive', 'true');
  setSetting('rate.limit_per_minute', '240');
}

function upsertServer(seed: SeedServer) {
  const existing = get('SELECT id FROM servers WHERE slug = ?', seed.slug);
  if (existing) return;
  const id = crypto.randomUUID();
  run(
    `INSERT INTO servers (id, name, slug, description, transport, command, args, cwd, url, env, headers, tags, enabled, auto_start, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'stopped', ?, ?)`,
    id,
    seed.name,
    seed.slug,
    seed.description,
    seed.transport,
    seed.command ?? null,
    JSON.stringify(seed.args ?? []),
    null,
    seed.url ?? null,
    seed.env ? encryptJson(seed.env) : '',
    seed.headers ? encryptJson(seed.headers) : '',
    JSON.stringify(seed.tags),
    seed.autoStart ? 1 : 0,
    nowIso(),
    nowIso(),
  );
  saveConfigVersion(id, { note: 'Initial seeded configuration' });
}

export function saveConfigVersion(serverId: string, opts: { note?: string; actor?: SessionUser } = {}) {
  const row = get('SELECT * FROM servers WHERE id = ?', serverId);
  if (!row) return;
  const last = get('SELECT MAX(version) AS v FROM config_versions WHERE server_id = ?', serverId);
  const version = (last?.v ?? 0) + 1;
  run(
    'INSERT INTO config_versions (id, server_id, version, config, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    serverId,
    version,
    JSON.stringify({
      name: row.name,
      description: row.description,
      transport: row.transport,
      command: row.command,
      args: JSON.parse(row.args || '[]'),
      url: row.url,
      tags: JSON.parse(row.tags || '[]'),
      enabled: Boolean(row.enabled),
      autoStart: Boolean(row.auto_start),
    }),
    opts.note ?? '',
    opts.actor?.email ?? 'system',
    nowIso(),
  );
}

function seedServers() {
  const node = process.execPath;
  const servers: SeedServer[] = [
    {
      name: 'Nexus Toolbox',
      slug: 'nexus-toolbox',
      description:
        'First-party MCP server with computation, hashing, text analysis, runtime introspection and guarded outbound HTTP.',
      transport: 'stdio',
      command: node,
      args: ['mcp-servers/toolbox.mjs'],
      tags: ['utilities', 'core'],
      autoStart: true,
    },
    {
      name: 'Nexus Filesystem',
      slug: 'nexus-filesystem',
      description:
        'Sandboxed file system MCP server. All reads and writes are confined to the Nexus workspace directory.',
      transport: 'stdio',
      command: node,
      args: ['mcp-servers/filesystem.mjs', `--root=${WORKSPACE_DIR}`],
      tags: ['filesystem', 'local'],
      autoStart: true,
    },
    {
      name: 'Nexus Data',
      slug: 'nexus-data',
      description:
        'SQLite-backed analytics MCP server exposing schema introspection and read-only SQL queries.',
      transport: 'stdio',
      command: node,
      args: ['mcp-servers/data.mjs', `--dir=${path.join(DATA_DIR, 'mcp-data')}`],
      tags: ['database', 'analytics'],
      autoStart: true,
    },
  ];
  for (const server of servers) upsertServer(server);

  // The control plane itself speaks Streamable HTTP, which gives the platform a
  // real remote MCP target for transport testing.
  const token = getSetting('mcp.http_token');
  const controlUrl = `http://127.0.0.1:${PORT}/mcp`;
  const existingControl = get<any>("SELECT id, url FROM servers WHERE slug = 'nexus-control-http'");
  if (existingControl && existingControl.url !== controlUrl) {
    // Reconcile the endpoint when the platform is moved to a different port.
    run(
      'UPDATE servers SET url = ?, status = ?, updated_at = ? WHERE id = ?',
      controlUrl,
      'stopped',
      nowIso(),
      existingControl.id,
    );
  }
  if (token) {
    upsertServer({
      name: 'Nexus Control (HTTP)',
      slug: 'nexus-control-http',
      description:
        'MCPNEXUS exposing itself over the Streamable HTTP transport. Tools report platform state and can execute other servers\' tools.',
      transport: 'http',
      url: `http://127.0.0.1:${PORT}/mcp`,
      headers: { authorization: `Bearer ${token}` },
      tags: ['control-plane', 'http'],
      autoStart: true,
    });
  }
}

function seedPolicies() {
  const count = get<{ c: number }>('SELECT COUNT(*) AS c FROM policies')?.c ?? 0;
  if (count > 0) return;
  const insert = (scope: string, subject: string, permission: string, effect: string, requiresApproval: number, note: string) =>
    run(
      'INSERT INTO policies (id, scope, subject, permission, effect, requires_approval, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      scope,
      subject,
      permission,
      effect,
      requiresApproval,
      note,
      nowIso(),
    );
  insert('role', 'viewer', 'tool:execute', 'deny', 0, 'Viewers can inspect tools but never execute them');
  insert('global', '*', 'tool:execute', 'allow', 0, 'Default allow for roles that hold tool:execute');
  insert('tool', 'sql_query', 'tool:execute', 'allow', 1, 'SQL queries against the analytics database need approval');
  insert('tool', 'write_file', 'tool:execute', 'allow', 1, 'File writes require an administrator decision');
  insert('tool', 'http_fetch', 'tool:execute', 'allow', 1, 'Outbound network access requires approval');
  insert('tag', 'control-plane', 'tool:execute', 'allow', 1, 'Control-plane tools require an approval decision');
}

function seedIntegrations() {
  const catalog = [
    ['github', 'GitHub', 'Source control', 'Repositories, issues and pull requests through the GitHub REST API.'],
    ['filesystem', 'Filesystem', 'Local systems', 'Sandboxed workspace access via the Nexus Filesystem MCP server.'],
    ['database', 'Database', 'Data', 'Read-only SQL against the MCPNEXUS platform database.'],
    ['rest-api', 'REST API', 'External services', 'Call any HTTP JSON endpoint with an optional bearer token.'],
    ['documents', 'Documents', 'Content', 'Extract and summarise text from files in the Nexus workspace.'],
    ['webhook', 'Webhook', 'Automation', 'Deliver signed JSON events to an external endpoint.'],
  ];
  for (const [key, name, category, description] of catalog) {
    if (get('SELECT key FROM integrations WHERE key = ?', key)) continue;
    run(
      'INSERT INTO integrations (key, name, category, description, enabled, config, status, last_checked_at, last_error) VALUES (?, ?, ?, ?, 0, ?, ?, NULL, NULL)',
      key,
      name,
      category,
      description,
      '',
      key === 'filesystem' || key === 'documents' || key === 'database' ? 'available' : 'disconnected',
    );
  }
}

function seedCustomPrompts() {
  if ((get<{ c: number }>('SELECT COUNT(*) AS c FROM custom_prompts')?.c ?? 0) > 0) return;
  const prompts = [
    {
      name: 'Server onboarding checklist',
      category: 'Operations',
      description: 'Validate a newly registered MCP server before giving it to the team.',
      template:
        'Review the MCP server "{{server}}" before enabling it for the team.\n\n1. Confirm the transport and handshake.\n2. List every tool and flag destructive ones.\n3. Check resource and prompt coverage.\n4. Note which tools need approval.\n\nContext: {{context}}',
      args: [
        { name: 'server', description: 'Server name', required: true },
        { name: 'context', description: 'Anything else worth knowing', required: false },
      ],
    },
    {
      name: 'Tool failure triage',
      category: 'Diagnostics',
      description: 'Turn an execution failure into a concrete remediation plan.',
      template:
        'A tool call failed on MCPNEXUS.\n\nServer: {{server}}\nTool: {{tool}}\nError: {{error}}\n\nProduce a ranked list of probable causes, the exact checks to run, and the safest fix to try first.',
      args: [
        { name: 'server', description: 'Server name', required: true },
        { name: 'tool', description: 'Tool name', required: true },
        { name: 'error', description: 'Error output', required: true },
      ],
    },
    {
      name: 'Schema hardening review',
      category: 'Security',
      description: 'Audit a tool schema for missing constraints.',
      template:
        'Audit this JSON schema for a tool called {{tool}}. Return a table of gaps (missing required fields, unbounded strings, free-form objects) and a hardened schema draft.\n\nSchema:\n{{schema}}',
      args: [
        { name: 'tool', description: 'Tool name', required: true },
        { name: 'schema', description: 'JSON schema', required: true },
      ],
    },
  ];
  for (const prompt of prompts) {
    run(
      'INSERT INTO custom_prompts (id, name, category, description, template, arguments, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      prompt.name,
      prompt.category,
      prompt.description,
      prompt.template,
      JSON.stringify(prompt.args),
      'system',
      nowIso(),
      nowIso(),
    );
  }
}

function seedWorkspace() {
  for (const [relative, content] of Object.entries(WORKSPACE_FILES)) {
    const target = path.join(WORKSPACE_DIR, relative);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
}

export function platformFacts() {
  return {
    platformVersion: PLATFORM_VERSION,
    node: process.version,
    platform: os.platform(),
    arch: process.arch,
    dataDir: DATA_DIR,
    workspace: WORKSPACE_DIR,
    servers: all('SELECT id, name, status FROM servers'),
  };
}
