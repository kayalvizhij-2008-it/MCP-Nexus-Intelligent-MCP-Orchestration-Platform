# MCPNEXUS Architecture

## 1. Goals and constraints

MCPNEXUS is a **control plane**, not an MCP server library. It has to:

1. Speak the real Model Context Protocol in both directions (client to many servers, server to clients).
2. Keep protocol state accurate — a "running" server is a live MCP session, not a flag.
3. Persist enough evidence that every claim in the UI can be traced to a stored record.
4. Enforce authorization at the API boundary, never in the browser.

The implementation therefore separates four concerns: **transport/session management**, **persistence**,
**policy**, and **presentation**.

## 2. Runtime topology

```
┌──────────────────────────────┐
│ Browser (React SPA)          │
│  pages → lib/api.ts → /api   │
└───────────────┬──────────────┘
                │ session cookie
┌───────────────▼──────────────┐        ┌────────────────────────────┐
│ Express API (src/server)     │        │ MCP server: toolbox (stdio)│
│  routes → auth → policy      │◄──────►│ MCP server: filesystem     │
│  manager (MCP client)        │◄──────►│ MCP server: data           │
│  metrics / diagnostics       │        │ MCP server: nexus-control  │
└───────────────┬──────────────┘        └────────────────────────────┘
                │ node:sqlite (WAL)                 ▲
┌───────────────▼──────────────┐                  │ Streamable HTTP (self)
│ data/nexus.db                │        ┌─────────┴──────────┐
│ data/master.key              │        │ POST /mcp endpoint │
│ data/workspace (sandbox)     │        └────────────────────┘
└──────────────────────────────┘
```

The API process is the only writer to SQLite. MCP child processes are spawned by
`StdioClientTransport`; remote servers are reached with `StreamableHTTPClientTransport`.

## 3. Layers

### 3.1 Transport layer — `src/server/mcp/manager.ts`

One `Client` per server id, held in a `Map`. The manager is responsible for:

- Building transports from stored configuration (decrypted env/headers, `${MCPNEXUS_ROOT}` substitution).
- Performing `initialize` with a bounded timeout (`MCPNEXUS_CONNECT_TIMEOUT_MS`).
- Attaching notification handlers **before** connecting so early notifications are not lost:
  `tools/list_changed`, `resources/list_changed`, `prompts/list_changed`, `resources/updated`, `logging/message`.
- Discovery: paginated `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`.
- Invocation with a per-call timeout, result normalisation `{content, structuredContent, isError}`.
- Health: JSON-RPC `ping` every 30 s, persisted to `health_checks` (bounded to 300 rows/server).
- Lifecycle transitions: `stopped → starting → running | error → stopped`, plus cleanup on transport close.
- Nested calls: `ensureClient` starts a server on demand for tool/resource calls.

Discovery is idempotent via `ON CONFLICT(server_id, name|uri) DO UPDATE`, so re-discovery never loses local
state such as enablement or approval flags. Tools whose names match a destructive pattern are automatically
marked `requires_approval`.

### 3.2 Persistence — `src/server/db.ts`, `migrations.ts`

`node:sqlite` in WAL mode with foreign keys on. The baseline schema is created idempotently at boot; the
migration runner records applied versions in `schema_migrations` so future changes are traceable.

Core tables:

| Table | Purpose |
| --- | --- |
| `users`, `sessions` | Identity and server-side sessions (only a SHA-256 of the token is stored) |
| `servers` | Registration + last known session state, capabilities, server info |
| `tools`, `resources`, `prompts` | Discovered primitives with schemas and local policy flags |
| `custom_prompts` | Prompt Studio templates |
| `executions`, `resource_reads` | Append-only evidence of protocol calls |
| `approvals` | Single-use approval records bound to tool + arguments |
| `policies` | Scoped allow/deny rules with optional approval requirement |
| `config_versions` | Per-server configuration snapshots |
| `integrations` | Provider configuration (encrypted) and verified status |
| `audit_log` | Every mutating API action |
| `deployments`, `health_checks`, `server_logs`, `notifications` | Operational history |

### 3.3 Policy — `src/server/auth.ts`

Permissions are a closed union (`server:manage`, `tool:execute`, …). Roles map to a fixed permission set.
On top of that, `evaluatePolicies(user, permission, {serverId, toolName, serverTags})` walks stored policies:

