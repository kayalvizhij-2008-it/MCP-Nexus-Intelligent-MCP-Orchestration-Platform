import { Router } from 'express';
import { requirePermission } from '../auth.js';
import { all, parseJson } from '../db.js';
import { intParam } from '../http.js';
import {
  buildOverview,
  errorDistribution,
  executionTimeseries,
  executionTimeline,
  latencyPercentiles,
  resourceStats,
  toolUsage,
} from '../metrics.js';

export const insightsRouter = Router();

insightsRouter.get('/overview', requirePermission('observability:read'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...buildOverview() });
});

insightsRouter.get('/observability', requirePermission('observability:read'), (req, res) => {
  const hours = intParam(req.query.hours, 24, 168);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    overview: buildOverview(),
    timeseries: executionTimeseries(hours),
    toolUsage: toolUsage(10),
    errors: errorDistribution(8),
    latency: latencyPercentiles(),
    resources: resourceStats(),
    hours,
  });
});

insightsRouter.get('/observability/timeline', requirePermission('observability:read'), (req, res) => {
  const limit = intParam(req.query.limit, 50, 200);
  const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
  res.json({ ok: true, events: executionTimeline(limit, serverId) });
});

insightsRouter.get('/audit', requirePermission('audit:read'), (req, res) => {
  const limit = intParam(req.query.limit, 100, 500);
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const rows = action
    ? all<any>('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY created_at DESC LIMIT ?', `%${action}%`, limit)
    : all<any>('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', limit);
  res.json({
    ok: true,
    entries: rows.map((row) => ({
      id: row.id,
      actor: row.actor_email,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: parseJson(row.detail, {}),
      ip: row.ip,
      createdAt: row.created_at,
    })),
  });
});
