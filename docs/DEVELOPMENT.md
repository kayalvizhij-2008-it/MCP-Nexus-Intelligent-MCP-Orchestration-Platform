# Development guide

## Prerequisites

- **Node.js ≥ 22.5** — the platform uses the built-in `node:sqlite` module.
  (Tested on Node 24.16.)
- npm 10+.
- No external database, Docker or API key is required for local development.

## Install and run

```bash
npm install
npm run dev        # API on 127.0.0.1:4317, Vite on 127.0.0.1:5317
```

The Vite dev server proxies `/api` to the API with a small `node:http` plugin in
`vite.config.ts` (Vite's built-in proxy fails with `EADDRNOTAVAIL` on some
Windows/Node 24 combinations). The SPA is same-origin with the API, so cookies
work without CORS.

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | API + Vite concurrently |
| `npm run dev:api` | API only (`tsx src/server/index.ts`) |
| `npm run dev:web` | Vite only |
| `npm run typecheck` | Server and web TypeScript projects |
| `npm test` | Vitest integration suite (isolated temp database) |
| `npm run build` | `dist/web` (Vite) + `dist/server` (tsc) |
| `npm start` | Production server on the built assets |

First run: the platform generates an administrator password into
`data/initial-admin.txt` unless `MCPNEXUS_ADMIN_PASSWORD` is set.

## Project layout

```
src/server/        Express API, MCP client manager, security, metrics
  mcp/manager.ts     sessions, discovery, calls, health loop, lifecycle
  mcp/control-server.ts  the platform's own Streamable HTTP MCP endpoint
  routes/            REST surface (auth, servers, primitives, insights, …)
  db.ts              schema + typed query helpers (node:sqlite)
  migrations.ts      ordered, once-only migrations
src/web/           React 18 + Vite + Tailwind v4 SPA
  pages/             one file per sidebar section
  components/        design system, layout, schema-driven forms
mcp-servers/       three first-party MCP servers (plain .mjs, no build step)
tests/             integration tests against a real MCP session
docs/              architecture, API, security, database, testing, deployment
```

## Conventions

- ESM everywhere. TypeScript source imports use a `.js` extension
  (`import { get } from './db.js'`) because the build emits Node ESM.
- `node:sqlite` is loaded through `createRequire` in `db.ts` so bundlers do not
  try to resolve it as a Vite builtin.
- All SQL goes through `all`/`get`/`run` with bound parameters.
- Every mutation writes an `audit_log` row via `audit(req, action, type, id, detail)`.
- New REST routes belong in `src/server/routes/*` and register under `/api`.
  Guard them with `requirePermission('…')`; never rely on the UI to hide actions.
- Errors: throw `new ApiError(status, message, details)`; the global handler turns
  it into `{ ok: false, error, details }`.

## Adding a first-party MCP server

1. Create `mcp-servers/your-server.mjs` using `McpServer` + `StdioServerTransport`
   from `@modelcontextprotocol/sdk/server/*`.
2. Register it in `src/server/seed.ts` (`seedServers`) with a slug, command and
   args relative to the repo root.
3. Restart the API; the manager performs `initialize`, then `tools/list`,
   `resources/list` and `prompts/list`, and stores what the server advertises.

## Adding a REST endpoint

```ts
serversRouter.get('/:id/thing', requirePermission('server:read'), asyncRoute(async (req, res) => {
  const row = getServerRow(req.params.id);
  if (!row) throw new ApiError(404, 'Server not found');
  res.json({ ok: true, thing: buildThing(row) });
}));
```

Route ordering matters: literal paths (`/export`) must be declared before
parameterised ones (`/:id`).

## Debugging

- API logs: the process stdout (server lifecycle, MCP handshake, auto-start).
- Per-server output: Server → Logs tab (`server_logs` table).
- Diagnostics: `GET /api/servers/:id/diagnostics` returns ranked findings and a
  score; the same data drives the Diagnostics tab.
- `GET /api/health` is the liveness probe; it reports connected server count and
  database reachability.

## Environment

See `.env.example`. Never commit a real `.env`; `data/` and `.env` are ignored.
