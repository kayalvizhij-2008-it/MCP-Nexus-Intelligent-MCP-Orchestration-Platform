# Testing

## Automated suite

```bash
npm test          # vitest run
npm run typecheck # tsc server + web projects
npm run build     # production bundle
```

The suite (`tests/nexus.test.ts`, 28 tests) boots the **real** application in a
throwaway data directory:

```ts
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpnexus-test-'));
process.env.MCPNEXUS_DATA_DIR = dataDir;
process.env.MCPNEXUS_MASTER_KEY = crypto.randomBytes(32).toString('hex');
```

before any module is imported, so migrations, seeding, the master key and the
SQLite file are all isolated from `./data`. `afterAll` closes the database handle
before removing the directory (Windows keeps files locked otherwise).

### Coverage

| Area | What is asserted |
|---|---|
| Crypto | scrypt hashing never stores plaintext; AES-256-GCM round-trip; masking |
| Schema validation | required fields, wrong primitive types, `$.path` reporting |
| Authentication | 401 without a session, wrong password rejected, admin login + permission list |
| Registry | seeded servers list with discovered primitive counts and live connection |
| Registration | invalid STDIO configuration rejected with 400 |
| MCP execution | real STDIO `tools/call` returns `56`; schema violation → 422 with path |
| Persistence | executions readable through `/api/executions` |
| Approvals + RBAC | operator call parked as 202 → admin approves → executes and writes a file; viewer gets 403 |
| Resources | `resources/read` over MCP returns content |
| Prompts | `prompts/preview` expands arguments into messages |
| Observability | `/api/overview` metrics come from persisted rows; audit trail contains `tool.executed` |
| Export | bundle schema, key names only, stored secret value absent from the payload |
| Import | dry run does not write, apply creates, skip avoids duplicates, rename suffixes the slug, invalid entries reported per item, wrong bundle format rejected |
| Config diff | changed field detected with before/after values |
| Execution history | search filter, status filter, masked secrets, CSV header and content |
| Security | `no-store` / `DENY` / `nosniff` headers; no hardcoded default password in config |

The tests exercise real child-process MCP servers — they are integration tests,
not mocks. A run takes ~20s.

## Manual verification

```bash
npm run dev
curl -s http://127.0.0.1:4317/api/health | jq
# sign in (writes the session cookie to a jar)
curl -s -c cookies.txt -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  http://127.0.0.1:4317/api/auth/login | jq '{ok, role: .user.role}'
curl -s -b cookies.txt http://127.0.0.1:4317/api/servers | jq '.servers[] | {name, status, counts}'
```

Then in the UI:

1. **Servers** → start/stop a server, open its workspace, run Diagnostics and
   Compatibility.
2. **Tool Explorer** → run `calculate` with `(12+4)*3.5` → `56`; run `write_file`
   as a non-admin and confirm it parks for approval.
3. **Resources / Prompts** → read `nexus://toolbox/about`, preview `summarize`.
4. **Security** → approve the parked call, add a viewer account, confirm 403.
5. **Observability** → search execution history, export CSV, confirm masked args.
6. **Servers → Export/Import** → export the bundle, re-import with dry run.

## Not covered automatically

- Browser end-to-end automation (Playwright) is not part of the suite; UI flows
  were verified manually and through the API contract they call.
- Load/performance testing under concurrent MCP sessions.
- Remote Streamable HTTP servers other than the platform's own `/mcp` endpoint.
