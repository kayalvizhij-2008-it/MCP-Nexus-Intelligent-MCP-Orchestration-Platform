import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { attachUser, requireAuth } from './auth.js';
import { IS_PROD, PLATFORM_VERSION, PORT, RATE_LIMIT_PER_MINUTE } from './config.js';
import { all, get } from './db.js';
import { ApiError, rateLimit } from './http.js';
import { mountControlEndpoint } from './mcp/control-server.js';
import { liveConnectionCount } from './mcp/manager.js';
import { authRouter } from './routes/auth.js';
import { insightsRouter } from './routes/insights.js';
import { integrationsRouter } from './routes/integrations.js';
import { platformRouter } from './routes/platform.js';
import { primitivesRouter } from './routes/primitives.js';
import { serversRouter } from './routes/servers.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (IS_PROD) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    }
    next();
  });

  // API responses carry account data and must never be cached by a proxy.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  // The platform's own Streamable HTTP MCP endpoint (bearer-token protected).
  mountControlEndpoint(app);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'up',
      version: PLATFORM_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      servers: {
        total: get<{ c: number }>('SELECT COUNT(*) AS c FROM servers')?.c ?? 0,
        connected: liveConnectionCount(),
      },
      database: Boolean(get('SELECT 1 AS ok')),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', rateLimit({ windowMs: 60_000, max: RATE_LIMIT_PER_MINUTE }));
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);

  app.use('/api/servers', serversRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api', primitivesRouter);
  app.use('/api', insightsRouter);
  app.use('/api', platformRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint not found' });
  });

  const webDir = path.join(process.cwd(), 'dist', 'web');
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir, { index: false, maxAge: IS_PROD ? '1h' : 0 }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/mcp') return next();
      res.sendFile(path.join(webDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send(
          'MCPNEXUS API is running. The web build is missing — run "npm run dev" for the Vite dev server or "npm run build" for production assets.\n',
        );
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) {
      res.status(error.status).json({ ok: false, error: error.message, details: error.details });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ ok: false, error: 'Malformed JSON body' });
      return;
    }
    const message = error?.message ?? 'Internal server error';
    if (!IS_PROD) console.error('[mcpnexus]', error);
    res.status(500).json({ ok: false, error: IS_PROD ? 'Internal server error' : message });
  });

  return app;
}

export function platformSnapshot() {
  return {
    servers: all('SELECT id, name, status FROM servers'),
    port: PORT,
  };
}
