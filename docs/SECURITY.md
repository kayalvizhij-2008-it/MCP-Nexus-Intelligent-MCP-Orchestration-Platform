# Security model

MCPNEXUS is a control plane for processes that can read files, run SQL and call
external APIs. It is treated as privileged infrastructure: every request is
authenticated, authorised twice (role + policy), and recorded.

## Identity and sessions

| Control | Implementation |
|---|---|
| Password storage | `scrypt` (N=16384, r=8, p=1) with a 16-byte random salt, constant-time compare |
| Session storage | Server-side `sessions` rows; the cookie carries a 32-byte random token, the database stores only its SHA-256 |
| Cookie | `nexus_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `MCPNEXUS_COOKIE_SECURE=true` or `NODE_ENV=production` |
| Expiry | `MCPNEXUS_SESSION_TTL_HOURS` (default 168h); expired rows are deleted on use |
| Logout | Row deleted server-side — a copied cookie stops working immediately |
| CSRF | Session cookie is `SameSite=Lax` and every mutation is a JSON `fetch` with a `content-type` that a cross-site form cannot produce; no cookie is ever accepted on `GET` for a mutation |

**First-run administrator.** There is no default password. On an empty database
the platform either uses `MCPNEXUS_ADMIN_PASSWORD` (CI/servers) or generates a
random password, writes it to `data/initial-admin.txt` (mode `0600`) and prints
only the file path. Sign in, change the password, delete the file.

## Authorisation

- **Roles:** `admin`, `operator`, `viewer` with a fixed permission matrix
  (`src/server/auth.ts`). A viewer can read tools but never execute them.
- **Policies** (`policies` table) are evaluated per call and can target a global,
  role, user, server, tool or tag subject. Explicit `deny` always wins; an
  `allow` row may set `requires_approval`.
- **Approval gate.** A call that requires approval is parked as a `pending`
  approval (HTTP `202`) and only runs after an administrator decides. The
  approved argument set is hashed by exact JSON comparison, so arguments cannot
  be swapped between approval and execution, and an approval is consumed once.
  Administrators auto-approve their own calls, which is recorded in the approval
  row (`Auto-approved for administrator`).
- **Transport auth.** `POST /mcp` requires `Authorization: Bearer <mcp.http_token>`
  where the token is generated per installation and stored in `settings`.

## Secrets

- Server `env` and `headers` are encrypted at rest with AES-256-GCM using a
  32-byte master key (`MCPNEXUS_MASTER_KEY` or `data/master.key`, mode `0600`).
  Stored format: `v1.<iv>.<tag>.<ciphertext>`.
- The API returns **key names only** (`envKeys`, `headerKeys`). Exported server
  bundles contain key names and never values.
- Execution arguments are persisted (they are needed to audit approvals) but
  every value under a secret-looking key (`token`, `secret`, `password`,
  `api_key`, `authorization`, `credential`, …) is masked with `••••••` before it
  leaves the process — including CSV exports.
- Passwords and session tokens are never logged. Server stdout/stderr is
  captured into `server_logs` and bounded to 500 lines per server.
- `.env`, `data/` and generated cookie jars are in `.gitignore`.

## Network and process isolation

- The Nexus Filesystem MCP server resolves every path with `path.resolve` and
  rejects anything that escapes its `--root` sandbox, including traversal via
  `..` and absolute paths.
- Outbound HTTP from the toolbox server is allow-listed to `http`/`https`, has a
  timeout and a response-size cap; it is approval-gated by policy.
- STDIO servers are spawned with an explicit `cwd` and only the environment the
  operator configured plus `PATH`.
- SQL in the analytics server is read-only: a single statement, `SELECT` only,
  `PRAGMA` and DDL/DML rejected before execution.

## HTTP hardening

Set by `src/server/app.ts` on every response:

- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`,
  `Permissions-Policy` denying camera/microphone/geolocation.
- `Cache-Control: no-store` on all `/api` responses.
- In production additionally `Strict-Transport-Security` and a
  `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'none'`,
  `form-action 'self'`).
- Sliding-window rate limit (`MCPNEXUS_RATE_LIMIT_PER_MINUTE`, default 240/min)
  per user id or IP, with `Retry-After`.
- Errors in production never echo stack traces or driver messages.

## Audit trail

`audit_log` records actor, action, target, detail JSON, IP and timestamp for
logins, server CRUD, start/stop, discovery failures, tool executions and denials,
approvals, policy changes, config restores, imports and exports. The table is
append-only from the API surface; there is no delete endpoint.

## Findings fixed in this pass

| Severity | Finding | Fix |
|---|---|---|
| Critical | Seeded administrator used a public, guessable password (`nexus-admin-2026`) on every new install | Removed the default; random password written to a `0600` file, or supplied via env |
| High | Authenticated API responses could be cached by an intermediary | `Cache-Control: no-store` on `/api` |
| Medium | No CSP/HSTS in production | Added, production only |
| Medium | Execution arguments with secret-looking keys were returned verbatim | Recursive masking on every execution response and CSV export |
| Low | Password was printed on the boot banner | Only the bootstrap file path is printed |

## Residual risks

- No MFA and no SSO; accounts are local to the installation.
- Remote MCP servers authenticate with a static bearer header — there is no OAuth
  device flow and headers are not refreshed.
- Sessions are stored in SQLite, so multi-node deployments would not share them.
- The CSP allows `style-src 'unsafe-inline'` because Tailwind emits inline style
  attributes; scripts are still restricted to same-origin.
- Approval of a destructive call is a human control — an administrator can
  approve anything, and that action is only as trustworthy as the account.

Report security issues privately to the maintainer rather than opening a public
issue.
