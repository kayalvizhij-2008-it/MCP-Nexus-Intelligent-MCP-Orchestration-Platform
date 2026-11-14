import { Router } from 'express';
import { z } from 'zod';
import { audit, can, evaluatePolicies, requirePermission, type SessionUser } from '../auth.js';
import { decryptJson, encryptJson } from '../crypto.js';
import { all, get, logServer, nowIso, parseJson, run } from '../db.js';
import { diagnose, diagnosticHistory } from '../diagnostics.js';
import { inspectCompatibility } from '../compat.js';
import {
  ApiError,
  asyncRoute,
  intParam,
  parseEnvText,
  parseHeaderText,
  slugify,
} from '../http.js';
import {
  capabilitiesOf,
  connectServer,
  disconnectServer,
  getServerRow,
  isConnected,
  restartServer,
  runHealthCheck,
  type ServerRow,
} from '../mcp/manager.js';
import { healthHistory } from '../metrics.js';
import { saveConfigVersion } from '../seed.js';

export const serversRouter = Router();

export function serverDto(row: ServerRow) {
  const tools = get<{ c: number }>('SELECT COUNT(*) AS c FROM tools WHERE server_id = ?', row.id)?.c ?? 0;
  const resources = get<{ c: number }>('SELECT COUNT(*) AS c FROM resources WHERE server_id = ?', row.id)?.c ?? 0;
  const prompts = get<{ c: number }>('SELECT COUNT(*) AS c FROM prompts WHERE server_id = ?', row.id)?.c ?? 0;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    transport: row.transport,
    command: row.command,
    args: parseJson<string[]>(row.args, []),
    cwd: row.cwd,
    url: row.url,
    tags: parseJson<string[]>(row.tags, []),
    enabled: Boolean(row.enabled),
    autoStart: Boolean(row.auto_start),
    status: row.status,
    statusMessage: row.status_message,
    lastError: row.last_error,
    capabilities: capabilitiesOf(row),
    serverInfo: parseJson<Record<string, unknown>>(row.server_info, {}),
    protocolVersion: row.protocol_version,
    lastConnectedAt: row.last_connected_at,
    lastHealthAt: row.last_health_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connected: isConnected(row.id),
    counts: { tools, resources, prompts },
    envKeys: Object.keys(decryptJson<Record<string, string>>(row.env)),
    headerKeys: Object.keys(decryptJson<Record<string, string>>(row.headers)),
  };
}

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(600).optional(),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional().nullable(),
  args: z.union([z.array(z.string()), z.string()]).optional(),
  cwd: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  env: z.string().optional(),
  headers: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  autoStart: z.boolean().optional(),
});

