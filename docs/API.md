# MCPNEXUS API Reference

Base URL: `http://127.0.0.1:4317/api` (Vite dev server proxies `/api` from port 5317).

## Conventions

- Requests and responses are JSON (`Content-Type: application/json`).
- Successful responses: `{ "ok": true, ...payload }`. Failures: `{ "ok": false, "error": "message", "details": … }`.
- Authentication uses the `nexus_session` HTTP-only cookie set by `POST /auth/login`.
- Status codes: `200` ok, `201` created, `202` parked for approval, `400` invalid input, `401` unauthenticated,
  `403` missing permission or denied by policy, `404` not found, `409` state conflict, `422` schema validation
  failure, `429` rate limited, `502` upstream MCP/provider failure.
- Rate limit: 240 requests/minute per session (configurable), `429` responses include `Retry-After`.
- Every mutating call is written to the audit trail with actor, action, target and a redacted detail object.

## Permissions

| Permission | admin | operator | viewer |
| --- | :-: | :-: | :-: |
| `server:read`, `tool:read`, `resource:read`, `prompt:read` | ✓ | ✓ | ✓ |
| `observability:read`, `deployment:read`, `security:read`, `integration:read` | ✓ | ✓ | ✓ |
| `audit:read` | ✓ | ✓ | |
| `server:manage`, `tool:execute` | ✓ | ✓ | |
| `prompt:manage`, `integration:manage`, `deployment:manage` | ✓ | ✓ | |
| `security:manage`, `user:manage` | ✓ | | |

Policies (`policies` table) can further deny a permission or require approval for specific servers, tools,
tags, roles or users. Deny always wins.

---

## Authentication

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | `{email, password}` → sets session cookie |
| POST | `/auth/logout` | public | Clears the session server-side and client-side |
| GET | `/auth/me` | authenticated | Current user + permission list |
| POST | `/auth/password` | authenticated | `{currentPassword, newPassword}` → revokes all sessions |

```bash
curl -c cookies.txt -X POST http://127.0.0.1:4317/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@mcpnexus.local","password":"nexus-admin-2026"}'
```

---

## Servers

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/servers` | `server:read` | List servers with counts, status and connection state |
| POST | `/servers` | `server:manage` | Register a server |
| GET | `/servers/:id` | `server:read` | Detail incl. tools, resources, prompts |
| PATCH | `/servers/:id` | `server:manage` | Update configuration (creates a version) |
| DELETE | `/servers/:id` | `server:manage` | Stop and delete the registration |
| POST | `/servers/:id/start` | `server:manage` | Perform the MCP handshake and discovery |
| POST | `/servers/:id/stop` | `server:manage` | Close the session |
| POST | `/servers/:id/restart` | `server:manage` | Stop then start |
| GET | `/servers/:id/logs?limit=` | `server:read` | Captured stderr/protocol log |
| GET | `/servers/:id/health` | `server:read` | Ping history and last check time |
| POST | `/servers/:id/health-check` | `server:read` | Run a ping now |
| GET | `/servers/:id/diagnostics` | `server:read` | Diagnostic report + history |
| GET | `/servers/:id/compatibility` | `server:read` | Compatibility inspector report |
| GET | `/servers/:id/config-versions` | `server:read` | Snapshot history |
| POST | `/servers/:id/config-versions/:version/restore` | `server:manage` | Restore a snapshot |
| GET | `/servers/:id/analytics` | `server:read` | Per-server metrics |
| GET | `/servers/:id/permissions` | `server:read` | Effective decisions for the caller |

`POST /servers` accepts:

```json
{
  "name": "Search Server",
  "description": "Internal search MCP",
  "transport": "stdio",
  "command": "node",
  "args": ["servers/search.mjs"],
  "env": "SEARCH_TOKEN=abc",
  "headers": "",
  "tags": ["internal", "search"],
  "autoStart": true,
  "enabled": true
}
```

`args` may be an array or newline-separated string. `env` and `headers` are parsed as `KEY=value` and
`Header: value` lines and stored encrypted. For `"transport": "http"`, send `url` instead of `command`/`args`.

---

## Tools and executions

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/tools?serverId=` | `tool:read` | Discovered tools with JSON schemas |
| PATCH | `/tools/:id` | `server:manage` | `{enabled?, requiresApproval?}` |
| POST | `/tools/:id/execute` | `tool:execute` | Validate and execute over MCP |
| GET | `/executions?limit=&serverId=&status=` | `observability:read` | Execution history |

```bash
curl -b cookies.txt -X POST http://127.0.0.1:4317/api/tools/<id>/execute \
  -H 'content-type: application/json' \
  -d '{"arguments":{"expression":"(12+4)*3.5"}}'
```

Responses:

- `200` `{ok, status:"success"|"error", execution:{id, durationMs, result, text, isError, …}}`
- `202` `{ok, status:"pending_approval", approval:{id,…}}` — an operator must wait for an administrator
- `422` `{ok:false, error:"Arguments do not match the tool schema", details:{issues:[{path,message}]}}`
- `403` policy denial, `409` tool disabled, `502` MCP transport failure

