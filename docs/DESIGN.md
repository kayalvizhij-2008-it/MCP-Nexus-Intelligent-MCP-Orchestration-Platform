# MCPNEXUS Design System

## 1. Product direction

MCPNEXUS is a **premium developer-infrastructure control plane**: a dark, dense,
instrument-grade interface for discovering, orchestrating, securing and observing
Model Context Protocol connections. The visual language is inspired by production
developer tools (Novu, Unkey, Modal, Liveblocks, Turso, Redis, DigitalOcean) and
is built on the macro-structure of the `split-studio` reference layout: a fixed
left navigation rail, a persistent top bar, and a scrollable content canvas with
a single, high-impact 3D hero on the landing surface.

## 2. Research references

Inspo MCP research (production screens, design systems):

- `novu-co` — notification infrastructure, dense tables, status pills.
- `unkey-com` — monospace identifiers, diagrammatic architecture, 64 px headline.
- `developer-apple-com` — specimen layout, generous whitespace, hardware-grade polish.
- `digitalocean-com` — infrastructure cards, status badges, connection counts.
- `liveblocks-io` — sidebar navigation, feature-stack sections, 64 px headline.
- `modal-com` — specimen/central glowing visual, Inter/Goga typography.
- `redis-io` — data-density tables, metric tiles.
- `turso-tech` — edge/database positioning, technical copy.

Design systems read: Modal (Specimen, glowing central visual), Unkey (Map/Diagram,
mono labels), Liveblocks (Feature Stack, sidebar nav).

## 3. Palette (locked)

| Token | Hex | Role |
| --- | --- | --- |
| `--color-surface-950` | `#080B12` | Page background |
| `--color-surface-900` | `#0D1320` | Surface / sidebar |
| `--color-surface-850` | `#121B2B` | Elevated cards |
| `--color-surface-800` | `#17243A` | Interactive / hover |
| `--color-accent` | `#7C5CFF` | Primary accent (violet) |
| `--color-sky` | `#36C9F0` | Secondary accent (cyan) |
| `--color-accent-soft` | `#9B8CFF` | Highlight |
| `--color-ok` | `#35D6A0` | Success |
| `--color-warn` | `#F5B95F` | Warning |
| `--color-err` | `#FF647C` | Error |
| `--color-ink` | `#F4F6FC` | Primary text |
| `--color-slate-400` | `#9AA8BD` | Muted text |

Tokens are remapped onto the existing Tailwind surface/accent names so every
existing page restyles automatically without markup changes.

## 4. Typography

- Body / UI: `Inter` (system fallback stack).
- Identifiers, payloads, tool names: `JetBrains Mono` via `.mono`.
- Headline scale: 56 px (hero) → 32 px (page title) → 20 px (section).
- Uppercase tracking labels (`eyebrow`, `.nav-group`) at 9.5–11 px.

## 5. Layout

- Desktop (≥1024 px): 236 px collapsible sidebar (68 px collapsed) + sticky 52 px
  top bar + scrollable content canvas (max 1400 px).
- Mobile (<1024 px): sidebar becomes a spring-animated drawer with backdrop,
  focus management and Escape-to-close.
- Breakpoints verified: 360, 390, 768, 1024, 1440, 1920.

## 6. Component inventory

Primitives in `src/web/components/ui.tsx` and `interactions.tsx`:

- `Button` (primary / ghost / outline / danger, sizes sm/md/lg, loading state)
- `IconButton` (tooltip, focus ring)
- `AnimatedButton`, `MagneticButton`, `GlowButton`, `CommandButton`
- `ActionMenu` (keyboard-navigable, real actions only)
- `Tooltip`, `SegmentedControl`, `StatusBadge`, `CopyChip`
- `SkeletonRows`, `InlineSpinner`, `AnimatedNumber`
- `Badge`, `Dot`, `Tabs`, `Modal`, `Toast`, `JsonViewer`

Every button has hover, pressed, disabled, loading and focus-visible states and
performs a real action (navigation, request, modal, copy, export).

## 7. Motion

- `motion/react` for component transitions (sidebar collapse, page transitions,
  modals, drawers, active-nav indicator via `layoutId`).
- `gsap` + `ScrollTrigger` for the landing page: section reveals, staggered
  feature groups, SVG path draw, parallax on the 3D canvas container.
- `animejs` available for micro-interactions.
- All animations respect `prefers-reduced-motion` (CSS block + JS early-return
  + `useReducedMotion`).
- `immediateRender: false` on scroll reveals so a stalled trigger never leaves
  content invisible.

## 8. 3D (ImmersiveHero)

- Plain `three` (imperative), not React Three Fiber, to avoid reconciler risk.
- `MCPNetworkCore` (icosahedron + concentric rings + node meshes), `NetworkConnections`
  (animated packets along edges), `NetworkParticles` (instanced-ish points).
- DPR capped at 1.5 (1.75 on high-DPI), IntersectionObserver pauses rendering
  when off-screen, `document.hidden` pauses, full dispose on unmount.
- WebGL context-loss → SVG fallback (static diagram).
- Lazy-loaded chunk (`ImmersiveHero-*.js`) so the main bundle stays lean.
- Pointer parallax with lerp smoothing.

## 9. Responsive + accessibility

- Mobile drawer with focus trap, Escape, scroll lock.
- Collapsed sidebar tooltips.
- `aria-label` on icon buttons, `role="dialog"` on drawer, `aria-modal`.
- Focus-visible rings on all interactive elements.
- Reduced-motion honored globally.

## 10. Verification

- `npm run typecheck` → 0 errors.
- `npx vitest run` → 28/28 passing.
- `npm run build` → success (22.6 s).
- Browser: landing hero renders WebGL canvas (705×700), no console errors
  except expected 401 for signed-out `/api/auth/me` and the (fixed) THREE.Clock
  deprecation.
- Screenshots: `docs/screenshots/05-landing-hero.png`, `06-landing-mid.png`,
  `07-landing-mobile.png`, `08-servers.png`, `09-executions.png`,
  `10-approvals.png`, `11-mobile-collapsed.png`, `12-mobile-drawer.png`.
- Reduced-motion: not manually toggled in this run; CSS + JS paths are in place.
