import { Router } from 'express';
import { z } from 'zod';
import {
  audit,
  can,
  evaluatePolicies,
  requirePermission,
  type SessionUser,
} from '../auth.js';
import { all, get, nowIso, parseJson, run } from '../db.js';
import { ApiError, asyncRoute, intParam, maskSecretValues, toCsv } from '../http.js';
import {
  callTool,
  extractText,
  getPrompt,
  getServerRow,
  readResource,
} from '../mcp/manager.js';
import { validateAgainstSchema } from '../validation.js';

export const primitivesRouter = Router();

const toolDto = (tool: any, serverName?: string, serverId?: string) => ({
  id: tool.id,
  serverId: tool.server_id ?? serverId,
  serverName: serverName ?? tool.server_name ?? null,
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: parseJson(tool.input_schema, {}),
  enabled: Boolean(tool.enabled),
  requiresApproval: Boolean(tool.requires_approval),
  discoveredAt: tool.discovered_at,
});

primitivesRouter.get('/tools', requirePermission('tool:read'), (req, res) => {
  const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
  const rows = serverId
    ? all<any>(
        'SELECT t.*, s.name AS server_name FROM tools t JOIN servers s ON s.id = t.server_id WHERE t.server_id = ? ORDER BY s.name, t.name',
        serverId,
      )
    : all<any>('SELECT t.*, s.name AS server_name FROM tools t JOIN servers s ON s.id = t.server_id ORDER BY s.name, t.name');
  res.json({ ok: true, tools: rows.map((row) => toolDto(row)) });
});

primitivesRouter.patch(
  '/tools/:id',
  requirePermission('server:manage'),
  asyncRoute(async (req, res) => {
    const tool = get<any>('SELECT * FROM tools WHERE id = ?', req.params.id);
    if (!tool) throw new ApiError(404, 'Tool not found');
    const body = req.body ?? {};
    const updates: string[] = [];
    const values: any[] = [];
    if (typeof body.enabled === 'boolean') {
      updates.push('enabled = ?');
      values.push(body.enabled ? 1 : 0);
    }
    if (typeof body.requiresApproval === 'boolean') {
      updates.push('requires_approval = ?');
      values.push(body.requiresApproval ? 1 : 0);
    }
    if (!updates.length) throw new ApiError(400, 'Nothing to update');
    run(`UPDATE tools SET ${updates.join(', ')} WHERE id = ?`, ...values, tool.id);
    const server = getServerRow(tool.server_id);
    audit(req, 'tool.updated', 'tool', tool.id, {
      name: tool.name,
      server: server?.name,
      fields: updates.map((u) => u.split(' ')[0]),
    });
    res.json({
      ok: true,
      tool: toolDto(get('SELECT t.*, s.name AS server_name FROM tools t JOIN servers s ON s.id = t.server_id WHERE t.id = ?', tool.id)),
    });
  }),
);

const executeSchema = z.object({
  arguments: z.record(z.unknown()).optional(),
  approvalId: z.string().optional(),
});

