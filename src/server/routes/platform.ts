import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  ROLE_MATRIX,
  activeSessions,
  audit,
  can,
  requirePermission,
  type SessionUser,
} from '../auth.js';
import { DATA_DIR, PLATFORM_VERSION, PORT, WORKSPACE_DIR } from '../config.js';
import { encryptJson, hashPassword, maskValue, randomToken } from '../crypto.js';
import { decryptJson } from '../crypto.js';
import { all, get, nowIso, parseJson, run } from '../db.js';
import { ApiError, asyncRoute, intParam } from '../http.js';
import { getSetting, getSettings, setSetting } from '../settings.js';
import { migrationStatus, runMigrations } from '../migrations.js';
import { integrationDefinitions } from '../integrations.js';
import { isConnected } from '../mcp/manager.js';

export const platformRouter = Router();

function sdkVersion(): string {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'),
        'utf8',
      ),
    ).version;
  } catch {
    return 'unknown';
  }
}

platformRouter.get('/meta', (_req, res) => {
  res.json({
    ok: true,
    platform: {
      name: 'MCPNEXUS',
      version: PLATFORM_VERSION,
      tagline: 'Connect. Orchestrate. Secure. Observe.',
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      port: PORT,
      dataDir: DATA_DIR,
      workspace: WORKSPACE_DIR,
    },
    sdk: { name: '@modelcontextprotocol/sdk', version: sdkVersion() },
    transports: ['stdio', 'streamable-http'],
    migrations: migrationStatus(),
  });
});

/* ------------------------------- security ------------------------------- */

