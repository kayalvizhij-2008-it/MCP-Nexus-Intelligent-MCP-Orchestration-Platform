import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests run against a throwaway data directory. Environment must be
 * configured before any server module is imported, so the modules are loaded
 * dynamically inside beforeAll.
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpnexus-test-'));
process.env.MCPNEXUS_DATA_DIR = dataDir;
process.env.MCPNEXUS_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.MCPNEXUS_ADMIN_EMAIL = 'admin@test.local';
process.env.MCPNEXUS_ADMIN_PASSWORD = 'test-admin-password';
process.env.MCPNEXUS_ADMIN_NAME = 'Test Admin';
process.env.MCPNEXUS_PORT = '4399';
process.env.NODE_ENV = 'test';

let app: any;
let agent: any;
let manager: typeof import('../src/server/mcp/manager.js');
let db: typeof import('../src/server/db.js');
let toolboxId = '';
let writeFileToolId = '';
let calculateToolId = '';

beforeAll(async () => {
  const { runMigrations } = await import('../src/server/migrations.js');
  const { seedDatabase } = await import('../src/server/seed.js');
  const { createApp } = await import('../src/server/app.js');
  manager = await import('../src/server/mcp/manager.js');
  db = await import('../src/server/db.js');

  runMigrations();
  seedDatabase();
  app = createApp();
  agent = supertest.agent(app);

  const toolbox = db.get<any>("SELECT id FROM servers WHERE slug = 'nexus-toolbox'");
  toolboxId = toolbox.id;
  await manager.connectServer(toolboxId);

  const calculate = db.get<any>(
    'SELECT id FROM tools WHERE server_id = ? AND name = ?',
    toolboxId,
    'calculate',
  );
  calculateToolId = calculate.id;

  const fsServer = db.get<any>("SELECT id FROM servers WHERE slug = 'nexus-filesystem'");
  await manager.connectServer(fsServer.id);
  const writeFile = db.get<any>(
    'SELECT id FROM tools WHERE server_id = ? AND name = ?',
    fsServer.id,
    'write_file',
  );
  writeFileToolId = writeFile.id;
});

afterAll(async () => {
  await manager.shutdownAll();
  // Close the SQLite handle first; Windows keeps files locked otherwise.
  try {
    (db as any)?.db?.close?.();
  } catch {
    /* already closed */
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* a leftover temp directory is harmless */
  }
});

describe('crypto helpers', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const { hashPassword, verifyPassword } = await import('../src/server/crypto.js');
    const hash = hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('encrypts and decrypts JSON with authenticated encryption', async () => {
    const { encryptJson, decryptJson, maskValue } = await import('../src/server/crypto.js');
    const secret = { API_KEY: 'super-secret-value' };
    const blob = encryptJson(secret);
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain('super-secret-value');
    expect(decryptJson(blob)).toEqual(secret);
    expect(maskValue('super-secret-value')).not.toContain('secret');
  });
});

