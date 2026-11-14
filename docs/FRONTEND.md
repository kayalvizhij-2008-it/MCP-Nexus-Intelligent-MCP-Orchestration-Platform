# MCPNEXUS Frontend Guide

## 1. Stack

React 18, React Router 6, Vite 6, Tailwind v4 (`@theme` tokens in
`src/web/styles.css`), TypeScript strict. State is server-backed via
`lib/api.ts` + `lib/useApi.ts`; no client-side store.

## 2. Entry points

- `src/web/main.tsx` — mounts `App`.
- `src/web/App.tsx` — auth gate (signed-out → `LandingPage`), router, layout.
- `src/web/components/Layout.tsx` — shell (sidebar, top bar, drawer, palette).
- `src/web/components/CommandPalette.tsx` — ⌘K/Ctrl+K, pages + live servers.

## 3. Design tokens

All tokens live in `src/web/styles.css` under `@theme`. Surfaces, accents, text
and semantic colors are exposed as Tailwind utilities (`bg-surface-900`,
`text-accent`, `border-line`, …). Never hardcode hex in components; use tokens.

## 4. Component usage

### Buttons

```tsx
<Button variant="primary" size="md" loading={saving} onClick={save}>Save</Button>
<Button variant="outline" size="lg">View Architecture</Button>
<IconButton label="Collapse navigation" onClick={collapse}><PanelLeftClose /></IconButton>
<GlowButton onClick={openAuth}>Explore Control Plane</GlowButton>
<MagneticButton><GlowButton …/></MagneticButton>
```

Variants: `primary`, `ghost`, `outline`, `danger`. Sizes: `sm`, `md`, `lg`.
Every button must have a real handler; disabled/loading states are built in.

### Status + feedback

`StatusBadge`, `Badge`, `Dot`, `Toast` (via `lib/toast`), `SkeletonRows`,
`InlineSpinner`, `AnimatedNumber`, `CopyChip`.

### Layout

`PageHeader { title, subtitle, eyebrow, actions }`, `Breadcrumbs` (auto from
route), `SegmentedControl`, `ActionMenu`, `Tooltip`.

## 5. Motion

- Use `motion/react` for enter/exit/layout animations; respect `useReducedMotion`.
- GSAP is loaded lazily on the landing page only:
  ```ts
  const { default: gsap } = await import('gsap');
  const { ScrollTrigger } = await import('gsap/ScrollTrigger');
  ```
- Scroll reveals use `immediateRender: false` and `once: true`.
- Call `ScrollTrigger.refresh()` after lazy content (3D canvas, fonts) loads.

## 6. 3D

`src/web/components/3d/` — `MCPNetworkCore.ts`, `NetworkConnections.ts`,
`NetworkParticles.ts`, `ImmersiveHero.tsx`. Import `ImmersiveHero` via
`React.lazy` so `three` stays in its own chunk. The scene is imperative `three`;
dispose everything on unmount. See DESIGN.md §8 for performance rules.

`three` is untyped in this project (see `src/web/three-shim.d.ts`): installing
`@types/three` makes `tsc` exhaust its zone allocator on this toolchain, so the
3D layer is typed at the module boundary. Runtime behaviour is verified in a
browser.

## 7. Responsive

- `lg:` (1024 px) is the sidebar breakpoint.
- Mobile drawer: focus move to close button on open, Escape closes, body scroll
  locked, closes on route change.
- Test widths: 320, 360, 390, 430, 768, 1024, 1280, 1440, 1920.
- `main .grid > *` and `main .flex > *` get `min-width: 0`, and `.panel` is
  `min-w-0`. Wide tables must sit inside `overflow-x-auto` so they scroll
  instead of widening the page (verified: no horizontal overflow at 320 px on
  any route).

## 8. Data fetching

`useApi<T>(path, { pollMs })` returns `{ data, error, loading, reload }`.
Mutations go through `api.post/put/patch/delete` and call `reload()` or
invalidate by re-running. 401 dispatches `nexus:unauthorised` → redirect to
landing.

## 9. Routes

`/` (dashboard, also reachable at `/overview`), `/servers`, `/servers/:id`,
`/tools`, `/resources`, `/prompts`, `/playground`, `/executions`, `/approvals`,
`/observability`, `/security`, `/integrations`, `/deployments`, `/settings`,
`/unauthorized`, and a catch-all 404. Every page is `React.lazy`-loaded;
`ErrorBoundary` in `App.tsx` renders the global error page.

Audit logs, sessions, users, roles and secrets live in the Security page tabs;
execution history lives in Executions; the signed-in identity and password
change live in Settings ("Your profile").

## 10. Adding a page

1. Create `src/web/pages/Foo.tsx` default-exporting a component.
2. Add a route in `App.tsx`.
3. Add a nav entry in `Layout.tsx` `NAV` (only if the page exists).
4. Add a label in `LABELS` for breadcrumbs.
5. Use `PageHeader` + existing primitives; no new CSS unless a token is missing.

## 11. Checks

```sh
npm run typecheck   # tsc server + web
npm run build       # vite + tsc server
npm test            # vitest (28 integration tests)
npm run dev         # API 4317 + Vite 5317
```