platformRouter.get('/security', requirePermission('security:read'), (_req, res) => {
  const now = nowIso();
  const users = all<any>(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions
       FROM users u ORDER BY u.created_at`,
    now,
  ).map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    activeSessions: user.sessions,
  }));

  const servers = all<any>('SELECT id, name, env, headers FROM servers');
  const secretStatus: Array<{ scope: string; name: string; keys: Array<{ key: string; value: string }> }> = [];
  for (const server of servers) {
    const keys = [
      ...Object.keys(decryptJson<Record<string, string>>(server.env)),
      ...Object.keys(decryptJson<Record<string, string>>(server.headers)),
    ];
    if (!keys.length) continue;
    secretStatus.push({
      scope: 'server',
      name: server.name,
      keys: keys.map((key) => ({ key, value: '••••••••' })),
    });
  }
  for (const integration of integrationDefinitions()) {
    const keys = Object.keys(integration.config);
    if (!keys.length) continue;
    secretStatus.push({
      scope: 'integration',
      name: integration.name,
      keys: keys.map((key) => ({ key, value: '••••••••' })),
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    users,
    roles: Object.entries(ROLE_MATRIX).map(([role, permissions]) => ({ role, permissions })),
    sessions: activeSessions().map((session) => ({
      id: session.id,
      email: session.email,
      name: session.name,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      ip: session.ip,
      userAgent: session.user_agent,
    })),
    policies: all<any>('SELECT * FROM policies ORDER BY scope, subject').map((policy) => ({
      id: policy.id,
      scope: policy.scope,
      subject: policy.subject,
      permission: policy.permission,
      effect: policy.effect,
      requiresApproval: Boolean(policy.requires_approval),
      note: policy.note,
      createdAt: policy.created_at,
    })),
    approvals: all<any>('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50').map((approval) => ({
      id: approval.id,
      serverId: approval.server_id,
      toolName: approval.tool_name,
      arguments: parseJson(approval.arguments, {}),
      status: approval.status,
      requestedBy: approval.requested_by_email,
      decidedBy: approval.decided_by,
      decidedAt: approval.decided_at,
      note: approval.note,
      createdAt: approval.created_at,
    })),
    secretStatus,
    events: all<any>(
      `SELECT * FROM audit_log
        WHERE action LIKE 'auth.%' OR action LIKE 'approval.%'
           OR action LIKE 'tool.denied%' OR action LIKE 'security.%' OR action LIKE 'user.%'
        ORDER BY created_at DESC LIMIT 40`,
    ).map((row) => ({
      id: row.id,
      actor: row.actor_email,
      action: row.action,
      detail: parseJson(row.detail, {}),
      ip: row.ip,
      createdAt: row.created_at,
    })),
    tokenConfigured: Boolean(getSetting('mcp.http_token')),
  });
});

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8),
  role: z.enum(['admin', 'operator', 'viewer']),
});

platformRouter.post(
  '/users',
  requirePermission('user:manage'),
  asyncRoute(async (req, res) => {
    const parsed = userSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, 'Invalid user', parsed.error.flatten());
    if (get('SELECT id FROM users WHERE lower(email) = lower(?)', parsed.data.email)) {
      throw new ApiError(409, 'A user with that email already exists');
    }
    const id = crypto.randomUUID();
    run(
      'INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      parsed.data.email.toLowerCase(),
      parsed.data.name,
      hashPassword(parsed.data.password),
      parsed.data.role,
      nowIso(),
    );
    audit(req, 'user.created', 'user', id, { email: parsed.data.email, role: parsed.data.role });
    res.status(201).json({ ok: true, id });
  }),
);

platformRouter.patch(
  '/users/:id',
  requirePermission('user:manage'),
  asyncRoute(async (req, res) => {
    const user = get<any>('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) throw new ApiError(404, 'User not found');
    const role = req.body?.role;
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      throw new ApiError(400, 'role must be admin, operator or viewer');
    }
    if (user.role === 'admin' && role !== 'admin') {
      const admins = get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")?.c ?? 0;
      if (admins <= 1) throw new ApiError(409, 'Cannot demote the last administrator');
    }
    run('UPDATE users SET role = ? WHERE id = ?', role, user.id);
    audit(req, 'user.role_changed', 'user', user.id, { from: user.role, to: role });
    res.json({ ok: true });
  }),
);

platformRouter.delete(
  '/users/:id',
  requirePermission('user:manage'),
  asyncRoute(async (req, res) => {
    const actor = (req as any).user as SessionUser;
    const user = get<any>('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) throw new ApiError(404, 'User not found');
    if (user.id === actor.id) throw new ApiError(400, 'You cannot delete your own account');
    if (user.role === 'admin') {
      const admins = get<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")?.c ?? 0;
      if (admins <= 1) throw new ApiError(409, 'Cannot delete the last administrator');
    }
    run('DELETE FROM users WHERE id = ?', user.id);
    audit(req, 'user.deleted', 'user', user.id, { email: user.email });
    res.json({ ok: true });
  }),
);

platformRouter.delete(
  '/security/sessions/:id',
  requirePermission('user:manage'),
  asyncRoute(async (req, res) => {
    const session = get<any>('SELECT * FROM sessions WHERE id = ?', req.params.id);
    if (!session) throw new ApiError(404, 'Session not found');
    run('DELETE FROM sessions WHERE id = ?', session.id);
    audit(req, 'security.session_revoked', 'session', session.id);
    res.json({ ok: true });
  }),
);

const policySchema = z.object({
  scope: z.enum(['global', 'role', 'user', 'server', 'tool', 'tag']),
  subject: z.string().min(1).max(120),
  permission: z.string().min(3).max(40),
  effect: z.enum(['allow', 'deny']),
  requiresApproval: z.boolean().optional(),
  note: z.string().max(300).optional(),
});

platformRouter.post(
  '/policies',
  requirePermission('security:manage'),
  asyncRoute(async (req, res) => {
    const parsed = policySchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, 'Invalid policy', parsed.error.flatten());
    const id = crypto.randomUUID();
    run(
      'INSERT INTO policies (id, scope, subject, permission, effect, requires_approval, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      parsed.data.scope,
      parsed.data.subject,
      parsed.data.permission,
      parsed.data.effect,
      parsed.data.requiresApproval ? 1 : 0,
      parsed.data.note ?? '',
      nowIso(),
    );
    audit(req, 'security.policy_created', 'policy', id, parsed.data);
    res.status(201).json({ ok: true, id });
  }),
);

platformRouter.delete(
  '/policies/:id',
  requirePermission('security:manage'),
  asyncRoute(async (req, res) => {
    const policy = get<any>('SELECT * FROM policies WHERE id = ?', req.params.id);
    if (!policy) throw new ApiError(404, 'Policy not found');
    run('DELETE FROM policies WHERE id = ?', policy.id);
    audit(req, 'security.policy_deleted', 'policy', policy.id, { note: policy.note });
    res.json({ ok: true });
  }),
);

/* ------------------------------- settings ------------------------------- */

const EDITABLE_SETTINGS = [
  'platform.name',
  'security.require_approval_destructive',
  'rate.limit_per_minute',
];

platformRouter.get('/settings', requirePermission('security:read'), (_req, res) => {
  const settings = getSettings();
  const token = getSetting('mcp.http_token');
  res.json({
    ok: true,
    settings: {
      'platform.name': settings['platform.name'] ?? 'MCPNEXUS',
      'security.require_approval_destructive':
        settings['security.require_approval_destructive'] ?? 'true',
      'rate.limit_per_minute': settings['rate.limit_per_minute'] ?? '240',
    },
    secret: { mcpHttpToken: token ? maskValue(token) : null },
    editableKeys: EDITABLE_SETTINGS,
    runtime: { dataDir: DATA_DIR, workspace: WORKSPACE_DIR, port: PORT },
  });
});

platformRouter.put(
  '/settings',
  requirePermission('user:manage'),
  asyncRoute(async (req, res) => {
    const updates = req.body ?? {};
    const applied: string[] = [];
    for (const key of EDITABLE_SETTINGS) {
      if (key in updates) {
        setSetting(key, String(updates[key]));
        applied.push(key);
      }
    }
    if (!applied.length) {
      throw new ApiError(400, `No editable settings supplied (${EDITABLE_SETTINGS.join(', ')})`);
    }
    audit(req, 'settings.updated', 'settings', null, { keys: applied });
    res.json({ ok: true, applied });
  }),
);

platformRouter.post(
  '/settings/rotate-mcp-token',
  requirePermission('user:manage'),
  asyncRoute(async (req, res) => {
    const token = randomToken(24);
    setSetting('mcp.http_token', token);
    const control = get<any>("SELECT id FROM servers WHERE slug = 'nexus-control-http'");
    if (control) {
      run(
        'UPDATE servers SET headers = ?, updated_at = ? WHERE id = ?',
        encryptJson({ authorization: `Bearer ${token}` }),
        nowIso(),
        control.id,
      );
    }
    audit(req, 'security.token_rotated', 'settings', null, { controlServer: Boolean(control) });
    res.json({
      ok: true,
      token: maskValue(token),
      note: control
        ? 'Token rotated. Restart "Nexus Control (HTTP)" so the new bearer token is used.'
        : 'Token rotated.',
    });
  }),
);

/* ------------------------------ playground ------------------------------ */

const ENDPOINT_CATALOG = [
  { method: 'GET', path: '/api/overview', description: 'Dashboard aggregates', permission: 'observability:read' },
  { method: 'GET', path: '/api/servers', description: 'Registered MCP servers', permission: 'server:read' },
  { method: 'GET', path: '/api/servers/:id', description: 'Server detail with primitives', permission: 'server:read' },
  { method: 'GET', path: '/api/tools', description: 'All discovered tools', permission: 'tool:read' },
  { method: 'POST', path: '/api/tools/:id/execute', description: 'Execute a real MCP tool', permission: 'tool:execute' },
  { method: 'GET', path: '/api/resources', description: 'All discovered resources', permission: 'resource:read' },
  { method: 'POST', path: '/api/resources/read', description: 'Read a resource URI', permission: 'resource:read' },
  { method: 'GET', path: '/api/prompts', description: 'Server prompts', permission: 'prompt:read' },
  { method: 'GET', path: '/api/custom-prompts', description: 'Custom prompt templates', permission: 'prompt:read' },
  { method: 'GET', path: '/api/observability', description: 'Time series and latency percentiles', permission: 'observability:read' },
  { method: 'GET', path: '/api/audit', description: 'Audit trail', permission: 'audit:read' },
  { method: 'GET', path: '/api/security', description: 'Users, policies, sessions', permission: 'security:read' },
  { method: 'GET', path: '/api/integrations', description: 'Integration status', permission: 'integration:read' },
  { method: 'GET', path: '/api/meta', description: 'Platform and runtime metadata', permission: 'authenticated' },
  { method: 'GET', path: '/api/deployments', description: 'Deployment readiness history', permission: 'deployment:read' },
];

platformRouter.get('/playground/endpoints', requirePermission('server:read'), (req, res) => {
  const user = (req as any).user as SessionUser;
  res.json({
    ok: true,
    endpoints: ENDPOINT_CATALOG.map((endpoint) => ({
      ...endpoint,
      allowed:
        endpoint.permission === 'authenticated' ? true : can(user, endpoint.permission as any),
    })),
  });
});

platformRouter.post(
  '/playground/request',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const method = String(req.body?.method ?? 'GET').toUpperCase();
    const target = String(req.body?.path ?? '');
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      throw new ApiError(400, 'Unsupported method');
    }
    if (!target.startsWith('/api/')) throw new ApiError(400, 'Path must start with /api/');
    const started = Date.now();
    const response = await fetch(`http://127.0.0.1:${PORT}${target}`, {
      method,
      headers: { cookie: req.headers.cookie ?? '', 'content-type': 'application/json' },
      body: ['POST', 'PATCH', 'PUT'].includes(method)
        ? JSON.stringify(req.body?.body ?? {})
        : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* raw text */
    }
    audit(req, 'playground.request', 'api', target, { method, status: response.status });
    res.json({
      ok: true,
      response: {
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - started,
        contentType: response.headers.get('content-type'),
        body,
        truncated: text.length > 40000,
      },
    });
  }),
);

