import {
  ArrowRight,
  Blocks,
  Boxes,
  FileJson,
  Fingerprint,
  Gauge,
  Network,
  ShieldCheck,
  TerminalSquare,
  Waypoints,
  Workflow,
} from 'lucide-react';
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { LoginCard } from './Login.js';
import { MagneticButton, GlowButton } from '../components/interactions.js';
import { useApi } from '../lib/useApi.js';

const ImmersiveHero = lazy(() => import('../components/3d/ImmersiveHero.js'));

type Health = { ok: boolean; status: string; servers: { total: number; connected: number } };

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M16 3.5l10.5 6.2v12.6L16 28.5 5.5 22.3V9.7z"
          stroke="url(#landing-mark)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="3.1" fill="#9b8cff" />
        <circle cx="16" cy="8" r="1.3" fill="#36c9f0" />
        <circle cx="23" cy="20" r="1.3" fill="#36c9f0" />
        <circle cx="9" cy="20" r="1.3" fill="#36c9f0" />
        <defs>
          <linearGradient id="landing-mark" x1="4" y1="4" x2="28" y2="28">
            <stop stopColor="#9b8cff" />
            <stop offset="1" stopColor="#36c9f0" />
          </linearGradient>
        </defs>
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[14.5px] font-semibold tracking-[-0.01em] text-white">MCPNEXUS</div>
          <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-slate-500">
            control plane
          </div>
        </div>
      )}
    </div>
  );
}