primitivesRouter.post(
  '/tools/:id/execute',
  requirePermission('tool:execute'),
  asyncRoute(async (req, res) => {
    const user = (req as any).user as SessionUser;
    const tool = get<any>('SELECT * FROM tools WHERE id = ?', req.params.id);
    if (!tool) throw new ApiError(404, 'Tool not found');
    const server = getServerRow(tool.server_id);
    if (!server) throw new ApiError(404, 'Server not found');
    if (!tool.enabled) throw new ApiError(409, `Tool "${tool.name}" is disabled`);

    const parsed = executeSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    const args = (parsed.data.arguments ?? {}) as Record<string, unknown>;

    const schema = parseJson<any>(tool.input_schema, {});
    const issues = validateAgainstSchema(schema, args);
    if (issues.length) {
      throw new ApiError(422, 'Arguments do not match the tool schema', { issues });
    }

    const tags = parseJson<string[]>(server.tags, []);
    const decision = evaluatePolicies(user, 'tool:execute', {
      serverId: server.id,
      toolName: tool.name,
      serverTags: tags,
    });
    if (!decision.allowed) {
      audit(req, 'tool.denied', 'tool', tool.id, { tool: tool.name, reason: decision.reason });
      throw new ApiError(403, decision.reason ?? 'Denied by policy');
    }

    const needsApproval = Boolean(tool.requires_approval) || decision.requiresApproval;
    let approvalId = parsed.data.approvalId;

    if (needsApproval && !approvalId) {
      if (user.role === 'admin') {
        approvalId = crypto.randomUUID();
        run(
          `INSERT INTO approvals (id, server_id, tool_name, arguments, status, requested_by, requested_by_email, decided_by, decided_at, note, created_at)
           VALUES (?, ?, ?, ?, 'approved', ?, ?, ?, ?, 'Auto-approved for administrator', ?)`,
          approvalId,
          server.id,
          tool.name,
          JSON.stringify(args),
          user.id,
          user.email,
          user.email,
          nowIso(),
          nowIso(),
        );
      } else {
        const id = crypto.randomUUID();
        run(
          `INSERT INTO approvals (id, server_id, tool_name, arguments, status, requested_by, requested_by_email, decided_by, decided_at, note, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, ?, ?)`,
          id,
          server.id,
          tool.name,
          JSON.stringify(args),
          user.id,
          user.email,
          'Tool requires administrator approval',
          nowIso(),
        );
        audit(req, 'tool.approval_requested', 'tool', tool.id, { tool: tool.name, server: server.name });
        res.status(202).json({
          ok: true,
          status: 'pending_approval',
          approval: {
            id,
            serverId: server.id,
            serverName: server.name,
            toolName: tool.name,
            arguments: args,
            requestedBy: user.email,
            createdAt: nowIso(),
          },
          message: 'Execution parked until an administrator approves this call',
        });
        return;
      }
    }

    if (needsApproval && approvalId) {
      const approval = get<any>('SELECT * FROM approvals WHERE id = ?', approvalId);
      if (!approval) throw new ApiError(404, 'Approval not found');
      if (approval.status !== 'approved') {
        throw new ApiError(409, `Approval is ${approval.status}, not approved`);
      }
      if (approval.server_id !== server.id || approval.tool_name !== tool.name) {
        throw new ApiError(409, 'Approval does not match this tool');
      }
      const approvedArgs = parseJson<Record<string, unknown>>(approval.arguments, {});
      if (JSON.stringify(approvedArgs) !== JSON.stringify(args)) {
        throw new ApiError(409, 'Arguments differ from the approved request');
      }
      run("UPDATE approvals SET status = 'consumed' WHERE id = ?", approvalId);
      approvalId = approval.id;
    }

    const record = await callTool({
      serverId: server.id,
      toolName: tool.name,
      args,
      user,
      approvalId,
    });
    audit(req, 'tool.executed', 'tool', tool.id, {
      tool: tool.name,
      server: server.name,
      status: record.status,
      durationMs: record.durationMs,
    });

    res.json({
      ok: !record.isError,
      status: record.status,
      execution: {
        ...record,
        arguments: maskSecretValues(record.arguments ?? {}) as Record<string, unknown>,
        text: record.result ? extractText(record.result) : null,
        isError: record.isError,
      },
    });
  }),
);