/* ----------------------------- deployments ----------------------------- */

platformRouter.get('/deployments', requirePermission('deployment:read'), (_req, res) => {
  res.json({
    ok: true,
    deployments: all<any>('SELECT * FROM deployments ORDER BY created_at DESC LIMIT 50').map((row) => ({
      id: row.id,
      environment: row.environment,
      version: row.version,
      status: row.status,
      checks: parseJson(row.checks, []),
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })),
    environments: [
      {
        name: 'local',
        url: `http://localhost:${PORT}`,
        description: 'Node.js process serving the API and the built SPA',
      },
      {
        name: 'production',
        url: null,
        description: 'npm run build && npm start behind your reverse proxy',
      },
    ],
  });
});

platformRouter.post(
  '/deployments',
  requirePermission('deployment:manage'),
  asyncRoute(async (req, res) => {
    const environment = String(req.body?.environment ?? 'local');
    const notes = String(req.body?.notes ?? '').slice(0, 500);
    const servers = all<any>('SELECT * FROM servers');
    const migrations = migrationStatus();
    const checks = [
      {
        name: 'Node runtime',
        ok: Number(process.versions.node.split('.')[0]) >= 22,
        detail: `Node ${process.version}`,
      },
      {
        name: 'Database reachable',
        ok: Boolean(get('SELECT 1 AS ok')),
        detail: `${all<any>("SELECT name FROM sqlite_master WHERE type='table'").length} tables in ${DATA_DIR}`,
      },
      {
        name: 'Migrations applied',
        ok: migrations.length > 0,
        detail: `${migrations.length} migration(s) recorded`,
      },
      {
        name: 'MCP SDK installed',
        ok: sdkVersion() !== 'unknown',
        detail: `@modelcontextprotocol/sdk ${sdkVersion()}`,
      },
      {
        name: 'MCP servers configured',
        ok: servers.length > 0,
        detail: `${servers.length} registered · ${servers.filter((s) => isConnected(s.id)).length} connected`,
      },
      {
        name: 'Administrator account',
        ok: Boolean(get("SELECT id FROM users WHERE role = 'admin'")),
        detail: 'At least one administrator exists',
      },
      {
        name: 'Workspace writable',
        ok: fs.existsSync(WORKSPACE_DIR),
        detail: WORKSPACE_DIR,
      },
      {
        name: 'Web build present',
        ok: fs.existsSync(path.join(process.cwd(), 'dist', 'web', 'index.html')),
        detail: 'dist/web/index.html',
      },
    ];
    const failed = checks.filter((check) => !check.ok);
    const status = failed.length === 0 ? 'ready' : failed.length > 2 ? 'blocked' : 'degraded';
    const id = crypto.randomUUID();
    run(
      'INSERT INTO deployments (id, environment, version, status, checks, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      environment,
      PLATFORM_VERSION,
      status,
      JSON.stringify(checks),
      notes,
      (req as any).user?.email ?? 'system',
      nowIso(),
    );
    audit(req, 'deployment.checked', 'deployment', id, { environment, status });
    res.status(201).json({
      ok: true,
      deployment: { id, environment, status, checks, notes, createdAt: nowIso() },
    });
  }),
);

