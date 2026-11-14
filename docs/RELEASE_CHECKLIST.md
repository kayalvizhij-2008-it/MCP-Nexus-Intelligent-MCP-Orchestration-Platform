# Release checklist

Run through this before tagging a public release.

## Verification

- [ ] `npm ci` from a clean checkout
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` — all tests pass
- [ ] `npm run build` produces `dist/web` and `dist/server`
- [ ] `npm start` boots, `/api/health` returns `ok: true`
- [ ] First boot on an empty data directory creates `data/initial-admin.txt` and no default password exists
- [ ] Sign in, execute a real tool, read a resource, preview a prompt
- [ ] Approval flow: non-admin parked → admin approves → executes
- [ ] Export a bundle, confirm no secret value appears in it, re-import with a dry run
- [ ] Diagnostics and Compatibility report without errors on all bundled servers
- [ ] Browser console has no errors on each page; no failed `/api` requests besides the expected 401 on first load

## Repository hygiene

- [ ] `git status` clean; no `data/`, `.env`, `*.log`, cookie jars or `dist/` tracked
- [ ] `git log --all -p | grep -iE "api[_-]?key|secret|password"` shows no real credentials
- [ ] `data/master.key` and `master.key` are not in the tree
- [ ] `LICENSE` present and correct
- [ ] README screenshots reflect the current UI
- [ ] No badges that claim CI, coverage, downloads or users that do not exist

## Documentation

- [ ] README quick start works verbatim on a clean machine
- [ ] `.env.example` lists every variable the code reads
- [ ] `docs/API.md` matches the registered routes
- [ ] `docs/SECURITY.md` residual risks are still accurate

## Tagging

- [ ] Version bumped in `package.json` and `src/server/config.ts` (`PLATFORM_VERSION`)
- [ ] `CHANGELOG` or release notes describe what changed
- [ ] Tag `vX.Y.Z`; push only when authorised