/** Shared WHERE builder for execution history search, paging and CSV export. */
function executionFilter(query: Record<string, unknown>) {
  const clauses: string[] = [];
  const params: any[] = [];
  const serverId = typeof query.serverId === 'string' ? query.serverId : undefined;
  const status = typeof query.status === 'string' ? query.status : undefined;
  const tool = typeof query.tool === 'string' ? query.tool : undefined;
  const search = typeof query.q === 'string' ? query.q.trim() : '';
  const from = typeof query.from === 'string' ? query.from : undefined;
  const to = typeof query.to === 'string' ? query.to : undefined;

  if (serverId) {
    clauses.push('server_id = ?');
    params.push(serverId);
  }
  if (status === 'success' || status === 'error') {
    clauses.push('status = ?');
    params.push(status);
  }
  if (tool) {
    clauses.push('tool_name = ?');
    params.push(tool);
  }
  if (search) {
    const like = `%${search}%`;
    clauses.push('(tool_name LIKE ? OR server_name LIKE ? OR error LIKE ? OR arguments LIKE ? OR id LIKE ?)');
    params.push(like, like, like, like, like);
  }
  if (from) {
    clauses.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('created_at <= ?');
    params.push(to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function executionDto(row: any) {
  return {
    id: row.id,
    serverId: row.server_id,
    serverName: row.server_name,
    toolName: row.tool_name,
    status: row.status,
    // Stored records keep real arguments; anything returned to a client is masked.
    arguments: maskSecretValues(parseJson(row.arguments, {})) as Record<string, unknown>,
    result: parseJson(row.result, null),
    error: row.error,
    durationMs: row.duration_ms,
    isError: Boolean(row.is_error),
    actor: row.user_email,
    approvalId: row.approval_id,
    createdAt: row.created_at,
  };
}

primitivesRouter.get('/executions', requirePermission('observability:read'), (req, res) => {
  const limit = intParam(req.query.limit, 50, 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const { where, params } = executionFilter(req.query as Record<string, unknown>);
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM executions ${where}`, ...params)?.c ?? 0;
  const rows = all<any>(
    `SELECT * FROM executions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
  res.json({ ok: true, total, limit, offset, executions: rows.map(executionDto) });
});

primitivesRouter.get('/executions/export', requirePermission('observability:read'), (req, res) => {
  const { where, params } = executionFilter(req.query as Record<string, unknown>);
  const rows = all<any>(
    `SELECT * FROM executions ${where} ORDER BY created_at DESC LIMIT 5000`,
    ...params,
  ).map((row) => {
    const dto = executionDto(row);
    return {
      id: dto.id,
      createdAt: dto.createdAt,
      server: dto.serverName,
      tool: dto.toolName,
      status: dto.status,
      durationMs: dto.durationMs,
      actor: dto.actor ?? '',
      approvalId: dto.approvalId ?? '',
      error: dto.error ?? '',
      arguments: JSON.stringify(dto.arguments),
    };
  });
  const csv = toCsv(rows, [
    'id',
    'createdAt',
    'server',
    'tool',
    'status',
    'durationMs',
    'actor',
    'approvalId',
    'error',
    'arguments',
  ]);
  audit(req, 'executions.exported', 'execution', null, { rows: rows.length, filters: where });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mcpnexus-executions.csv"');
  res.send(csv);
});

primitivesRouter.get('/resources', requirePermission('resource:read'), (req, res) => {
  const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
  const rows = serverId
    ? all<any>(
        'SELECT r.*, s.name AS server_name FROM resources r JOIN servers s ON s.id = r.server_id WHERE r.server_id = ? ORDER BY s.name, r.uri',
        serverId,
      )
    : all<any>('SELECT r.*, s.name AS server_name FROM resources r JOIN servers s ON s.id = r.server_id ORDER BY s.name, r.uri');
  res.json({
    ok: true,
    resources: rows.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serverName: row.server_name,
      uri: row.uri,
      name: row.name,
      description: row.description,
      mimeType: row.mime_type,
      isTemplate: Boolean(row.is_template),
      discoveredAt: row.discovered_at,
    })),
  });
});

primitivesRouter.post(
  '/resources/read',
  requirePermission('resource:read'),
  asyncRoute(async (req, res) => {
    const { serverId, uri } = req.body ?? {};
    if (typeof serverId !== 'string' || typeof uri !== 'string') {
      throw new ApiError(400, 'serverId and uri are required');
    }
    const server = getServerRow(serverId);
    if (!server) throw new ApiError(404, 'Server not found');
    const decision = evaluatePolicies((req as any).user, 'resource:read', {
      serverId,
      serverTags: parseJson<string[]>(server.tags, []),
    });
    if (!decision.allowed) throw new ApiError(403, decision.reason ?? 'Denied by policy');
    try {
      const result = await readResource({ serverId, uri, user: (req as any).user });
      res.json({ ok: true, ...result });
    } catch (error: any) {
      throw new ApiError(502, error?.message ?? 'Resource read failed');
    }
  }),
);

primitivesRouter.get('/resource-reads', requirePermission('observability:read'), (req, res) => {
  const limit = intParam(req.query.limit, 50, 200);
  res.json({
    ok: true,
    reads: all<any>(
      `SELECT rr.*, s.name AS server_name FROM resource_reads rr
         JOIN servers s ON s.id = rr.server_id
        ORDER BY rr.created_at DESC LIMIT ?`,
      limit,
    ).map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serverName: row.server_name,
      uri: row.uri,
      status: row.status,
      bytes: row.bytes,
      durationMs: row.duration_ms,
      error: row.error,
      createdAt: row.created_at,
    })),
  });
});