1. A matching `deny` returns immediately (deny wins).
2. A matching `allow` with `requires_approval` upgrades the call to an approval-required call.
3. Scopes: `global`, `role`, `user`, `server` (id), `tool` (name), `tag`.

Tool-level approval is the union of the tool flag and the policy decision.

### 3.4 Read model — `metrics.ts`

Metrics are SQL aggregations over `executions`, `resource_reads`, `health_checks` and `audit_log`:
counts, failure counts, average latency, percentile approximation from sorted durations, and zero-filled
hourly buckets. There is no random or synthetic value anywhere; an empty install renders empty states.

### 3.5 Diagnostics and compatibility

- `diagnostics.ts` evaluates executable resolution, entry-point existence, URL validity, session state,
  ping latency, capability presence, schema shape and failure history, each with a suggestion and a score.
- `compat.ts` reports the installed SDK version, the client capability set, a server/client feature matrix,
  per-tool schema validation findings and an actionable issue list.

### 3.6 HTTP surface — `src/server/routes/*`

Routers are mounted under `/api` behind `requireAuth`; each handler adds a permission check. Errors are
`ApiError(status, message, details)` and serialised by a single error middleware. Mutating handlers call
`audit()` with the actor, target and a redacted detail object.

The platform's own MCP endpoint (`POST /mcp`) is mounted **before** the API routers, authenticates with a
bearer token stored in settings, and uses a stateless `StreamableHTTPServerTransport` per request.

## 4. MCP session lifecycle

```
register ──► stopped ──start──► starting ──initialize──► running
                ▲                  │                        │
                │                  └── failure ──► error    │
                └──────── stop ◄────────────────────────────┘
                            (transport close / user stop)
```

- Handshake failure stores `last_error` and the server stays `error`; logs keep the child's stderr.
- Transport close removes the live client and marks the server `stopped` unless the user asked for it.
- Notifications trigger a debounced re-discovery that preserves local flags.

## 5. Security design

| Area | Decision |
| --- | --- |
| Passwords | scrypt (N=16384, r=8, p=1, 64-byte key), per-password salt, constant-time compare |
| Sessions | 32-byte random token; only `sha256(token)` stored; expiry checked per request |
| Secrets at rest | AES-256-GCM (`v1.iv.tag.ciphertext`), 32-byte master key from env or `data/master.key` |
| Secret exposure | API returns names and masked values only; masked placeholders on save are ignored |
| Authorization | Permission check per route + policy evaluation per execution/resource read |
| Approval | Bound to server, tool and exact argument JSON; single-use (`approved → consumed`) |
| Input validation | JSON Schema subset validator before the MCP call; Zod for API bodies |
| Rate limiting | Sliding window per session/IP, `429` with `Retry-After` |
| Filesystem | Sandbox root resolution rejects any path escaping the workspace |
| Outbound HTTP | `http(s)` only, 15 s timeout, response size cap |

## 6. Frontend

React 18 + React Router + Tailwind v4. The SPA is a thin client over `/api`:

- `lib/api.ts` — typed fetch wrapper, dispatches `nexus:unauthorised` on 401.
- `lib/useApi.ts` — loading/error/reload state with optional polling.
- `components/ui.tsx` — design system (panels, badges, tabs, modal, toasts, JSON viewer).
- Pages map 1:1 to the sidebar. Every button performs a request; every table is backed by an endpoint.

Design tokens live in `src/web/styles.css` (`@theme`): deep charcoal surfaces, hairline borders, electric blue
and violet accents, monospace for identifiers and payloads.

## 7. Extension points

**Add an MCP server**: register it through the UI/API, or add a seed entry in `seed.ts`. No code change is
required to support a new server — discovery is generic.

**Add an integration**: append a definition to `INTEGRATIONS` in `integrations.ts` (fields, capabilities,
`test()` implementation) and add an action branch in `routes/integrations.ts`.

**Add an API endpoint**: create a handler in the relevant router, guard it with `requirePermission`, call
`audit()` for mutations, and the Playground catalog entry if it should be discoverable.

**Add a migration**: append to `MIGRATIONS` in `migrations.ts`; it runs once and is recorded.

## 8. Deliberate non-goals

- No multi-tenant isolation: this is a single-operator control plane for a trusted host.
- No OAuth flow for remote MCP servers; bearer headers only.
- No sampling/roots/elicitation client capabilities — the compatibility inspector reports this honestly.
- No cloud deployment automation; the Deployment Center validates readiness of the local instance.