function normalizeArgs(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === 'string' && input.trim()) {
    return input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

serversRouter.get('/', requirePermission('server:read'), (_req, res) => {
  const rows = all<ServerRow>('SELECT * FROM servers ORDER BY name');
  res.json({ ok: true, servers: rows.map(serverDto) });
});

serversRouter.post(
  '/',
  requirePermission('server:manage'),
  asyncRoute(async (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid server configuration', parsed.error.flatten());
    }
    const input = parsed.data;
    if (input.transport === 'stdio' && !input.command?.trim()) {
      throw new ApiError(400, 'A command is required for STDIO servers');
    }
    if (input.transport === 'http') {
      if (!input.url?.trim()) throw new ApiError(400, 'A URL is required for HTTP servers');
      try {
        const url = new URL(input.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
      } catch {
        throw new ApiError(400, 'URL must be an absolute http(s) endpoint');
      }
    }

    let slug = slugify(input.name);
    let suffix = 2;
    while (get('SELECT id FROM servers WHERE slug = ?', slug)) {
      slug = `${slugify(input.name)}-${suffix++}`;
    }

    const id = crypto.randomUUID();
    const envMap = parseEnvText(input.env);
    const headerMap = parseHeaderText(input.headers);
    run(
      `INSERT INTO servers (id, name, slug, description, transport, command, args, cwd, url, env, headers, tags, enabled, auto_start, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?)`,
      id,
      input.name.trim(),
      slug,
      input.description?.trim() ?? '',
      input.transport,
      input.transport === 'stdio' ? input.command?.trim() ?? null : null,
      JSON.stringify(normalizeArgs(input.args)),
      input.cwd?.trim() || null,
      input.transport === 'http' ? input.url?.trim() ?? null : null,
      Object.keys(envMap).length ? encryptJson(envMap) : '',
      Object.keys(headerMap).length ? encryptJson(headerMap) : '',
      JSON.stringify(input.tags ?? []),
      input.enabled === false ? 0 : 1,
      input.autoStart ? 1 : 0,
      nowIso(),
      nowIso(),
    );
    saveConfigVersion(id, { note: 'Created server', actor: (req as any).user });
    audit(req, 'server.created', 'server', id, { name: input.name, transport: input.transport });

    if (input.autoStart) {
      try {
        await connectServer(id);
      } catch {
        /* status and error are persisted by the manager */
      }
    }
    res.status(201).json({ ok: true, server: serverDto(getServerRow(id)!) });
  }),
);

/** A portable, secret-free description of one server. Values are never exported, only key names. */
function exportableServer(row: ServerRow) {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description,
    transport: row.transport,
    command: row.command,
    args: parseJson<string[]>(row.args, []),
    cwd: row.cwd,
    url: row.url,
    tags: parseJson<string[]>(row.tags, []),
    enabled: Boolean(row.enabled),
    autoStart: Boolean(row.auto_start),
    envKeys: Object.keys(decryptJson<Record<string, string>>(row.env)),
    headerKeys: Object.keys(decryptJson<Record<string, string>>(row.headers)),
  };
}

const EXPORT_FORMAT = 'mcpnexus.server-export';
const EXPORT_VERSION = 1;

serversRouter.get('/export', requirePermission('server:read'), (_req, res) => {
  const rows = all<ServerRow>('SELECT * FROM servers ORDER BY name');
  res.json({
    schema: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: nowIso(),
    secretPolicy: 'env and header VALUES are never exported; only their key names are listed',
    servers: rows.map(exportableServer),
  });
});

const importEntrySchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().max(60).optional(),
  description: z.string().max(600).optional(),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional().nullable(),
  args: z.union([z.array(z.string()), z.string()]).optional(),
  cwd: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  env: z.union([z.record(z.string()), z.string()]).optional(),
  headers: z.union([z.record(z.string()), z.string()]).optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  autoStart: z.boolean().optional(),
});

const importSchema = z.object({
  schema: z.string().optional(),
  version: z.number().optional(),
  servers: z.array(z.unknown()).min(1).max(50),
  dryRun: z.boolean().optional(),
  conflict: z.enum(['skip', 'overwrite', 'rename']).optional(),
});

function mapToEnvText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    return Object.entries(input as Record<string, string>)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }
  return '';
}

function mapToHeaderText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    return Object.entries(input as Record<string, string>)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }
  return '';
}

