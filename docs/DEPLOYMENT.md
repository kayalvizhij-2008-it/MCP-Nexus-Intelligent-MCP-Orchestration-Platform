# Deployment

MCPNEXUS is a single Node process that serves the API, the built SPA and the
platform's own MCP endpoint. It needs a persistent writable directory, not a
managed database.

## Requirements

- Node.js ≥ 22.5 on Linux/macOS/Windows.
- A writable data directory (`MCPNEXUS_DATA_DIR`) — mount a volume if containerised.
- Outbound network access if you register remote MCP servers.
- Optional: a reverse proxy for TLS.

## Build and run

```bash
npm ci
npm run build            # dist/web + dist/server
NODE_ENV=production \
MCPNEXUS_PORT=4317 \
MCPNEXUS_ADMIN_EMAIL=you@example.com \
MCPNEXUS_ADMIN_PASSWORD='<generated with: openssl rand -base64 24>' \
MCPNEXUS_COOKIE_SECURE=true \
npm start
```

Production behaviour: static assets cached for 1h, CSP + HSTS sent, internal
error messages not exposed. Bind to `127.0.0.1` and terminate TLS at the proxy.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MCPNEXUS_PORT` | `4317` | HTTP listener (`PORT` is honoured as a fallback) |
| `HOST` | `127.0.0.1` | Bind address — use `0.0.0.0` only behind a proxy |
| `MCPNEXUS_DATA_DIR` | `./data` | SQLite, master key, workspace |
| `MCPNEXUS_WORKSPACE` | `<data>/workspace` | Filesystem MCP sandbox root |
| `MCPNEXUS_MASTER_KEY` | generated file | 32-byte hex key for AES-256-GCM secrets |
| `MCPNEXUS_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | see `.env.example` | First-run admin (empty DB only) |
| `MCPNEXUS_SESSION_TTL_HOURS` | `168` | Session lifetime |
| `MCPNEXUS_COOKIE_SECURE` | `false` (true in prod) | `Secure` cookie flag |
| `MCPNEXUS_CONNECT_TIMEOUT_MS` | `20000` | MCP handshake timeout |
| `MCPNEXUS_TOOL_TIMEOUT_MS` | `60000` | Per tool-call timeout |
| `MCPNEXUS_RATE_LIMIT_PER_MINUTE` | `240` | API requests per minute per session |

**Critical:** back up `MCPNEXUS_DATA_DIR/master.key` with the database. Without
it, encrypted server `env`/`headers` and integration settings are unreadable.

## systemd unit

```ini
[Unit]
Description=MCPNEXUS control plane
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/mcpnexus
EnvironmentFile=/etc/mcpnexus.env
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure
RestartSec=5
# The process handles SIGTERM: it stops MCP sessions, then closes the listener.
KillSignal=SIGTERM
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

## Reverse proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name nexus.example.com;

  ssl_certificate     /etc/letsencrypt/live/nexus.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/nexus.example.com/privkey.pem;

  client_max_body_size 4m;

  location / {
    proxy_pass http://127.0.0.1:4317;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # SSE + Streamable HTTP need streaming, not buffering
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
```

The app sets `trust proxy`, so `req.ip` and the audit trail see the real client
address once `X-Forwarded-For` is set.

## Docker

```bash
docker build -t mcpnexus .
docker run -d --name mcpnexus -p 127.0.0.1:4317:4317 \
  -v mcpnexus-data:/app/data \
  -e NODE_ENV=production -e MCPNEXUS_COOKIE_SECURE=true \
  -e MCPNEXUS_ADMIN_PASSWORD='<generated>' \
  mcpnexus
```

The image runs as a non-root user and persists `/app/data`.

## Health, shutdown and upgrades

- Liveness: `GET /api/health` → `{ ok, status, servers: { total, connected }, database }`.
- Readiness for a load balancer: require `ok === true` and `database === true`.
- `SIGTERM`/`SIGINT` shuts down MCP sessions (child processes and HTTP clients),
  then closes the listener with a 4s hard timeout.
- Migrations run automatically at boot and are recorded in `schema_migrations`;
  `GET /api/migrations` shows applied/pending and `POST /api/migrations/run`
  applies anything pending (requires `deployment:manage`).
- Upgrade: stop, back up `data/`, deploy new code, `npm ci && npm run build`,
  start. Schema changes are additive migrations.

## Deployment readiness in the product

The **Deployment Center** runs the same checks against the live environment
(secret strength, cookie flags, pending migrations, server health, database
integrity, backups) and stores each run with its results. It reports what is
actually true at that moment — it does not deploy anything itself.