primitivesRouter.get('/notifications', requirePermission('resource:read'), (req, res) => {
  const limit = intParam(req.query.limit, 50, 200);
  res.json({
    ok: true,
    notifications: all<any>(
      `SELECT n.*, s.name AS server_name FROM notifications n
         JOIN servers s ON s.id = n.server_id
        ORDER BY n.created_at DESC LIMIT ?`,
      limit,
    ).map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serverName: row.server_name,
      kind: row.kind,
      payload: parseJson(row.payload, {}),
      createdAt: row.created_at,
    })),
  });
});

primitivesRouter.get('/prompts', requirePermission('prompt:read'), (req, res) => {
  const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
  const rows = serverId
    ? all<any>(
        'SELECT p.*, s.name AS server_name FROM prompts p JOIN servers s ON s.id = p.server_id WHERE p.server_id = ? ORDER BY p.name',
        serverId,
      )
    : all<any>('SELECT p.*, s.name AS server_name FROM prompts p JOIN servers s ON s.id = p.server_id ORDER BY s.name, p.name');
  res.json({
    ok: true,
    prompts: rows.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serverName: row.server_name,
      name: row.name,
      description: row.description,
      arguments: parseJson(row.arguments, []),
      discoveredAt: row.discovered_at,
    })),
  });
});

primitivesRouter.post(
  '/prompts/preview',
  requirePermission('prompt:read'),
  asyncRoute(async (req, res) => {
    const { serverId, name, arguments: args } = req.body ?? {};
    if (typeof serverId !== 'string' || typeof name !== 'string') {
      throw new ApiError(400, 'serverId and name are required');
    }
    const prompt = get<any>('SELECT * FROM prompts WHERE server_id = ? AND name = ?', serverId, name);
    if (!prompt) throw new ApiError(404, 'Prompt not found for this server');
    const definitions = parseJson<any[]>(prompt.arguments, []);
    const supplied = (args ?? {}) as Record<string, string>;
    const missing = definitions.filter((arg) => arg.required && !supplied[arg.name]);
    if (missing.length) {
      throw new ApiError(422, 'Required prompt arguments are missing', {
        missing: missing.map((arg) => arg.name),
      });
    }
    try {
      const result = await getPrompt({ serverId, name, args: supplied });
      res.json({ ok: true, ...result });
    } catch (error: any) {
      throw new ApiError(502, error?.message ?? 'Prompt generation failed');
    }
  }),
);

/* ---------------------------- custom prompts ---------------------------- */

primitivesRouter.get('/custom-prompts', requirePermission('prompt:read'), (_req, res) => {
  res.json({
    ok: true,
    prompts: all<any>('SELECT * FROM custom_prompts ORDER BY category, name').map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      template: row.template,
      arguments: parseJson(row.arguments, []),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
});

const customPromptSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.string().min(1).max(60).optional(),
  description: z.string().max(600).optional(),
  template: z.string().min(1),
  arguments: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        required: z.boolean().optional(),
      }),
    )
    .optional(),
});

primitivesRouter.post(
  '/custom-prompts',
  requirePermission('prompt:manage'),
  asyncRoute(async (req, res) => {
    const parsed = customPromptSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, 'Invalid prompt', parsed.error.flatten());
    const user = (req as any).user as SessionUser;
    const id = crypto.randomUUID();
    run(
      'INSERT INTO custom_prompts (id, name, category, description, template, arguments, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      parsed.data.name.trim(),
      parsed.data.category?.trim() || 'General',
      parsed.data.description ?? '',
      parsed.data.template,
      JSON.stringify(parsed.data.arguments ?? []),
      user.email,
      nowIso(),
      nowIso(),
    );
    audit(req, 'prompt.created', 'custom_prompt', id, { name: parsed.data.name });
    res.status(201).json({ ok: true, id });
  }),
);