serversRouter.post(
  '/import',
  requirePermission('server:manage'),
  asyncRoute(async (req, res) => {
    const parsed = importSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'Import payload is not a valid MCPNEXUS bundle', parsed.error.flatten());
    }
    if (parsed.data.schema && parsed.data.schema !== EXPORT_FORMAT) {
      throw new ApiError(400, `Unsupported bundle format "${parsed.data.schema}"`);
    }
    if (parsed.data.version && parsed.data.version > EXPORT_VERSION) {
      throw new ApiError(400, `Bundle version ${parsed.data.version} is newer than this platform supports`);
    }

    const dryRun = parsed.data.dryRun === true;
    const conflict = parsed.data.conflict ?? 'skip';
    const results: Array<Record<string, unknown>> = [];
    const summary = { created: 0, overwritten: 0, skipped: 0, invalid: 0 };

    for (const [index, entry] of parsed.data.servers.entries()) {
      const candidate = importEntrySchema.safeParse(entry);
      const label =
        entry && typeof entry === 'object' && typeof (entry as any).name === 'string'
          ? (entry as any).name
          : `entry ${index + 1}`;
      if (!candidate.success) {
        summary.invalid += 1;
        results.push({
          index,
          name: label,
          action: 'invalid',
          errors: candidate.error.issues.map((issue) => `${issue.path.join('.') || 'entry'}: ${issue.message}`),
        });
        continue;
      }
      const input = candidate.data;
      const errors: string[] = [];
      if (input.transport === 'stdio' && !input.command?.trim()) {
        errors.push('stdio servers require a command');
      }
      if (input.transport === 'http') {
        try {
          const url = new URL(String(input.url ?? ''));
          if (!['http:', 'https:'].includes(url.protocol)) errors.push('url must use http or https');
        } catch {
          errors.push('http servers require an absolute url');
        }
      }
      if (errors.length) {
        summary.invalid += 1;
        results.push({ index, name: label, action: 'invalid', errors });
        continue;
      }

      const baseSlug = slugify(input.slug || input.name);
      const existing = get<ServerRow>('SELECT * FROM servers WHERE slug = ?', baseSlug);
      const envMap = parseEnvText(mapToEnvText(input.env));
      const headerMap = parseHeaderText(mapToHeaderText(input.headers));
      const args = normalizeArgs(input.args);

      if (existing && conflict === 'skip') {
        summary.skipped += 1;
        results.push({ index, name: label, slug: baseSlug, action: 'skipped', reason: 'slug already exists' });
        continue;
      }

      if (dryRun) {
        const action = existing ? (conflict === 'overwrite' ? 'overwrite' : 'rename') : 'create';
        if (action === 'overwrite') summary.overwritten += 1;
        else summary.created += 1;
        results.push({ index, name: label, slug: baseSlug, action, dryRun: true });
        continue;
      }

      if (existing && conflict === 'overwrite') {
        if (isConnected(existing.id)) await disconnectServer(existing.id);
        run(
          `UPDATE servers SET name = ?, description = ?, transport = ?, command = ?, args = ?, cwd = ?, url = ?, env = ?, headers = ?, tags = ?, enabled = ?, auto_start = ?, status = 'stopped', updated_at = ? WHERE id = ?`,
          input.name.trim(),
          input.description?.trim() ?? '',
          input.transport,
          input.transport === 'stdio' ? input.command?.trim() ?? null : null,
          JSON.stringify(args),
          input.cwd?.trim() || null,
          input.transport === 'http' ? input.url?.trim() ?? null : null,
          Object.keys(envMap).length ? encryptJson(envMap) : existing.env,
          Object.keys(headerMap).length ? encryptJson(headerMap) : existing.headers,
          JSON.stringify(input.tags ?? []),
          input.enabled === false ? 0 : 1,
          input.autoStart ? 1 : 0,
          nowIso(),
          existing.id,
        );
        saveConfigVersion(existing.id, { note: 'Imported configuration (overwrite)', actor: (req as any).user });
        summary.overwritten += 1;
        results.push({ index, name: label, slug: baseSlug, action: 'overwrite', id: existing.id });
        continue;
      }

      let slug = baseSlug;
      if (existing) {
        let suffix = 2;
        while (get('SELECT id FROM servers WHERE slug = ?', `${baseSlug}-${suffix}`)) suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }

      const id = crypto.randomUUID();
      run(
        `INSERT INTO servers (id, name, slug, description, transport, command, args, cwd, url, env, headers, tags, enabled, auto_start, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?)`,
        id,
        input.name.trim(),
        slug,
        input.description?.trim() ?? '',
        input.transport,
        input.transport === 'stdio' ? input.command?.trim() ?? null : null,
        JSON.stringify(args),
        input.cwd?.trim() || null,
        input.transport === 'http' ? input.url?.trim() ?? null : null,
        Object.keys(envMap).length ? encryptJson(envMap) : '',
        Object.keys(headerMap).length ? encryptJson(headerMap) : '',
        JSON.stringify(input.tags ?? []),
        input.enabled === false ? 0 : 1,
        input.autoStart ? 1 : 0,
        nowIso(),
        nowIso(),
      );
      saveConfigVersion(id, { note: 'Imported configuration', actor: (req as any).user });
      summary.created += 1;
      results.push({ index, name: label, slug, action: 'create', id });
    }

    if (!dryRun) {
      audit(req, 'server.imported', 'server', null, {
        summary,
        conflict,
        names: results.map((entry) => entry.name),
      });
    }
    res.json({ ok: true, dryRun, conflict, summary, results });
  }),
);