describe('JSON schema validation', () => {
  it('reports missing required fields', async () => {
    const { validateAgainstSchema } = await import('../src/server/validation.js');
    const issues = validateAgainstSchema(
      { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
      {},
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe('$.expression');
  });

  it('rejects wrong primitive types', async () => {
    const { validateAgainstSchema } = await import('../src/server/validation.js');
    const issues = validateAgainstSchema(
      { type: 'object', properties: { count: { type: 'integer' } } },
      { count: 'three' },
    );
    expect(issues[0]!.message).toContain('Expected integer');
  });
});

describe('authentication', () => {
  it('rejects unauthenticated API access', async () => {
    const response = await supertest(app).get('/api/servers');
    expect(response.status).toBe(401);
    expect(response.body.ok).toBe(false);
  });

  it('rejects invalid credentials', async () => {
    const response = await supertest(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong' });
    expect(response.status).toBe(401);
  });

  it('signs in the seeded administrator and returns permissions', async () => {
    const response = await agent
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'test-admin-password' });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');
    expect(response.body.permissions).toContain('tool:execute');
  });
});

describe('MCP server registry', () => {
  it('lists the seeded servers with discovered primitives', async () => {
    const response = await agent.get('/api/servers');
    expect(response.status).toBe(200);
    const names = response.body.servers.map((server: any) => server.slug);
    expect(names).toContain('nexus-toolbox');
    const toolbox = response.body.servers.find((server: any) => server.slug === 'nexus-toolbox');
    expect(toolbox.counts.tools).toBeGreaterThan(0);
    expect(toolbox.connected).toBe(true);
  });

  it('rejects an invalid STDIO configuration', async () => {
    const response = await agent.post('/api/servers').send({ name: 'Broken', transport: 'stdio' });
    expect(response.status).toBe(400);
  });
});

describe('MCP tool execution', () => {
  it('executes a real tool call over STDIO', async () => {
    const response = await agent
      .post(`/api/tools/${calculateToolId}/execute`)
      .send({ arguments: { expression: '(12+4)*3.5' } });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.execution.text).toContain('56');
    expect(response.body.execution.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('enforces the tool input schema before calling the server', async () => {
    const response = await agent.post(`/api/tools/${calculateToolId}/execute`).send({ arguments: {} });
    expect(response.status).toBe(422);
    expect(response.body.details.issues[0].path).toBe('$.expression');
  });

  it('persists executions and exposes them in the timeline', async () => {
    const response = await agent.get('/api/executions?limit=20');
    expect(response.status).toBe(200);
    expect(response.body.executions.length).toBeGreaterThan(0);
    const match = response.body.executions.find((entry: any) => entry.toolName === 'calculate');
    expect(match).toBeTruthy();
  });
});

describe('approval workflow and RBAC', () => {
  it('parks a sensitive call for approval, then executes it once approved', async () => {
    await agent.post('/api/users').send({
      email: 'operator@test.local',
      name: 'Ops',
      password: 'operator-password',
      role: 'operator',
    });
    const operator = supertest.agent(app);
    const login = await operator
      .post('/api/auth/login')
      .send({ email: 'operator@test.local', password: 'operator-password' });
    expect(login.status).toBe(200);

    const pending = await operator
      .post(`/api/tools/${writeFileToolId}/execute`)
      .send({ arguments: { path: 'notes/test.txt', content: 'written by operator' } });
    expect(pending.status).toBe(202);
    expect(pending.body.status).toBe('pending_approval');
    const approvalId = pending.body.approval.id;

    const decision = await agent.post(`/api/approvals/${approvalId}/decide`).send({ decision: 'approve' });
    expect(decision.status).toBe(200);

    const executed = await operator
      .post(`/api/tools/${writeFileToolId}/execute`)
      .send({
        arguments: { path: 'notes/test.txt', content: 'written by operator' },
        approvalId,
      });
    expect(executed.status).toBe(200);
    expect(executed.body.status).toBe('success');
    expect(fs.existsSync(path.join(dataDir, 'workspace', 'notes', 'test.txt'))).toBe(true);
  });

  it('denies tool execution to viewers', async () => {
    await agent.post('/api/users').send({
      email: 'viewer@test.local',
      name: 'Viewer',
      password: 'viewer-password',
      role: 'viewer',
    });
    const viewer = supertest.agent(app);
    await viewer.post('/api/auth/login').send({ email: 'viewer@test.local', password: 'viewer-password' });
    const response = await viewer
      .post(`/api/tools/${calculateToolId}/execute`)
      .send({ arguments: { expression: '1+1' } });
    expect(response.status).toBe(403);
  });
});

describe('resources and prompts', () => {
  it('reads a resource over MCP', async () => {
    const response = await agent
      .post('/api/resources/read')
      .send({ serverId: toolboxId, uri: 'nexus://toolbox/about' });
    expect(response.status).toBe(200);
    expect(response.body.contents[0].text).toContain('nexus-toolbox');
  });

  it('generates prompt messages with arguments', async () => {
    const response = await agent.post('/api/prompts/preview').send({
      serverId: toolboxId,
      name: 'summarize',
      arguments: { text: 'Control plane payload' },
    });
    expect(response.status).toBe(200);
    expect(response.body.messages[0].content.text).toContain('Control plane payload');
  });
});

describe('observability', () => {
  it('reports real persisted metrics', async () => {
    const response = await agent.get('/api/overview');
    expect(response.status).toBe(200);
    expect(response.body.requests.allTime).toBeGreaterThan(0);
    expect(response.body.servers.total).toBeGreaterThanOrEqual(4);
    expect(response.body.performance.successRate).toBeGreaterThan(0);
  });

  it('records an audit trail for mutations', async () => {
    const response = await agent.get('/api/audit?limit=50');
    expect(response.status).toBe(200);
    const actions = response.body.entries.map((entry: any) => entry.action);
    expect(actions).toContain('tool.executed');
  });
});

describe('server configuration export and import', () => {
  it('exports every server without leaking stored secret values', async () => {
    const created = await agent.post('/api/servers').send({
      name: 'Export Probe',
      transport: 'stdio',
      command: 'node',
      args: ['mcp-servers/toolbox.mjs'],
      env: 'API_TOKEN=super-secret-value\nPLAIN=visible-key-name-only',
    });
    expect(created.status).toBe(201);

    const bundle = await agent.get('/api/servers/export');
    expect(bundle.status).toBe(200);
    expect(bundle.body.schema).toBe('mcpnexus.server-export');
    expect(bundle.body.secretPolicy).toContain('never exported');
    const probe = bundle.body.servers.find((server: any) => server.name === 'Export Probe');
    expect(probe.envKeys.sort()).toEqual(['API_TOKEN', 'PLAIN']);
    expect(JSON.stringify(bundle.body)).not.toContain('super-secret-value');
  });

  it('validates an import without applying it, then applies it', async () => {
    const bundle = {
      schema: 'mcpnexus.server-export',
      version: 1,
      servers: [
        {
          name: 'Imported Toolkit',
          transport: 'stdio',
          command: 'node',
          args: ['mcp-servers/toolbox.mjs'],
          tags: ['imported'],
          autoStart: false,
        },
      ],
    };

    const dry = await agent.post('/api/servers/import').send({ ...bundle, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.summary.created).toBe(1);
    expect(db.get("SELECT id FROM servers WHERE name = 'Imported Toolkit'")).toBeUndefined();

    const applied = await agent.post('/api/servers/import').send({ ...bundle, conflict: 'skip' });
    expect(applied.status).toBe(200);
    expect(applied.body.summary.created).toBe(1);
    expect(db.get("SELECT id FROM servers WHERE name = 'Imported Toolkit'")).toBeTruthy();

    const again = await agent.post('/api/servers/import').send({ ...bundle, conflict: 'skip' });
    expect(again.body.summary.skipped).toBe(1);

    const renamed = await agent.post('/api/servers/import').send({ ...bundle, conflict: 'rename' });
    expect(renamed.body.summary.created).toBe(1);
    expect(renamed.body.results[0].slug).toBe('imported-toolkit-2');
  });

  it('reports per-entry errors for invalid configurations instead of failing silently', async () => {
    const response = await agent.post('/api/servers/import').send({
      servers: [{ name: 'No Command', transport: 'stdio' }, { name: 'Bad Url', transport: 'http', url: 'ftp://example.com' }],
    });
    expect(response.status).toBe(200);
    expect(response.body.summary.invalid).toBe(2);
    expect(response.body.results[0].errors[0]).toContain('require a command');
    expect(response.body.results[1].errors[0]).toContain('http');
  });

  it('rejects an unsupported bundle format', async () => {
    const response = await agent
      .post('/api/servers/import')
      .send({ schema: 'something-else', servers: [{ name: 'X', transport: 'stdio', command: 'node' }] });
    expect(response.status).toBe(400);
  });
});

describe('configuration version diffing', () => {
  it('shows exactly which fields differ from the current configuration', async () => {
    const created = await agent.post('/api/servers').send({
      name: 'Diff Probe',
      description: 'before',
      transport: 'stdio',
      command: 'node',
      args: ['mcp-servers/toolbox.mjs'],
    });
    const id = created.body.server.id;
    await agent.patch(`/api/servers/${id}`).send({ description: 'after', tags: ['changed'] });

    const diff = await agent.get(`/api/servers/${id}/config-versions/1/diff`);
    expect(diff.status).toBe(200);
    const fields = diff.body.changes.map((change: any) => change.field);
    expect(fields).toContain('description');
    expect(diff.body.changes.find((change: any) => change.field === 'description').before).toBe('before');
    expect(diff.body.identical).toBe(false);
  });
});

describe('execution history search, masking and export', () => {
  it('filters by search term and status', async () => {
    const search = await agent.get('/api/executions?q=calculate&limit=10');
    expect(search.status).toBe(200);
    expect(search.body.executions.every((entry: any) => /calculate/i.test(entry.toolName))).toBe(true);
    expect(search.body.total).toBeGreaterThan(0);

    const failed = await agent.get('/api/executions?status=error&limit=5');
    expect(failed.status).toBe(200);
    expect(failed.body.executions.every((entry: any) => entry.status === 'error')).toBe(true);
  });

  it('masks secret-looking argument values', async () => {
    const { maskSecretValues } = await import('../src/server/http.js');
    const masked = maskSecretValues({ token: 'abc123', nested: { password: 'hunter2' }, fine: 'ok' }) as any;
    expect(masked.token).toBe('••••••');
    expect(masked.nested.password).toBe('••••••');
    expect(masked.fine).toBe('ok');
  });

  it('exports execution history as CSV with masked arguments', async () => {
    const response = await agent.get('/api/executions/export');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text.split('\n')[0]).toBe(
      'id,createdAt,server,tool,status,durationMs,actor,approvalId,error,arguments',
    );
    expect(response.text).toContain('calculate');
  });
});

describe('security headers and admin bootstrap', () => {
  it('prevents caching of authenticated API responses', async () => {
    const response = await agent.get('/api/servers');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('has no hardcoded default administrator password', async () => {
    const config = await import('../src/server/config.js');
    expect(config.ADMIN_PASSWORD).toBe('test-admin-password');
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'server', 'config.ts'), 'utf8');
    expect(source).not.toContain('nexus-admin-2026');
  });
});
