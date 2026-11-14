import { Router } from 'express';
import { audit, requirePermission } from '../auth.js';
import { ApiError, asyncRoute } from '../http.js';
import {
  INTEGRATIONS,
  extractDocument,
  getDefinition,
  getIntegrationRow,
  integrationDefinitions,
  runReadOnlyQuery,
  testIntegration,
  updateIntegrationConfig,
} from '../integrations.js';
import { decryptJson } from '../crypto.js';
import { run, nowIso } from '../db.js';

export const integrationsRouter = Router();

integrationsRouter.get('/', requirePermission('integration:read'), (_req, res) => {
  res.json({ ok: true, integrations: integrationDefinitions() });
});

integrationsRouter.put(
  '/:key',
  requirePermission('integration:manage'),
  asyncRoute(async (req, res) => {
    const definition = getDefinition(req.params.key);
    if (!definition) throw new ApiError(404, 'Unknown integration');
    const submitted = req.body?.config;
    if (!submitted || typeof submitted !== 'object') throw new ApiError(400, 'config object is required');
    const existing = decryptJson<Record<string, string>>(getIntegrationRow(definition.key)?.config);
    const missing = definition.fields
      .filter((field) => field.required)
      .filter((field) => {
        const value = (submitted as Record<string, string>)[field.key];
        const untouched = !value || value === '********';
        return untouched && !existing[field.key];
      });
    if (missing.length) {
      throw new ApiError(422, 'Missing required configuration', {
        fields: missing.map((field) => field.key),
      });
    }
    updateIntegrationConfig(definition.key, submitted as Record<string, string>);
    audit(req, 'integration.configured', 'integration', definition.key, {
      fields: Object.keys(submitted),
    });
    res.json({ ok: true, integrations: integrationDefinitions() });
  }),
);

integrationsRouter.post(
  '/:key/test',
  requirePermission('integration:read'),
  asyncRoute(async (req, res) => {
    if (!getDefinition(req.params.key)) throw new ApiError(404, 'Unknown integration');
    const result = await testIntegration(req.params.key);
    audit(req, 'integration.tested', 'integration', req.params.key, { ok: result.ok });
    res
      .status(result.ok ? 200 : 502)
      .json({ ...result, integrations: integrationDefinitions() });
  }),
);

integrationsRouter.post(
  '/:key/action',
  requirePermission('integration:manage'),
  asyncRoute(async (req, res) => {
    const key = req.params.key;
    const action = String(req.body?.action ?? '');
    const row = getIntegrationRow(key);
    if (!row) throw new ApiError(404, 'Unknown integration');
    const config = decryptJson<Record<string, string>>(row.config);

    if (key === 'database' && action === 'query') {
      const sql = String(req.body?.sql ?? 'select 1');
      try {
        const result = runReadOnlyQuery(sql);
        audit(req, 'integration.query', 'integration', key, { sql });
        res.json({ ok: true, ...result });
      } catch (error: any) {
        throw new ApiError(400, error?.message ?? 'Query failed');
      }
      return;
    }

    if (key === 'documents' && action === 'extract') {
      const relative = String(req.body?.path ?? 'README.md');
      try {
        const result = await extractDocument(relative);
        res.json({ ok: true, ...result });
      } catch (error: any) {
        throw new ApiError(400, error?.message ?? 'Document could not be read');
      }
      return;
    }

    if (key === 'github' && action === 'repos') {
      if (!config.token) throw new ApiError(409, 'GitHub is not configured with a token');
      const response = await fetch('https://api.github.com/user/repos?per_page=20&sort=updated', {
        headers: {
          authorization: `Bearer ${config.token}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'mcpnexus',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new ApiError(502, `GitHub responded ${response.status}`);
      const repos = (await response.json()) as any[];
      res.json({
        ok: true,
        repos: repos.map((repo) => ({
          name: repo.full_name,
          private: repo.private,
          stars: repo.stargazers_count,
          language: repo.language,
          updatedAt: repo.updated_at,
        })),
      });
      return;
    }

    if (key === 'rest-api' && action === 'get') {
      if (!config.baseUrl) throw new ApiError(409, 'REST API integration is not configured');
      const target = String(req.body?.path ?? '');
      let url = config.baseUrl;
      try {
        if (target) url = new URL(target, config.baseUrl).toString();
      } catch {
        throw new ApiError(400, 'Invalid path');
      }
      const response = await fetch(url, {
        headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.text();
      res.json({
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: body.slice(0, 20000),
      });
      return;
    }

    if (key === 'webhook' && action === 'send') {
      if (!config.url) throw new ApiError(409, 'Webhook is not configured');
      const payload = req.body?.payload ?? { event: 'nexus.manual', sentAt: nowIso() };
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.secret ? { 'x-nexus-secret': config.secret } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      run(
        'UPDATE integrations SET last_checked_at = ?, status = ? WHERE key = ?',
        nowIso(),
        response.ok ? 'connected' : 'error',
        key,
      );
      res.json({ ok: response.ok, status: response.status });
      return;
    }

    throw new ApiError(400, `Unsupported action "${action}" for ${key}`);
  }),
);

integrationsRouter.get('/catalog/definitions', requirePermission('integration:read'), (_req, res) => {
  res.json({ ok: true, definitions: INTEGRATIONS.map(({ test, ...rest }) => rest) });
});