serversRouter.get(
  '/:id/export',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    res.json({
      schema: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: nowIso(),
      secretPolicy: 'env and header VALUES are never exported; only their key names are listed',
      servers: [exportableServer(row)],
    });
  }),
);

serversRouter.get(
  '/:id/config-versions/:version/diff',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const version = get<any>(
      'SELECT * FROM config_versions WHERE server_id = ? AND version = ?',
      row.id,
      Number(req.params.version),
    );
    if (!version) throw new ApiError(404, 'Configuration version not found');

    const before = parseJson<Record<string, unknown>>(version.config, {});
    const current = exportableServer(row);
    const fields = ['name', 'description', 'transport', 'command', 'args', 'cwd', 'url', 'tags', 'enabled', 'autoStart'];
    const changes = fields
      .map((field) => ({
        field,
        before: before[field] ?? null,
        after: (current as Record<string, unknown>)[field] ?? null,
      }))
      .filter((change) => JSON.stringify(change.before) !== JSON.stringify(change.after));

    res.json({
      ok: true,
      version: version.version,
      createdAt: version.created_at,
      createdBy: version.created_by,
      note: version.note,
      changes,
      identical: changes.length === 0,
    });
  }),
);

serversRouter.get(
  '/:id',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    res.json({
      ok: true,
      server: serverDto(row),
      tools: all<any>('SELECT * FROM tools WHERE server_id = ? ORDER BY name', row.id).map((tool) => ({
        id: tool.id,
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: parseJson(tool.input_schema, {}),
        enabled: Boolean(tool.enabled),
        requiresApproval: Boolean(tool.requires_approval),
        discoveredAt: tool.discovered_at,
      })),
      resources: all<any>('SELECT * FROM resources WHERE server_id = ? ORDER BY uri', row.id).map((resource) => ({
        id: resource.id,
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mime_type,
        isTemplate: Boolean(resource.is_template),
        discoveredAt: resource.discovered_at,
      })),
      prompts: all<any>('SELECT * FROM prompts WHERE server_id = ? ORDER BY name', row.id).map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        arguments: parseJson(prompt.arguments, []),
        discoveredAt: prompt.discovered_at,
      })),
    });
  }),
);

