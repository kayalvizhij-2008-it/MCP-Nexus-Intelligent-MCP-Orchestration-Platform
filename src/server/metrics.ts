import { all, get, parseJson, nowIso } from './db.js';

export type Overview = ReturnType<typeof buildOverview>;

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function dayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function buildOverview() {
  const servers = all<any>('SELECT * FROM servers ORDER BY name');
  const running = servers.filter((s) => s.status === 'running').length;
  const errors = servers.filter((s) => s.status === 'error').length;
  const toolCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM tools')?.c ?? 0;
  const enabledTools = get<{ c: number }>('SELECT COUNT(*) AS c FROM tools WHERE enabled = 1')?.c ?? 0;
  const resourceCount = get<{ c: number }>('SELECT COUNT(*) AS c FROM resources')?.c ?? 0;
  const promptCount =
    (get<{ c: number }>('SELECT COUNT(*) AS c FROM prompts')?.c ?? 0) +
    (get<{ c: number }>('SELECT COUNT(*) AS c FROM custom_prompts')?.c ?? 0);

  const since24h = hoursAgoIso(24);
  const executions = get<{
    total: number;
    failed: number;
    avg_ms: number | null;
    p95: number | null;
  }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_error = 1 OR status = 'error' THEN 1 ELSE 0 END) AS failed,
            AVG(duration_ms) AS avg_ms,
            MAX(duration_ms) AS p95
       FROM executions WHERE created_at >= ?`,
    since24h,
  ) ?? { total: 0, failed: 0, avg_ms: null, p95: null };

  const allTime = get<{ total: number; failed: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_error = 1 OR status = 'error' THEN 1 ELSE 0 END) AS failed
       FROM executions`,
  ) ?? { total: 0, failed: 0 };

  const today = get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM executions WHERE created_at >= ?',
    dayStartIso(),
  )?.c ?? 0;

  const pendingApprovals = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM approvals WHERE status = 'pending'",
  )?.c ?? 0;

  const resourceReads = get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM resource_reads WHERE created_at >= ?',
    since24h,
  )?.c ?? 0;

  const successRate = executions.total
    ? Math.round(((executions.total - (executions.failed ?? 0)) / executions.total) * 1000) / 10
    : null;

  const recentExecutions = all<any>(
    `SELECT id, server_id, server_name, tool_name, status, duration_ms, is_error, created_at, error
       FROM executions ORDER BY created_at DESC LIMIT 8`,
  ).map((row) => ({
    id: row.id,
    serverId: row.server_id,
    serverName: row.server_name,
    toolName: row.tool_name,
    status: row.status,
    durationMs: row.duration_ms,
    isError: Boolean(row.is_error),
    error: row.error,
    createdAt: row.created_at,
  }));

  const activity = all<any>(
    `SELECT * FROM (
       SELECT 'execution' AS kind, id, created_at, tool_name AS subject, server_name AS context, status, user_email AS actor FROM executions
       UNION ALL
       SELECT 'audit' AS kind, id, created_at, action AS subject, target_type AS context, 'info' AS status, actor_email AS actor FROM audit_log
     ) ORDER BY created_at DESC LIMIT 12`,
  ).map((row) => ({
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    context: row.context,
    status: row.status,
    actor: row.actor,
    createdAt: row.created_at,
  }));

  return {
    servers: {
      total: servers.length,
      running,
      stopped: servers.length - running - errors,
      errors,
    },
    tools: { total: toolCount, enabled: enabledTools },
    resources: { total: resourceCount, reads24h: resourceReads },
    prompts: { total: promptCount },
    requests: {
      last24h: executions.total,
      failed24h: executions.failed ?? 0,
      allTime: allTime.total,
      allTimeFailed: allTime.failed ?? 0,
      today,
    },
    performance: {
      successRate,
      avgLatencyMs: executions.avg_ms ? Math.round(executions.avg_ms) : null,
      slowestMs: executions.p95 ?? null,
    },
    pendingApprovals,
    recentExecutions,
    activity,
    serverHealth: servers.map((server) => ({
      id: server.id,
      name: server.name,
      slug: server.slug,
      status: server.status,
      transport: server.transport,
      lastError: server.last_error,
      tools: get<{ c: number }>('SELECT COUNT(*) AS c FROM tools WHERE server_id = ?', server.id)?.c ?? 0,
      lastConnectedAt: server.last_connected_at,
    })),
    generatedAt: nowIso(),
  };
}