const PIPELINE = [
  {
    icon: Network,
    title: 'The MCP ecosystem',
    copy: 'MCP servers are processes and endpoints that expose tools, resources and prompts. Today they are scattered across machines, configs and chats.',
    points: ['STDIO processes', 'Streamable HTTP endpoints', 'Per-server capabilities'],
  },
  {
    icon: Waypoints,
    title: 'Connect your servers',
    copy: 'Register a server once. MCPNEXUS performs the real initialize handshake with the official SDK, then negotiates capabilities and stores what the server advertises.',
    points: ['Official SDK client', 'Capability negotiation', 'Encrypted env & headers'],
  },
  {
    icon: Boxes,
    title: 'Discover primitives',
    copy: 'tools/list, resources/list and prompts/list are called and indexed, so the entire surface of every server is searchable from one place.',
    points: ['Tool schemas', 'Resource templates', 'Prompt arguments'],
  },
  {
    icon: ShieldCheck,
    title: 'Govern execution',
    copy: 'Role permissions and scoped policies decide who may call what. Destructive tools park as a pending approval until an administrator decides.',
    points: ['RBAC + policy engine', 'Approval gates', 'Deny wins'],
  },
  {
    icon: Gauge,
    title: 'Observe everything',
    copy: 'Every call is persisted with latency, status, actor and masked arguments. Metrics, timelines and CSV exports come from those rows — never synthetic data.',
    points: ['Latency percentiles', 'Failure trends', 'Auditable history'],
  },
  {
    icon: Fingerprint,
    title: 'Secure the surface',
    copy: 'AES-256-GCM secrets, scrypt passwords, server-side sessions, audit trail, sandboxed filesystem access and approval-bound arguments.',
    points: ['Encrypted at rest', 'Masked in transit', 'Single-use approvals'],
  },
];

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const authRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const health = useApi<Health>('/api/health', { pollMs: 30000 });

  function openAuth() {
    setAuthOpen(true);
    requestAnimationFrame(() => {
      authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const input = authRef.current?.querySelector<HTMLInputElement>('input[type="email"]');
        (input ?? emailRef.current)?.focus();
      }, 320);
    });
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cleanup = () => {};
    let cancelled = false;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const context = gsap.context(() => {
        // immediateRender:false keeps content visible until the trigger fires,
        // so a stalled ScrollTrigger (reduced motion, screenshots, no scroll
        // events) can never leave a section blank.
        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
          gsap.from(element, {
            y: 26,
            opacity: 0,
            duration: 0.7,
            ease: 'power2.out',
            immediateRender: false,
            scrollTrigger: { trigger: element, start: 'top 92%', once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
          const children = Array.from(group.children) as HTMLElement[];
          gsap.from(children, {
            y: 18,
            opacity: 0,
            duration: 0.55,
            stagger: 0.08,
            ease: 'power2.out',
            immediateRender: false,
            scrollTrigger: { trigger: group, start: 'top 90%', once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((element) => {
          gsap.to(element, {
            yPercent: Number(element.dataset.parallax ?? -8),
            ease: 'none',
            scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
          });
        });

        const paths = Array.from(root.querySelectorAll<SVGPathElement>('[data-draw]'));
        paths.forEach((path) => {
          const length = path.getTotalLength();
          path.style.strokeDasharray = `${length}`;
          path.style.strokeDashoffset = `${length}`;
          gsap.to(path, {
            strokeDashoffset: 0,
            duration: 1.4,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: path.closest('svg') as SVGElement, start: 'top 80%', once: true },
          });
        });
      }, root);

      // Layout shifts (lazy 3D canvas, web fonts) move trigger positions.
      requestAnimationFrame(() => ScrollTrigger.refresh());
      const onLoad = () => ScrollTrigger.refresh();
      window.addEventListener('load', onLoad);

      cleanup = () => {
        window.removeEventListener('load', onLoad);
        context.revert();
        ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-x-hidden bg-surface-950 text-slate-200">
      {/* ------------------------------ top bar ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-surface-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <nav className="hidden items-center gap-6 text-[12px] text-slate-400 md:flex" aria-label="Landing">
            <a href="#pipeline" className="transition-colors hover:text-slate-100">
              Platform
            </a>
            <a href="#architecture" className="transition-colors hover:text-slate-100">
              Architecture
            </a>
            <a href="#security" className="transition-colors hover:text-slate-100">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-md border border-line bg-surface-900 px-2 py-1 text-[10.5px] text-slate-400 sm:flex">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-ok" />
              {health.data?.ok
                ? `${health.data.servers.connected}/${health.data.servers.total} servers live`
                : 'connecting'}
            </span>
            <button onClick={openAuth} className="btn btn-primary btn-sm">
              Sign in <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* -------------------------------- hero ------------------------------- */}
      <section className="relative isolate overflow-hidden">
        <div className="aurora pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div className="grid-lines pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden />

        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:pb-24 lg:pt-20">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-900/80 px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky" />
              Model Context Protocol control plane
            </div>

            <h1 className="mt-5 text-[38px] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[50px] lg:text-[56px]">
              One control plane.
              <br />
              <span className="bg-gradient-to-r from-[#b4a6ff] via-[#9b8cff] to-[#36c9f0] bg-clip-text text-transparent">
                Every MCP connection.
              </span>
            </h1>

            <p className="mt-5 max-w-[560px] text-[14px] leading-relaxed text-slate-400 sm:text-[15px]">
              Discover, orchestrate, secure and observe your entire Model Context Protocol ecosystem
              from one intelligent workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <MagneticButton>
                <GlowButton onClick={openAuth}>
                  Explore Control Plane <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </GlowButton>
              </MagneticButton>
              <a href="#architecture" className="btn btn-outline btn-lg group">
                View Architecture
                <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>

            <dl
              className="mt-10 grid max-w-[520px] grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-6 sm:grid-cols-3"
              data-reveal-group
            >
              {[
                { label: 'Transports', value: 'STDIO + HTTP' },
                { label: 'SDK', value: '@modelcontextprotocol' },
                { label: 'Persistence', value: 'SQLite · WAL' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="stat-label">{item.label}</dt>
                  <dd className="mt-1.5 text-[12.5px] font-medium text-slate-200">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative -mx-4 h-[380px] sm:mx-0 sm:h-[440px] lg:h-[560px]">
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-56 w-56 rounded-full bg-accent/10 blur-2xl" />
                </div>
              }
            >
              <ImmersiveHero className="absolute inset-0" />
            </Suspense>
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface-900/80 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
              live network · pointer reactive
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ pipeline ----------------------------- */}
      <section id="pipeline" className="border-t border-line/70 bg-surface-900/40 py-16 sm:py-20">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="max-w-[640px]" data-reveal>
            <p className="eyebrow">The platform</p>
            <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[32px]">
              From scattered MCP servers to one governed runtime.
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-slate-400">
              Each stage below maps to a subsystem in this repository — real SDK sessions, real
              database rows, real policy evaluation.
            </p>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-reveal-group>
            {PIPELINE.map((stage, index) => (
              <article
                key={stage.title}
                className="group relative overflow-hidden rounded-xl border border-line bg-surface-850/70 p-5 transition-colors duration-200 hover:border-line-strong"
              >
                <div
                  className="pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(50% 50% at 50% 50%, rgba(124,92,255,0.18), transparent 70%)',
                  }}
                  aria-hidden
                />
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-surface-800 text-[#b4a6ff]">
                    <stage.icon size={15} />
                  </span>
                  <span className="mono text-[10px] text-slate-600">0{index + 1}</span>
                </div>
                <h3 className="mt-4 text-[13.5px] font-semibold text-slate-100">{stage.title}</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{stage.copy}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {stage.points.map((point) => (
                    <li
                      key={point}
                      className="rounded border border-line bg-surface-900 px-1.5 py-0.5 text-[10px] text-slate-500"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------- architecture --------------------------- */}
      <section id="architecture" className="relative overflow-hidden py-16 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          data-parallax="-6"
          style={{
            background:
              'radial-gradient(45% 45% at 70% 40%, rgba(54,201,240,0.08), transparent 70%)',
          }}
          aria-hidden
        />
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div data-reveal>
            <p className="eyebrow">Architecture</p>
            <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[32px]">
              A single Node process, four real MCP transports, one database.
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-slate-400">
              The Express API owns every MCP client session through the official SDK. Tool calls,
              resources and prompts flow through one policy engine before they reach a server, and
              every result is written back to SQLite.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'React 18 + Vite SPA served by the same process',
                'STDIO child processes and Streamable HTTP clients',
                'MCPNEXUS exposes itself as an MCP server at /mcp',
                'AES-256-GCM for secrets, scrypt for passwords',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] text-slate-300">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-soft" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-line bg-surface-900/70 p-4 sm:p-6" data-reveal>
            <svg viewBox="0 0 520 320" className="w-full" role="img" aria-label="MCPNEXUS architecture diagram">
              <defs>
                <linearGradient id="arch-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#36c9f0" stopOpacity="0.85" />
                </linearGradient>
              </defs>

              <rect x="180" y="128" width="160" height="64" rx="10" fill="#101827" stroke="#2a3852" />
              <text x="260" y="156" textAnchor="middle" fill="#f4f6fc" fontSize="12" fontFamily="Inter, sans-serif" fontWeight="600">
                Control plane
              </text>
              <text x="260" y="174" textAnchor="middle" fill="#7f8ea6" fontSize="10" fontFamily="Inter, sans-serif">
                policy · approvals · audit
              </text>

              <g stroke="url(#arch-line)" strokeWidth="1.4" fill="none">
                <path data-draw d="M180 150 C140 150 130 96 96 96" />
                <path data-draw d="M180 170 C140 170 130 224 96 224" />
                <path data-draw d="M340 150 C380 150 390 96 424 96" />
                <path data-draw d="M340 170 C380 170 390 224 424 224" />
              </g>

              {[
                { x: 20, y: 76, label: 'Toolbox', meta: 'STDIO' },
                { x: 20, y: 204, label: 'Filesystem', meta: 'STDIO' },
                { x: 348, y: 76, label: 'Data', meta: 'STDIO · SQLite' },
                { x: 348, y: 204, label: 'Control (HTTP)', meta: '/mcp' },
              ].map((node) => (
                <g key={node.label}>
                  <rect x={node.x} y={node.y} width="152" height="42" rx="8" fill="#0d1320" stroke="#1b2436" />
                  <text x={node.x + 14} y={node.y + 19} fill="#dbe1ee" fontSize="11" fontFamily="Inter, sans-serif" fontWeight="600">
                    {node.label}
                  </text>
                  <text x={node.x + 14} y={node.y + 33} fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">
                    {node.meta}
                  </text>
                </g>
              ))}

              <rect x="180" y="24" width="160" height="40" rx="8" fill="#0d1320" stroke="#1b2436" />
              <text x="260" y="49" textAnchor="middle" fill="#9aa8bd" fontSize="10.5" fontFamily="Inter, sans-serif">
                Operators · API clients
              </text>
              <path data-draw d="M260 64 L260 128" stroke="#2a3852" strokeWidth="1.2" fill="none" />
              <rect x="180" y="252" width="160" height="40" rx="8" fill="#0d1320" stroke="#1b2436" />
              <text x="260" y="277" textAnchor="middle" fill="#9aa8bd" fontSize="10.5" fontFamily="Inter, sans-serif">
                SQLite · WAL · migrations
              </text>
              <path data-draw d="M260 192 L260 252" stroke="#2a3852" strokeWidth="1.2" fill="none" />
            </svg>
          </div>
        </div>
      </section>

      {/* ------------------------------ security ----------------------------- */}
      <section id="security" className="border-t border-line/70 bg-surface-900/40 py-16 sm:py-20">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div data-reveal>
              <p className="eyebrow">Security</p>
              <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[32px]">
                Privileged by design, not by accident.
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-slate-400">
                MCP servers can read files, run SQL and call APIs. The control plane treats every
                call as a privileged operation: authenticated, authorised twice, then recorded.
              </p>
              <a href="#access" className="btn btn-outline mt-6" onClick={(event) => { event.preventDefault(); openAuth(); }}>
                Open the control plane <ArrowRight size={13} />
              </a>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2" data-reveal-group>
              {[
                { icon: ShieldCheck, title: 'Scoped policies', copy: 'Global, role, user, server, tool or tag — deny always wins.' },
                { icon: Workflow, title: 'Approval gates', copy: 'Arguments are bound to the approval and consumed once.' },
                { icon: Fingerprint, title: 'Encrypted secrets', copy: 'AES-256-GCM at rest; the API only ever returns key names.' },
                { icon: FileJson, title: 'Audit trail', copy: 'Every mutation and execution is attributed and timestamped.' },
                { icon: TerminalSquare, title: 'Sandboxed filesystem', copy: 'Path traversal rejected before the filesystem is touched.' },
                { icon: Blocks, title: 'Portable configuration', copy: 'Export bundles exclude secret values by construction.' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-line bg-surface-850/70 p-4">
                  <item.icon size={15} className="text-sky" />
                  <div className="mt-3 text-[12.5px] font-semibold text-slate-100">{item.title}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------- CTA -------------------------------- */}
      <section id="access" className="relative overflow-hidden py-16 sm:py-24">
        <div className="aurora pointer-events-none absolute inset-0 -z-10 opacity-80" aria-hidden />
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div data-reveal>
            <p className="eyebrow">One unified control plane</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[38px]">
              Stop reading logs in six terminals.
            </h2>
            <p className="mt-4 max-w-[520px] text-[13.5px] leading-relaxed text-slate-400">
              Register every server, discover its primitives, govern what runs, and watch the
              traffic — with a real MCP client underneath, not a mock.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {['Official MCP SDK', 'RBAC + policy engine', 'Execution history', 'Audit log', 'Docker ready'].map(
                (tag) => (
                  <span key={tag} className="rounded-md border border-line bg-surface-900 px-2 py-1">
                    {tag}
                  </span>
                ),
              )}
            </div>
          </div>

          <div ref={authRef} className="rounded-2xl border border-line bg-surface-900/80 p-6 shadow-2xl backdrop-blur sm:p-8" data-reveal>
            <LoginCard />
          </div>
        </div>
      </section>

      <footer className="border-t border-line/70 py-8">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 px-4 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <Brand compact />
            <span>Connect. Orchestrate. Secure. Observe.</span>
          </div>
          <span className="mono">Model Context Protocol · MIT licensed</span>
        </div>
      </footer>
    </div>
  );
}