Re-submit an approved call with `{"approvalId": "<id>"}` plus the **identical** argument object. Approvals are
single-use and bound to server + tool + arguments.

---

## Resources

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/resources?serverId=` | `resource:read` | Static resources and templates |
| POST | `/resources/read` | `resource:read` | `{serverId, uri}` → `{contents, durationMs}` |
| GET | `/resource-reads?limit=` | `observability:read` | Read history |
| GET | `/notifications?limit=` | `resource:read` | `resources/updated` notifications |

## Prompts

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/prompts?serverId=` | `prompt:read` | Server prompts |
| POST | `/prompts/preview` | `prompt:read` | `{serverId, name, arguments}` → `{messages}` |
| GET | `/custom-prompts` | `prompt:read` | Prompt Studio templates |
| POST | `/custom-prompts` | `prompt:manage` | Create `{name, category, description, template, arguments[]}` |
| PATCH | `/custom-prompts/:id` | `prompt:manage` | Update |
| DELETE | `/custom-prompts/:id` | `prompt:manage` | Delete |
| POST | `/custom-prompts/:id/preview` | `prompt:read` | `{values}` → `{rendered}` |

## Approvals

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/approvals?status=` | `security:read` | Approval queue |
| POST | `/approvals/:id/decide` | `security:manage` | `{decision:"approve"\|"reject", note?}` |

---

## Observability

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/overview` | `observability:read` | Dashboard aggregates, recent activity, server health |
| GET | `/observability?hours=24` | `observability:read` | Overview + timeseries, tool usage, errors, latency percentiles, resource stats |
| GET | `/observability/timeline?limit=&serverId=` | `observability:read` | Individual execution events |
| GET | `/audit?limit=&action=` | `audit:read` | Audit trail |

## Security

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/security` | `security:read` | Users, role matrix, sessions, policies, approvals, secret status, events |
| POST | `/users` | `user:manage` | Create `{email, name, password, role}` |
| PATCH | `/users/:id` | `user:manage` | `{role}` |
| DELETE | `/users/:id` | `user:manage` | Delete (cannot remove self or the last admin) |
| DELETE | `/security/sessions/:id` | `user:manage` | Revoke a session |
| POST | `/policies` | `security:manage` | Create `{scope, subject, permission, effect, requiresApproval?, note?}` |
| DELETE | `/policies/:id` | `security:manage` | Delete a policy |

`scope` ∈ `global | role | user | server | tool | tag`. `subject` is the role name, email, server id, tool
name or tag; use `*` for global.

## Integrations

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/integrations` | `integration:read` | Catalog + status (masked config) |
| PUT | `/integrations/:key` | `integration:manage` | `{config:{field:value}}` (encrypted) |
| POST | `/integrations/:key/test` | `integration:read` | Perform a real provider check |
| POST | `/integrations/:key/action` | `integration:manage` | Provider action (see below) |
| GET | `/integrations/catalog/definitions` | `integration:read` | Field/capability definitions |

Keys: `github`, `filesystem`, `database`, `rest-api`, `documents`, `webhook`.

Actions: `database` → `{action:"query", sql}` (read-only), `documents` → `{action:"extract", path}`,
`github` → `{action:"repos"}`, `rest-api` → `{action:"get", path?}`, `webhook` → `{action:"send", payload?}`.

## Platform

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness, version, connected server count |
| GET | `/meta` | authenticated | Platform, runtime, SDK version, migrations |
| GET | `/settings` | `security:read` | Editable settings + masked MCP token |
| PUT | `/settings` | `user:manage` | Update `platform.name`, `security.require_approval_destructive`, `rate.limit_per_minute` |
| POST | `/settings/rotate-mcp-token` | `user:manage` | Rotate the `/mcp` bearer token |
| GET | `/playground/endpoints` | `server:read` | Catalog with per-role availability |
| POST | `/playground/request` | `server:read` | `{method, path, body?}` → real response |
| GET | `/deployments` | `deployment:read` | Readiness history + environments |
| POST | `/deployments` | `deployment:manage` | Run readiness checks |
| GET | `/deployments/manifest` | `deployment:read` | Downloadable config manifest (secrets excluded) |
| GET | `/migrations` | `deployment:read` | Applied migrations |
| POST | `/migrations/run` | `deployment:manage` | Apply pending migrations |

---

## MCP endpoint (the platform as an MCP server)

`POST /mcp` implements the **Streamable HTTP** transport (stateless, JSON responses). Authentication is a
bearer token equal to the stored `mcp.http_token`:

```
Authorization: Bearer <token>
```

Tools exposed: `list_servers`, `list_server_tools`, `execute_tool`, `read_resource`, `platform_metrics`,
`recent_executions`. `GET /mcp` and `DELETE /mcp` return `405` because the endpoint is stateless.

The seeded **Nexus Control (HTTP)** server points at this endpoint, so the control plane manages itself as a
real remote MCP server.