/** Hourly execution buckets for the last 24 hours (real counts, zero-filled). */
export function executionTimeseries(hours = 24) {
  const since = hoursAgoIso(hours);
  const rows = all<{ bucket: string; total: number; failed: number; avg_ms: number | null }>(
    `SELECT substr(created_at, 1, 13) AS bucket,
            COUNT(*) AS total,
            SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS failed,
            AVG(duration_ms) AS avg_ms
       FROM executions WHERE created_at >= ?
      GROUP BY bucket ORDER BY bucket`,
    since,
  );
  const map = new Map(rows.map((r) => [r.bucket, r]));
  const buckets: Array<{ at: string; label: string; total: number; failed: number; avgLatencyMs: number | null }> = [];
  const now = new Date();
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600_000);
    const key = d.toISOString().slice(0, 13);
    const row = map.get(key);
    buckets.push({
      at: `${key}:00:00.000Z`,
      label: `${String(d.getHours()).padStart(2, '0')}:00`,
      total: row?.total ?? 0,
      failed: row?.failed ?? 0,
      avgLatencyMs: row?.avg_ms ? Math.round(row.avg_ms) : null,
    });
  }
  return buckets;
}

export function toolUsage(limit = 8) {
  return all<any>(
    `SELECT tool_name AS name, COUNT(*) AS calls,
            SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS failures,
            ROUND(AVG(duration_ms)) AS avg_ms
       FROM executions GROUP BY tool_name ORDER BY calls DESC LIMIT ?`,
    limit,
  ).map((r) => ({
    name: r.name,
    calls: r.calls,
    failures: r.failures ?? 0,
    avgLatencyMs: r.avg_ms ?? null,
  }));
}

export function errorDistribution(limit = 6) {
  return all<any>(
    `SELECT server_name AS server, tool_name AS tool, COUNT(*) AS failures
       FROM executions WHERE is_error = 1
      GROUP BY server_name, tool_name ORDER BY failures DESC LIMIT ?`,
    limit,
  );
}

export function latencyPercentiles() {
  const rows = all<{ duration_ms: number }>(
    'SELECT duration_ms FROM executions ORDER BY duration_ms ASC',
  ).map((r) => r.duration_ms);
  if (!rows.length) return { p50: null, p90: null, p95: null, p99: null, samples: 0 };
  const at = (p: number) => rows[Math.min(rows.length - 1, Math.floor((p / 100) * rows.length))];
  return { p50: at(50), p90: at(90), p95: at(95), p99: at(99), samples: rows.length };
}

export function executionTimeline(limit = 50, serverId?: string) {
  const rows = serverId
    ? all<any>(
        'SELECT * FROM executions WHERE server_id = ? ORDER BY created_at DESC LIMIT ?',
        serverId,
        limit,
      )
    : all<any>('SELECT * FROM executions ORDER BY created_at DESC LIMIT ?', limit);
  return rows.map((row) => ({
    id: row.id,
    serverId: row.server_id,
    serverName: row.server_name,
    toolName: row.tool_name,
    status: row.status,
    durationMs: row.duration_ms,
    isError: Boolean(row.is_error),
    error: row.error,
    actor: row.user_email,
    arguments: parseJson(row.arguments, {}),
    createdAt: row.created_at,
  }));
}

export function resourceStats() {
  const rows = all<any>(
    `SELECT r.uri, r.name, s.name AS server_name, COUNT(rr.id) AS reads,
            MAX(rr.created_at) AS last_read, SUM(rr.bytes) AS bytes
       FROM resource_reads rr
       JOIN resources r ON r.uri = rr.uri AND r.server_id = rr.server_id
       JOIN servers s ON s.id = rr.server_id
      GROUP BY rr.uri ORDER BY reads DESC LIMIT 10`,
  ).map((r) => ({
    uri: r.uri,
    name: r.name,
    serverName: r.server_name,
    reads: r.reads,
    lastRead: r.last_read,
    bytes: r.bytes ?? 0,
  }));
  const totals = get<{ reads: number; failures: number; avg_ms: number | null }>(
    `SELECT COUNT(*) AS reads,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failures,
            AVG(duration_ms) AS avg_ms
       FROM resource_reads`,
  );
  return {
    top: rows,
    totals: {
      reads: totals?.reads ?? 0,
      failures: totals?.failures ?? 0,
      avgLatencyMs: totals?.avg_ms ? Math.round(totals.avg_ms) : null,
    },
  };
}

export function healthHistory(serverId: string, limit = 60) {
  return all<any>(
    'SELECT status, latency_ms, error, checked_at FROM health_checks WHERE server_id = ? ORDER BY checked_at DESC LIMIT ?',
    serverId,
    limit,
  )
    .map((r) => ({
      status: r.status,
      latencyMs: r.latency_ms,
      error: r.error,
      checkedAt: r.checked_at,
    }))
    .reverse();
}