primitivesRouter.patch(
  '/custom-prompts/:id',
  requirePermission('prompt:manage'),
  asyncRoute(async (req, res) => {
    const existing = get<any>('SELECT * FROM custom_prompts WHERE id = ?', req.params.id);
    if (!existing) throw new ApiError(404, 'Prompt not found');
    const parsed = customPromptSchema.partial().safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError(400, 'Invalid prompt', parsed.error.flatten());
    const data = parsed.data;
    run(
      'UPDATE custom_prompts SET name = ?, category = ?, description = ?, template = ?, arguments = ?, updated_at = ? WHERE id = ?',
      data.name ?? existing.name,
      data.category ?? existing.category,
      data.description ?? existing.description,
      data.template ?? existing.template,
      data.arguments ? JSON.stringify(data.arguments) : existing.arguments,
      nowIso(),
      existing.id,
    );
    audit(req, 'prompt.updated', 'custom_prompt', existing.id, { name: existing.name });
    res.json({ ok: true });
  }),
);

primitivesRouter.delete(
  '/custom-prompts/:id',
  requirePermission('prompt:manage'),
  asyncRoute(async (req, res) => {
    const existing = get<any>('SELECT * FROM custom_prompts WHERE id = ?', req.params.id);
    if (!existing) throw new ApiError(404, 'Prompt not found');
    run('DELETE FROM custom_prompts WHERE id = ?', existing.id);
    audit(req, 'prompt.deleted', 'custom_prompt', existing.id, { name: existing.name });
    res.json({ ok: true });
  }),
);

primitivesRouter.post(
  '/custom-prompts/:id/preview',
  requirePermission('prompt:read'),
  asyncRoute(async (req, res) => {
    const existing = get<any>('SELECT * FROM custom_prompts WHERE id = ?', req.params.id);
    if (!existing) throw new ApiError(404, 'Prompt not found');
    const values = (req.body?.values ?? {}) as Record<string, string>;
    const definitions = parseJson<any[]>(existing.arguments, []);
    const missing = definitions.filter((arg) => arg.required && !values[arg.name]);
    if (missing.length) {
      throw new ApiError(422, 'Required values are missing', { missing: missing.map((m) => m.name) });
    }
    const rendered = String(existing.template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => {
      return values[key] !== undefined ? String(values[key]) : `{{${key}}}`;
    });
    res.json({ ok: true, rendered, missing: definitions.filter((arg) => !values[arg.name]).map((a) => a.name) });
  }),
);

/* ------------------------------ approvals ------------------------------ */

primitivesRouter.get('/approvals', requirePermission('security:read'), (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = status
    ? all<any>('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT 200', status)
    : all<any>('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200');
  res.json({
    ok: true,
    approvals: rows.map((row) => ({
      id: row.id,
      serverId: row.server_id,
      serverName: get<{ name: string }>('SELECT name FROM servers WHERE id = ?', row.server_id)?.name ?? 'deleted server',
      toolName: row.tool_name,
      arguments: parseJson(row.arguments, {}),
      status: row.status,
      requestedBy: row.requested_by_email,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
});

primitivesRouter.post(
  '/approvals/:id/decide',
  requirePermission('security:manage'),
  asyncRoute(async (req, res) => {
    const approval = get<any>('SELECT * FROM approvals WHERE id = ?', req.params.id);
    if (!approval) throw new ApiError(404, 'Approval not found');
    if (approval.status !== 'pending') throw new ApiError(409, `Approval is already ${approval.status}`);
    const decision = req.body?.decision;
    if (decision !== 'approve' && decision !== 'reject') {
      throw new ApiError(400, 'decision must be "approve" or "reject"');
    }
    const user = (req as any).user as SessionUser;
    if (decision === 'approve' && !can(user, 'tool:execute')) {
      throw new ApiError(403, 'Approvers must be able to execute tools');
    }
    run(
      'UPDATE approvals SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?',
      decision === 'approve' ? 'approved' : 'rejected',
      user.email,
      nowIso(),
      typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : approval.note,
      approval.id,
    );
    audit(req, `approval.${decision}d`, 'approval', approval.id, {
      tool: approval.tool_name,
      requestedBy: approval.requested_by_email,
    });
    res.json({ ok: true, status: decision === 'approve' ? 'approved' : 'rejected' });
  }),
);