serversRouter.patch(
  '/:id',
  requirePermission('server:manage'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const body = req.body ?? {};
    const updates: string[] = [];
    const values: any[] = [];
    const configChanged: string[] = [];

    if (typeof body.name === 'string' && body.name.trim() && body.name !== row.name) {
      updates.push('name = ?');
      values.push(body.name.trim());
      configChanged.push('name');
    }
    if (typeof body.description === 'string') {
      updates.push('description = ?');
      values.push(body.description);
      configChanged.push('description');
    }
    if (body.transport === 'stdio' || body.transport === 'http') {
      if (body.transport !== row.transport) {
        updates.push('transport = ?');
        values.push(body.transport);
        configChanged.push('transport');
      }
    }
    if (body.command !== undefined) {
      updates.push('command = ?');
      values.push(body.command ? String(body.command).trim() : null);
      configChanged.push('command');
    }
    if (body.args !== undefined) {
      updates.push('args = ?');
      values.push(JSON.stringify(normalizeArgs(body.args)));
      configChanged.push('args');
    }
    if (body.url !== undefined) {
      const url = body.url ? String(body.url).trim() : null;
      if (url) {
        try {
          const parsedUrl = new URL(url);
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('bad protocol');
        } catch {
          throw new ApiError(400, 'URL must be an absolute http(s) endpoint');
        }
      }
      updates.push('url = ?');
      values.push(url);
      configChanged.push('url');
    }
    if (body.cwd !== undefined) {
      updates.push('cwd = ?');
      values.push(body.cwd ? String(body.cwd).trim() : null);
      configChanged.push('cwd');
    }
    if (typeof body.env === 'string') {
      const envMap = parseEnvText(body.env);
      updates.push('env = ?');
      values.push(Object.keys(envMap).length ? encryptJson(envMap) : '');
      configChanged.push('env');
    }
    if (typeof body.headers === 'string') {
      const headerMap = parseHeaderText(body.headers);
      updates.push('headers = ?');
      values.push(Object.keys(headerMap).length ? encryptJson(headerMap) : '');
      configChanged.push('headers');
    }
    if (Array.isArray(body.tags)) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags.map(String)));
      configChanged.push('tags');
    }
    if (typeof body.enabled === 'boolean') {
      updates.push('enabled = ?');
      values.push(body.enabled ? 1 : 0);
      if (!body.enabled && isConnected(row.id)) await disconnectServer(row.id);
    }
    if (typeof body.autoStart === 'boolean') {
      updates.push('auto_start = ?');
      values.push(body.autoStart ? 1 : 0);
    }

    if (!updates.length) throw new ApiError(400, 'No supported fields were supplied');

    updates.push('updated_at = ?');
    values.push(nowIso());
    run(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`, ...values, row.id);
    if (configChanged.length) {
      saveConfigVersion(row.id, {
        note: `Updated ${configChanged.join(', ')}`,
        actor: (req as any).user,
      });
    }
    audit(req, 'server.updated', 'server', row.id, { fields: configChanged });
    res.json({
      ok: true,
      server: serverDto(getServerRow(row.id)!),
      restartRequired: configChanged.length > 0 && isConnected(row.id),
    });
  }),
);

serversRouter.delete(
  '/:id',
  requirePermission('server:manage'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    await disconnectServer(row.id);
    run('DELETE FROM servers WHERE id = ?', row.id);
    audit(req, 'server.deleted', 'server', row.id, { name: row.name });
    res.json({ ok: true });
  }),
);

for (const action of ['start', 'stop', 'restart'] as const) {
  serversRouter.post(
    `/:id/${action}`,
    requirePermission('server:manage'),
    asyncRoute(async (req, res) => {
      const row = getServerRow(req.params.id);
      if (!row) throw new ApiError(404, 'Server not found');
      audit(req, `server.${action}`, 'server', row.id, { name: row.name });
      try {
        if (action === 'start') await connectServer(row.id);
        else if (action === 'stop') await disconnectServer(row.id);
        else await restartServer(row.id);
      } catch (error: any) {
        logServer(row.id, 'error', `${action} failed: ${error?.message ?? error}`);
        throw new ApiError(502, error?.message ?? `${action} failed`, {
          server: serverDto(getServerRow(row.id)!),
        });
      }
      res.json({ ok: true, server: serverDto(getServerRow(row.id)!) });
    }),
  );
}

serversRouter.get(
  '/:id/logs',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const limit = intParam(req.query.limit, 200, 500);
    const logs = all<any>(
      'SELECT id, level, message, created_at FROM server_logs WHERE server_id = ? ORDER BY created_at DESC LIMIT ?',
      row.id,
      limit,
    ).map((entry) => ({
      id: entry.id,
      level: entry.level,
      message: entry.message,
      createdAt: entry.created_at,
    }));
    res.json({ ok: true, logs });
  }),
);

serversRouter.get(
  '/:id/health',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    res.json({
      ok: true,
      connected: isConnected(row.id),
      status: row.status,
      history: healthHistory(row.id),
      lastCheckedAt: row.last_health_at,
    });
  }),
);

serversRouter.post(
  '/:id/health-check',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const result = await runHealthCheck(row.id);
    res.json({ ok: true, result, history: healthHistory(row.id) });
  }),
);

serversRouter.get(
  '/:id/diagnostics',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const report = await diagnose(row.id);
    res.json({ ok: true, report, history: diagnosticHistory(row.id) });
  }),
);

serversRouter.get(
  '/:id/compatibility',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    res.json({ ok: true, report: inspectCompatibility(row.id) });
  }),
);

serversRouter.get(
  '/:id/config-versions',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const versions = all<any>(
      'SELECT id, version, config, note, created_by, created_at FROM config_versions WHERE server_id = ? ORDER BY version DESC',
      row.id,
    ).map((entry) => ({
      id: entry.id,
      version: entry.version,
      config: parseJson(entry.config, {}),
      note: entry.note,
      createdBy: entry.created_by,
      createdAt: entry.created_at,
    }));
    res.json({ ok: true, versions });
  }),
);

serversRouter.post(
  '/:id/config-versions/:version/restore',
  requirePermission('server:manage'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const version = get<any>(
      'SELECT * FROM config_versions WHERE server_id = ? AND version = ?',
      row.id,
      Number(req.params.version),
    );
    if (!version) throw new ApiError(404, 'Configuration version not found');
    const config = parseJson<any>(version.config, {});
    if (isConnected(row.id)) await disconnectServer(row.id);
    run(
      `UPDATE servers SET name = ?, description = ?, transport = ?, command = ?, args = ?, url = ?, tags = ?, enabled = ?, auto_start = ?, status = 'stopped', updated_at = ? WHERE id = ?`,
      config.name ?? row.name,
      config.description ?? '',
      config.transport ?? row.transport,
      config.command ?? null,
      JSON.stringify(config.args ?? []),
      config.url ?? null,
      JSON.stringify(config.tags ?? []),
      config.enabled ? 1 : 0,
      config.autoStart ? 1 : 0,
      nowIso(),
      row.id,
    );
    saveConfigVersion(row.id, {
      note: `Restored version ${version.version}`,
      actor: (req as any).user,
    });
    audit(req, 'server.config_restored', 'server', row.id, { version: version.version });
    res.json({ ok: true, server: serverDto(getServerRow(row.id)!) });
  }),
);

serversRouter.get(
  '/:id/analytics',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const totals = get<any>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS failed,
              AVG(duration_ms) AS avg_ms
         FROM executions WHERE server_id = ? AND created_at >= ?`,
      row.id,
      since,
    );
    const buckets = all<any>(
      `SELECT substr(created_at, 1, 13) AS bucket, COUNT(*) AS total,
              SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS failed
         FROM executions WHERE server_id = ? AND created_at >= ?
        GROUP BY bucket ORDER BY bucket`,
      row.id,
      since,
    );
    res.json({
      ok: true,
      totals: {
        calls24h: totals?.total ?? 0,
        failed24h: totals?.failed ?? 0,
        avgLatencyMs: totals?.avg_ms ? Math.round(totals.avg_ms) : null,
        allTime:
          get<{ c: number }>('SELECT COUNT(*) AS c FROM executions WHERE server_id = ?', row.id)?.c ?? 0,
      },
      buckets,
      tools: all<any>(
        `SELECT tool_name AS name, COUNT(*) AS calls,
                SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS failures,
                ROUND(AVG(duration_ms)) AS avg_ms
           FROM executions WHERE server_id = ? GROUP BY tool_name ORDER BY calls DESC`,
        row.id,
      ),
      recent: all<any>(
        'SELECT * FROM executions WHERE server_id = ? ORDER BY created_at DESC LIMIT 20',
        row.id,
      ),
      health: healthHistory(row.id, 60),
    });
  }),
);

serversRouter.get(
  '/:id/permissions',
  requirePermission('server:read'),
  asyncRoute(async (req, res) => {
    const row = getServerRow(req.params.id);
    if (!row) throw new ApiError(404, 'Server not found');
    const user = (req as any).user as SessionUser;
    const tags = parseJson<string[]>(row.tags, []);
    const tools = all<any>('SELECT name, requires_approval FROM tools WHERE server_id = ?', row.id);
    const policies = all<any>(
      `SELECT * FROM policies WHERE scope = 'server' AND subject = ? OR scope = 'global'
        OR (scope = 'tag' AND subject IN (${tags.map(() => '?').join(',') || "''"}))`,
      row.id,
      ...tags,
    );
    res.json({
      ok: true,
      canExecute: can(user, 'tool:execute'),
      tools: tools.map((tool) => ({
        name: tool.name,
        requiresApproval: Boolean(tool.requires_approval),
        decision: evaluatePolicies(user, 'tool:execute', {
          serverId: row.id,
          toolName: tool.name,
          serverTags: tags,
        }),
      })),
      policies,
      tags,
    });
  }),
);