platformRouter.get('/deployments/manifest', requirePermission('deployment:read'), (_req, res) => {
  const servers = all<any>('SELECT * FROM servers ORDER BY name').map((row) => ({
    name: row.name,
    slug: row.slug,
    transport: row.transport,
    command: row.command,
    args: parseJson(row.args, []),
    url: row.url,
    tags: parseJson(row.tags, []),
    enabled: Boolean(row.enabled),
    autoStart: Boolean(row.auto_start),
    envKeys: Object.keys(decryptJson<Record<string, string>>(row.env)),
    headerKeys: Object.keys(decryptJson<Record<string, string>>(row.headers)),
  }));
  res.setHeader('Content-Disposition', 'attachment; filename="mcpnexus-manifest.json"');
  res.json({
    format: 'mcpnexus/manifest@1',
    generatedAt: nowIso(),
    platformVersion: PLATFORM_VERSION,
    secretsIncluded: false,
    migrations: migrationStatus(),
    servers,
  });
});

platformRouter.get('/migrations', requirePermission('deployment:read'), (_req, res) => {
  res.json({ ok: true, migrations: migrationStatus() });
});

platformRouter.post('/migrations/run', requirePermission('deployment:manage'), (req, res) => {
  const result = runMigrations();
  audit(req, 'migrations.run', 'platform', null, result);
  res.json({ ok: true, ...result, migrations: migrationStatus() });
});

void intParam;
