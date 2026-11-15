import {
  ArrowRight,
  Blocks,
  Boxes,
  Check,
  ChevronRight,
  Cpu,
  FileJson,
  Fingerprint,
  Gauge,
  KeyRound,
  Layers,
  Network,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Waypoints,
  Workflow,
  Wrench,
} from 'lucide-react';
import React, { Suspense, lazy, useRef, useState } from 'react';
import { GlowButton, MagneticButton, Reveal, RevealGroup, TiltCard } from '../components/interactions.js';
import { FlipCard } from '../components/interactions.js';
import { LoginCard } from './Login.js';
import { useApi } from '../lib/useApi.js';

const Combined3D = lazy(() => import('../components/3d/Combined3D.js'));

type Health = { ok: boolean; status: string; servers: { total: number; connected: number } };

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path
            d="M16 3.5l10.5 6.2v12.6L16 28.5 5.5 22.3V9.7z"
            stroke="url(#landing-mark)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="16" r="3.1" fill="#36C78A" />
          <circle cx="16" cy="8" r="1.3" fill="#A0E6BD" />
          <circle cx="23" cy="20" r="1.3" fill="#A0E6BD" />
          <circle cx="9" cy="20" r="1.3" fill="#D9B978" />
          <defs>
            <linearGradient id="landing-mark" x1="4" y1="4" x2="28" y2="28">
              <stop stopColor="#A0E6BD" />
              <stop offset="1" stopColor="#A0E6BD" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      {!compact && (
        <div className="leading-none">
          <div className="text-[14.5px] font-semibold tracking-[-0.015em] text-slate-50">MCPNEXUS</div>
          <div className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.24em] text-slate-500">
            control plane
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="mono text-[10px] text-accent">{index}</span>
      <span className="h-px w-8 bg-gradient-to-r from-accent/70 to-transparent" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{children}</span>
    </div>
  );
}

const CAPABILITIES = [
  {
    icon: Network,
    title: 'Pluggable transports',
    kicker: '01 · Connectivity',
    summary: 'STDIO child processes and Streamable HTTP endpoints in one registry.',
    detail: [
      'Official SDK client performs the initialize handshake',
      'Capabilities and server info persisted per connection',
      'Environment and headers encrypted before storage',
    ],
  },
  {
    icon: Boxes,
    title: 'Unified primitives',
    kicker: '02 · Discovery',
    summary: 'Tools, resources and prompts from every server, indexed and searchable.',
    detail: [
      'tools/list, resources/list, prompts/list indexed',
      'JSON schemas kept verbatim for every tool',
      'Resource templates and prompt arguments preserved',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Governed execution',
    kicker: '03 · Control',
    summary: 'Policy decides who may call what before the SDK call is made.',
    detail: [
      'RBAC plus scoped policies — deny always wins',
      'Sensitive calls park as approvals bound to arguments',
      'Every execution attributed and written to the audit trail',
    ],
  },
];

const WORKFLOW = [
  {
    title: 'Register the endpoint',
    copy: 'Point MCPNEXUS at a command, a URL or a container. Secrets are encrypted with AES-256-GCM before they touch the database.',
    meta: 'server.create',
  },
  {
    title: 'Negotiate capabilities',
    copy: 'The SDK client initializes the session, reads server info and capabilities, and records what the server actually advertises.',
    meta: 'initialize',
  },
  {
    title: 'Index the primitives',
    copy: 'Tools, resources and prompts are pulled with their schemas so every page is driven by the server itself, never a fixture.',
    meta: 'tools/list · resources/list · prompts/list',
  },
  {
    title: 'Evaluate policy',
    copy: 'Role permissions and scoped policies run before dispatch. A destructive tool becomes a pending approval instead of a call.',
    meta: 'policy.evaluate',
  },
  {
    title: 'Execute and observe',
    copy: 'The result returns with duration and status, is persisted with masked arguments, and feeds the charts and CSV exports.',
    meta: 'tools/call',
  },
];

const SECURITY = [
  { icon: KeyRound, title: 'Encrypted secrets', copy: 'AES-256-GCM at rest. The API only ever returns key names, never values.' },
  { icon: Fingerprint, title: 'Scrypt + server sessions', copy: 'Passwords hashed with scrypt, sessions held in HTTP-only cookies.' },
  { icon: ShieldCheck, title: 'Scoped policies', copy: 'Global, role, user, server, tool or tag scope with deny taking priority.' },
  { icon: Workflow, title: 'Approval gates', copy: 'Arguments are bound to the approval and consumed exactly once.' },
  { icon: TerminalSquare, title: 'Sandboxed filesystem', copy: 'Path traversal is rejected before the filesystem is touched.' },
  { icon: FileJson, title: 'Portable configuration', copy: 'Export bundles exclude secret values by construction.' },
];

const PLATFORM_TAGS = [
  'Official MCP SDK',
  'STDIO + HTTP',
  'RBAC + policy engine',
  'Approval gates',
  'SQLite · WAL',
  'Audit trail',
];

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const authRef = useRef<HTMLDivElement>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const health = useApi<Health>('/api/health', { pollMs: 30000 });

  function openAuth() {
    setAuthOpen(true);
    requestAnimationFrame(() => {
      authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const input = authRef.current?.querySelector<HTMLInputElement>('input[type="email"]');
        input?.focus();
      }, 360);
    });
  }

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cleanup = () => {};
    let cancelled = false;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const context = gsap.context(() => {
        // hero choreography — runs once, never hides content on failure
        const heroItems = root.querySelectorAll<HTMLElement>('[data-hero-item]');
        gsap.from(heroItems, {
          y: 24,
          opacity: 0,
          duration: 0.9,
          stagger: 0.09,
          ease: 'power3.out',
          delay: 0.08,
        });

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
          gsap.from(element, {
            y: 30,
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out',
            immediateRender: false,
            scrollTrigger: { trigger: element, start: 'top 92%', once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
          const children = Array.from(group.children) as HTMLElement[];
          gsap.from(children, {
            y: 20,
            opacity: 0,
            duration: 0.6,
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

        root.querySelectorAll<SVGPathElement>('[data-draw]').forEach((path) => {
          const length = path.getTotalLength();
          path.style.strokeDasharray = `${length}`;
          path.style.strokeDashoffset = `${length}`;
          gsap.to(path, {
            strokeDashoffset: 0,
            duration: 1.6,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: path.closest('svg') as SVGElement, start: 'top 82%', once: true },
          });
        });
      }, root);

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
      <div className="aurora pointer-events-none fixed inset-0 -z-10 opacity-90" aria-hidden />
      <div className="grid-lines pointer-events-none fixed inset-0 -z-10 opacity-40" aria-hidden />

      {/* ------------------------------ top bar ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-surface-950/70 backdrop-blur-xl">
        <div className="absolute inset-x-0 bottom-0 h-px top-hairline opacity-40" />
        <div className="mx-auto flex h-[58px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <nav className="hidden items-center gap-7 text-[12px] text-slate-400 md:flex" aria-label="Landing">
            <a href="#ecosystem" className="transition-colors hover:text-slate-50">
              Platform
            </a>
            <a href="#workflow" className="transition-colors hover:text-slate-50">
              Workflow
            </a>
            <a href="#observability" className="transition-colors hover:text-slate-50">
              Observability
            </a>
            <a href="#architecture" className="transition-colors hover:text-slate-50">
              Architecture
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-900/70 px-2.5 py-1 text-[10.5px] text-slate-400 sm:flex">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              {health.data?.ok
                ? `${health.data.servers.connected}/${health.data.servers.total} servers live`
                : 'connecting'}
            </span>
            <button onClick={openAuth} className="btn btn-primary btn-sm group">
              Sign in
              <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      {/* -------------------------------- hero ------------------------------- */}
      <section className="relative isolate overflow-hidden">
        <div
          className="pointer-events-none absolute left-1/2 top-[-18%] -z-10 h-[560px] w-[880px] -translate-x-1/2 opacity-70 blur-2xl"
          style={{
            background:
              'radial-gradient(closest-side, rgba(54,199,138,0.22), rgba(160,230,189,0.08) 55%, transparent 75%)',
          }}
          aria-hidden
        />
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:pb-24 lg:pt-20">
          <div className="relative z-10">
            <div
              data-hero-item
              className="edge-glow inline-flex items-center gap-2 rounded-full bg-surface-900/80 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300"
            >
              <Sparkles size={11} className="text-accent-soft" />
              Model Context Protocol control plane
            </div>

            <h1
              data-hero-item
              className="mt-6 text-[38px] font-semibold leading-[1.03] tracking-[-0.035em] text-slate-50 sm:text-[52px] lg:text-[60px]"
            >
              Connect. Orchestrate.
              <br />
              <span className="gradient-text">Experience the intelligence</span>
              <br />
              <span className="text-slate-300">of MCP.</span>
            </h1>

            <p data-hero-item className="mt-6 max-w-[560px] text-[14px] leading-relaxed text-slate-400 sm:text-[15px]">
              One intelligent workspace to connect MCP servers, discover tools, access resources,
              execute workflows, and manage your AI infrastructure.
            </p>

            <div data-hero-item className="mt-8 flex flex-wrap items-center gap-3">
              <MagneticButton>
                <GlowButton onClick={openAuth}>
                  Explore control plane
                  <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </GlowButton>
              </MagneticButton>
              <a href="#workflow" className="btn btn-outline btn-lg group">
                See how it works
                <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>

            <dl
              data-hero-item
              className="mt-11 grid max-w-[560px] grid-cols-2 gap-x-6 gap-y-5 border-t border-line/70 pt-6 sm:grid-cols-4"
            >
              {[
                { label: 'Transports', value: 'STDIO + HTTP' },
                { label: 'SDK', value: 'official MCP' },
                { label: 'Persistence', value: 'SQLite · WAL' },
                { label: 'Endpoint', value: '/mcp' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="stat-label">{item.label}</dt>
                  <dd className="mt-1.5 text-[12px] font-medium text-slate-200">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div data-hero-item className="relative -mx-4 h-[360px] sm:mx-0 sm:h-[440px] lg:h-[560px]">
            <div className="pointer-events-none absolute inset-6 rounded-full border border-accent/10" aria-hidden />
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-56 w-56 rounded-full bg-accent/10 blur-2xl" />
                </div>
              }
            >
              <Combined3D className="absolute inset-0" variant="hero" />
            </Suspense>
            <div className="scanline pointer-events-none absolute inset-x-8 inset-y-10 rounded-full" aria-hidden />
            <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line/80 bg-surface-900/80 px-3 py-1 text-[9.5px] uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
              <span className="h-1 w-1 rounded-full bg-accent" />
              live topology · pointer reactive
            </div>
            <div className="pointer-events-none absolute right-2 top-4 hidden flex-col items-end gap-1 text-right sm:flex">
              <span className="mono text-[9px] uppercase tracking-[0.16em] text-slate-600">mesh / core</span>
              <span className="mono text-[9px] text-accent/70">8 nodes · 2 rings</span>
            </div>
          </div>
        </div>

        {/* capability strip */}
        <div className="relative border-y border-line/60 bg-surface-900/30">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-slate-500">Built on</span>
            {PLATFORM_TAGS.map((tag) => (
              <span key={tag} className="mono text-[10.5px] text-slate-500">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------- ecosystem ------------------------------ */}
      <section id="ecosystem" className="relative py-16 sm:py-24">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <Reveal>
              <SectionLabel index="01">The platform</SectionLabel>
              <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[38px]">
                Every MCP server.
                <br />
                <span className="text-slate-400">One governed runtime.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="text-[13.5px] leading-relaxed text-slate-400 lg:pb-1">
                MCP servers are processes and endpoints scattered across machines, configs and chat
                clients. MCPNEXUS gives them a single registry, a real SDK client per session, one
                policy engine and one execution ledger.
              </p>
              <p className="mt-3 text-[11.5px] text-slate-500">
                Flip a tile to see what each layer actually owns.
              </p>
            </Reveal>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <FlipCard
                key={item.title}
                minHeight={252}
                flipLabel={`Show ${item.title} details`}
                backLabel={`Back to ${item.title}`}
                front={(flip) => (
                  <TiltCard className="h-full">
                    <div className="panel flex h-full flex-col p-5">
                      <div className="flex items-start justify-between">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent-soft">
                          <item.icon size={16} />
                        </span>
                        <span className="mono text-[9.5px] uppercase tracking-[0.16em] text-slate-600">
                          {item.kicker}
                        </span>
                      </div>
                      <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-slate-50">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{item.summary}</p>
                      <button
                        onClick={flip}
                        className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[11.5px] font-medium text-accent-soft transition-colors hover:text-accent"
                      >
                        Flip for detail
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </TiltCard>
                )}
                back={(unflip) => (
                  <div className="panel panel-signal flex h-full flex-col p-5">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[9.5px] uppercase tracking-[0.16em] text-accent-soft">
                        {item.kicker}
                      </span>
                      <span className="text-[10px] text-slate-500">detail</span>
                    </div>
                    <h3 className="mt-2 text-[14px] font-semibold text-slate-50">{item.title}</h3>
                    <ul className="mt-3 space-y-2">
                      {item.detail.map((line) => (
                        <li key={line} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-300">
                          <Check size={12} className="mt-0.5 shrink-0 text-accent" />
                          {line}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={unflip}
                      className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-100"
                    >
                      Back to summary
                      <ArrowRight size={12} className="rotate-180" />
                    </button>
                  </div>
                )}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- workflow ----------------------------- */}
      <section id="workflow" className="relative border-y border-line/60 bg-surface-900/30 py-16 sm:py-24">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Reveal>
              <SectionLabel index="02">Connection workflow</SectionLabel>
              <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
                From an endpoint
                <br />
                to a governed call.
              </h2>
              <p className="mt-4 max-w-[380px] text-[13px] leading-relaxed text-slate-400">
                Five real steps, each backed by a subsystem in this repository. No mock transport,
                no simulated capability list.
              </p>
              <div className="mt-6 flex items-center gap-3 rounded-lg border border-line bg-surface-950/60 px-3 py-2.5">
                <Radio size={14} className="text-accent" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-200">
                    {health.data ? `${health.data.servers.connected} of ${health.data.servers.total} connected` : 'checking control plane'}
                  </div>
                  <div className="mono text-[9.5px] text-slate-600">live SDK sessions</div>
                </div>
              </div>
            </Reveal>
          </div>

          <ol className="relative space-y-3">
            <svg
              className="pointer-events-none absolute bottom-8 left-[26px] top-8 hidden w-px sm:block"
              viewBox="0 0 2 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path data-draw d="M1 0 L1 100" stroke="url(#workflow-line)" strokeWidth="1.4" fill="none" />
              <defs>
                <linearGradient id="workflow-line" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#36C78A" />
                  <stop offset="100%" stopColor="#A0E6BD" stopOpacity="0.1" />
                </linearGradient>
              </defs>
            </svg>
            {WORKFLOW.map((step, index) => (
              <li key={step.title} data-reveal className="relative">
                <div className="flex gap-4">
                  <span className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-accent/30 bg-surface-900 text-[9.5px] font-semibold text-accent-soft">
                    {index + 1}
                  </span>
                  <div className="group flex-1 rounded-lg border border-line/70 bg-surface-950/40 px-4 py-3.5 transition-colors duration-200 hover:border-accent/30 hover:bg-surface-900/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[13px] font-semibold text-slate-100">{step.title}</h3>
                      <span className="mono rounded border border-line bg-surface-900 px-1.5 py-0.5 text-[9.5px] text-slate-500">
                        {step.meta}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">{step.copy}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------- tools & resources ----------------------- */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
          <Reveal>
            <SectionLabel index="03">Tools &amp; resources</SectionLabel>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
              Schemas you can trust,
              <br />
              data you can open.
            </h2>
            <p className="mt-4 max-w-[440px] text-[13px] leading-relaxed text-slate-400">
              Every tool arrives with the JSON schema its server published. Resources open with the
              real MIME type and body — files, database schemas, live documents.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Search and filter across servers and capability types',
                'Schema-driven forms keep argument types honest',
                'Resource reads render text, JSON and binary metadata',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
            </ul>
            <button onClick={openAuth} className="btn btn-outline mt-7">
              Browse the catalog <ArrowRight size={13} />
            </button>
          </Reveal>

          <Reveal delay={0.1}>
            <TiltCard maxTilt={5}>
              <div className="panel panel-signal overflow-hidden">
                <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Wrench size={13} className="text-accent" />
                    <span className="mono text-[11px] text-slate-300">manage_widget</span>
                  </div>
                  <span className="badge badge-ok">tool</span>
                </div>
                <div className="grid gap-0 sm:grid-cols-2">
                  <div className="border-b border-line/70 p-4 sm:border-b-0 sm:border-r">
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      input schema
                    </div>
                    <pre className="mt-2 overflow-x-auto font-mono text-[10.5px] leading-relaxed text-slate-400">
{`{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "mode": {
      "enum": ["preview", "apply"]
    }
  },
  "required": ["id"]
}`}
                    </pre>
                  </div>
                  <div className="p-4">
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      result
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between rounded border border-line bg-surface-950/60 px-2.5 py-1.5">
                        <span className="mono text-[10px] text-slate-300">status</span>
                        <span className="mono text-[10px] text-ok">ok</span>
                      </div>
                      <div className="flex items-center justify-between rounded border border-line bg-surface-950/60 px-2.5 py-1.5">
                        <span className="mono text-[10px] text-slate-300">content[0].type</span>
                        <span className="mono text-[10px] text-ice">text</span>
                      </div>
                      <div className="rounded border border-line bg-surface-950/60 px-2.5 py-1.5">
                        <div className="mono text-[10px] text-slate-500">duration</div>
                        <div className="mt-1 flex items-end gap-1">
                          {[34, 58, 41, 72, 50, 66, 44].map((height, index) => (
                            <span
                              key={index}
                              className="w-2 rounded-sm bg-gradient-to-t from-accent/40 to-ice/80"
                              style={{ height: `${height * 0.28}px` }}
                            />
                          ))}
                          <span className="ml-1 text-[9.5px] text-slate-500">measured per call</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------ prompts ------------------------------ */}
      <section className="border-y border-line/60 bg-surface-900/30 py-16 sm:py-24">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <Reveal className="order-2 lg:order-1">
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Layers size={13} className="text-ice" />
                  <span className="mono text-[11px] text-slate-300">prompts/get</span>
                </div>
                <span className="badge badge-violet">prompt</span>
              </div>
              <div className="p-4">
                <div className="text-[11.5px] font-medium text-slate-200">analyze_revenue</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    { name: 'period', value: 'Q3' },
                    { name: 'segment', value: 'enterprise' },
                    { name: 'depth', value: 'summary' },
                  ].map((arg) => (
                    <span
                      key={arg.name}
                      className="inline-flex items-center gap-1 rounded border border-ice/25 bg-ice/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                    >
                      <span className="text-ice">{arg.name}</span>
                      <span className="text-slate-600">=</span>
                      {arg.value}
                    </span>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="rounded border border-line bg-surface-950/60 p-2.5">
                    <div className="mono text-[9px] uppercase tracking-[0.14em] text-slate-600">role · system</div>
                    <div className="mt-1 text-[11.5px] leading-relaxed text-slate-300">
                      You are a revenue analyst. Use the data server before answering.
                    </div>
                  </div>
                  <div className="rounded border border-accent/20 bg-accent/[0.04] p-2.5">
                    <div className="mono text-[9px] uppercase tracking-[0.14em] text-accent/70">role · user</div>
                    <div className="mt-1 text-[11.5px] leading-relaxed text-slate-300">
                      Summarise Q3 enterprise revenue with the key drivers.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="order-1 lg:order-2">
            <SectionLabel index="04">Prompt management</SectionLabel>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
              Prompts become
              <br />
              infrastructure.
            </h2>
            <p className="mt-4 max-w-[440px] text-[13px] leading-relaxed text-slate-400">
              Prompts published by your servers are indexed with their arguments, so the messages a
              server generates are reproducible and reviewable — not copy-pasted from a scratch pad.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { label: 'Arguments', value: 'typed + validated' },
                { label: 'Messages', value: 'verbatim from server' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line bg-surface-950/40 p-3">
                  <div className="stat-label">{item.label}</div>
                  <div className="mt-1.5 text-[12px] text-slate-200">{item.value}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------- orchestration --------------------------- */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <Reveal className="max-w-[620px]">
            <SectionLabel index="05">Execution orchestration</SectionLabel>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
              Dispatch, record, replay.
            </h2>
            <p className="mt-4 text-[13px] leading-relaxed text-slate-400">
              The same call path is used by the playground, the tool explorer and the API. Arguments
              are validated against the schema, authorised, timed, and written to the execution
              ledger with their actor.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Reveal>
              <div className="panel overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-line/80 bg-surface-950/50 px-4 py-2.5">
                  <span className="h-2 w-2 rounded-full bg-coral/70" />
                  <span className="h-2 w-2 rounded-full bg-warn/60" />
                  <span className="h-2 w-2 rounded-full bg-accent/70" />
                  <span className="mono ml-3 text-[10px] text-slate-500">execution timeline</span>
                </div>
                <div className="divide-y divide-line/60">
                  {[
                    ['request', 'tools/call · nexus-data.query', 'accent'],
                    ['policy', 'role=operator · server scope allow', 'ice'],
                    ['validate', 'arguments match published schema', 'ice'],
                    ['dispatch', 'SDK session → server', 'accent'],
                    ['persist', 'execution row + audit event', 'coral'],
                  ].map(([stage, detail, tone], index) => (
                    <div key={stage} className="flex items-center gap-3 px-4 py-3">
                      <span className="mono w-5 text-[10px] text-slate-600">0{index + 1}</span>
                      <span
                        className={
                          tone === 'coral'
                            ? 'h-1.5 w-1.5 rounded-full bg-coral'
                            : tone === 'ice'
                              ? 'h-1.5 w-1.5 rounded-full bg-ice'
                              : 'h-1.5 w-1.5 rounded-full bg-accent'
                        }
                      />
                      <span className="w-[74px] shrink-0 text-[11px] font-medium text-slate-200">{stage}</span>
                      <span className="mono truncate text-[10.5px] text-slate-500">{detail}</span>
                      <span className="ml-auto hidden text-[9.5px] text-slate-700 sm:block">ok</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <div className="grid gap-4">
              <Reveal delay={0.06}>
                <div className="panel p-4">
                  <div className="flex items-center gap-2">
                    <ZapBadge />
                    <span className="text-[12px] font-medium text-slate-200">Every run is measurable</span>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                    Duration, status, actor and masked arguments are persisted. p50, p90 and p99 come
                    from those rows, and exports are generated from the same query.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['latency', 'status', 'actor', 'tool', 'server'].map((tag) => (
                      <span key={tag} className="rounded border border-line bg-surface-900 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <div className="panel p-4">
                  <div className="flex items-center gap-2">
                    <TerminalSquare size={13} className="text-ice" />
                    <span className="text-[12px] font-medium text-slate-200">Playground, same engine</span>
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                    Edit JSON, execute, inspect the raw result. No separate mock runner to drift out
                    of sync with production behaviour.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ approvals ---------------------------- */}
      <section className="relative overflow-hidden border-y border-coral/15 bg-[#150f14]/40 py-16 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(40% 50% at 78% 50%, rgba(217,185,120,0.12), transparent 70%), radial-gradient(35% 45% at 12% 30%, rgba(54,199,138,0.1), transparent 70%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
          <Reveal>
            <SectionLabel index="06">Approval management</SectionLabel>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
              Destructive work
              <br />
              waits for a human.
            </h2>
            <p className="mt-4 max-w-[440px] text-[13px] leading-relaxed text-slate-400">
              A tool that is marked sensitive does not execute on request. It parks as a pending
              approval carrying the exact arguments, and an authorised operator decides — once.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'Arguments bound to the request, not re-supplied',
                'Single-use consumption after approval',
                'Every decision attributed in the audit trail',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral" />
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.08}>
            <TiltCard maxTilt={4}>
              <div className="panel overflow-hidden border-coral/25">
                <div className="flex items-center justify-between border-b border-coral/20 bg-coral/[0.05] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-coral" />
                    <span className="text-[12px] font-semibold text-slate-100">Pending approval</span>
                  </div>
                  <span className="badge badge-coral">awaiting operator</span>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-slate-500">Tool</span>
                    <span className="mono text-slate-200">nexus-filesystem.delete</span>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-slate-500">Server</span>
                    <span className="text-slate-200">Nexus Filesystem</span>
                  </div>
                  <div className="rounded border border-line bg-surface-950/60 p-3">
                    <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-slate-600">arguments</div>
                    <pre className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-slate-400">
{`{ "path": "sandbox/reports/old.csv" }`}
                    </pre>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={openAuth}
                      className="btn btn-sm btn-primary flex-1"
                    >
                      Approve
                    </button>
                    <button type="button" onClick={openAuth} className="btn btn-sm flex-1">
                      Reject
                    </button>
                  </div>
                  <p className="text-center text-[9.5px] text-slate-600">
                    Illustration of the approval card · sign in to act on real requests
                  </p>
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------- observability -------------------------- */}
      <section id="observability" className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal>
            <SectionLabel index="07">Monitoring &amp; observability</SectionLabel>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
              Traffic, latency,
              <br />
              failures — all real.
            </h2>
            <p className="mt-4 max-w-[460px] text-[13px] leading-relaxed text-slate-400">
              Charts are computed from persisted execution rows, so an empty project shows an empty
              chart instead of a decorative one. Percentiles, failure trends and per-tool usage all
              come from the same ledger.
            </p>
            <div className="mt-6 grid max-w-[420px] grid-cols-3 gap-3">
              {['p50', 'p90', 'p99'].map((label) => (
                <div key={label} className="rounded-lg border border-line bg-surface-950/40 px-3 py-2.5">
                  <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-slate-600">{label}</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-200">measured</div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge size={13} className="text-accent" />
                  <span className="text-[12px] font-medium text-slate-200">Execution volume</span>
                </div>
                <span className="badge badge-muted">hourly</span>
              </div>
              <div className="mt-4 flex h-[150px] items-end gap-[3px]" aria-hidden>
                {[18, 26, 22, 38, 31, 48, 42, 58, 46, 64, 52, 74, 61, 82, 68, 76, 55, 63, 47, 54, 39, 46, 33, 41].map(
                  (height, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t-[2px] bg-gradient-to-t from-accent/25 via-accent/60 to-ice/70 transition-opacity hover:opacity-100"
                      style={{ height: `${height}%`, opacity: 0.55 + (index % 5) * 0.09 }}
                    />
                  ),
                )}
              </div>
              <div className="mt-2 flex justify-between text-[9.5px] text-slate-600">
                <span>-24h</span>
                <span>-12h</span>
                <span>now</span>
              </div>
              <p className="mt-3 border-t border-line/70 pt-3 text-[10.5px] leading-relaxed text-slate-500">
                Illustrative shape. Your charts render only the execution rows stored by this control
                plane.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------ security ----------------------------- */}
      <section id="security" className="border-y border-line/60 bg-surface-900/30 py-16 sm:py-24">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <Reveal>
              <SectionLabel index="08">Security</SectionLabel>
              <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
                Privileged by design.
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="text-[13px] leading-relaxed text-slate-400">
                MCP servers can read files, run SQL and call APIs. Every call is authenticated,
                authorised twice, then recorded — with the failure modes documented rather than
                hidden.
              </p>
            </Reveal>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line/60 sm:grid-cols-2 xl:grid-cols-3">
            {SECURITY.map((item, index) => (
              <div
                key={item.title}
                className="group relative bg-surface-950/80 p-5 transition-colors duration-200 hover:bg-surface-900"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-900 text-accent-soft transition-colors group-hover:border-accent/30 group-hover:bg-accent/10">
                    <item.icon size={14} />
                  </span>
                  <span className="mono text-[9.5px] text-slate-700">0{index + 1}</span>
                </div>
                <h3 className="mt-4 text-[12.5px] font-semibold text-slate-100">{item.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------- architecture --------------------------- */}
      <section id="architecture" className="relative overflow-hidden py-16 sm:py-24">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <SectionLabel index="09">Architecture</SectionLabel>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-50 sm:text-[36px]">
              One process,
              <br />
              four transports,
              <br />
              one database.
            </h2>
            <p className="mt-4 text-[13px] leading-relaxed text-slate-400">
              The Express API owns every MCP client session through the official SDK. Calls pass
              through one policy engine before reaching a server, and every result returns to SQLite.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'React + Vite SPA served by the same process',
                'STDIO child processes and Streamable HTTP clients',
                'MCPNEXUS exposes itself as an MCP server at /mcp',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[12.5px] text-slate-300">
                  <Cpu size={12} className="mt-1 shrink-0 text-accent" />
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="panel overflow-hidden p-4 sm:p-6">
              <svg viewBox="0 0 520 320" className="w-full" role="img" aria-label="MCPNEXUS architecture diagram">
                <defs>
                  <linearGradient id="arch-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#36C78A" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#A0E6BD" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="arch-core" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#36C78A" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#A0E6BD" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                <rect x="176" y="126" width="168" height="70" rx="11" fill="url(#arch-core)" stroke="#2c7f78" />
                <text x="260" y="155" textAnchor="middle" fill="#C5D0CA" fontSize="12" fontFamily="Inter, sans-serif" fontWeight="600">
                  Control plane
                </text>
                <text x="260" y="174" textAnchor="middle" fill="#7f95ae" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  policy · approvals · audit
                </text>

                <g stroke="url(#arch-line)" strokeWidth="1.4" fill="none">
                  <path data-draw d="M176 150 C136 150 126 96 92 96" />
                  <path data-draw d="M176 172 C136 172 126 224 92 224" />
                  <path data-draw d="M344 150 C384 150 394 96 428 96" />
                  <path data-draw d="M344 172 C384 172 394 224 428 224" />
                </g>

                {[
                  { x: 14, y: 76, label: 'Toolbox', meta: 'STDIO' },
                  { x: 14, y: 204, label: 'Filesystem', meta: 'STDIO' },
                  { x: 350, y: 76, label: 'Data', meta: 'STDIO · SQLite' },
                  { x: 350, y: 204, label: 'Control (HTTP)', meta: '/mcp' },
                ].map((node) => (
                  <g key={node.label}>
                    <rect x={node.x} y={node.y} width="156" height="44" rx="8" fill="#151c18" stroke="#263029" />
                    <text x={node.x + 14} y={node.y + 20} fill="#d9e2ee" fontSize="11" fontFamily="Inter, sans-serif" fontWeight="600">
                      {node.label}
                    </text>
                    <text x={node.x + 14} y={node.y + 34} fill="#6b809b" fontSize="9" fontFamily="JetBrains Mono, monospace">
                      {node.meta}
                    </text>
                  </g>
                ))}

                <rect x="176" y="22" width="168" height="40" rx="8" fill="#151c18" stroke="#263029" />
                <text x="260" y="47" textAnchor="middle" fill="#a4b4c9" fontSize="10.5" fontFamily="Inter, sans-serif">
                  Operators · API clients
                </text>
                <path data-draw d="M260 62 L260 126" stroke="#3a4d42" strokeWidth="1.2" fill="none" />
                <rect x="176" y="252" width="168" height="40" rx="8" fill="#151c18" stroke="#263029" />
                <text x="260" y="277" textAnchor="middle" fill="#a4b4c9" fontSize="10.5" fontFamily="Inter, sans-serif">
                  SQLite · WAL · migrations
                </text>
                <path data-draw d="M260 196 L260 252" stroke="#3a4d42" strokeWidth="1.2" fill="none" />
              </svg>
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------- CTA -------------------------------- */}
      <section id="access" className="relative overflow-hidden border-t border-line/60 py-16 sm:py-24">
        <div className="aurora pointer-events-none absolute inset-0 -z-10 opacity-80" aria-hidden />
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal>
            <SectionLabel index="10">One unified control plane</SectionLabel>
            <h2 className="mt-4 text-[30px] font-semibold leading-[1.06] tracking-[-0.035em] text-slate-50 sm:text-[42px]">
              Stop reading logs
              <br />
              <span className="gradient-text">in six terminals.</span>
            </h2>
            <p className="mt-4 max-w-[500px] text-[13.5px] leading-relaxed text-slate-400">
              Register every server, discover its primitives, govern what runs, and watch the
              traffic — with a real MCP client underneath, not a mock.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Official MCP SDK', 'RBAC + policy engine', 'Execution history', 'Audit log'].map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-line bg-surface-900/70 px-2 py-1 text-[10.5px] text-slate-500"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-3 text-[11px] text-slate-500">
              <Server size={13} className="text-accent" />
              {health.data
                ? `${health.data.servers.total} servers registered · ${health.data.servers.connected} connected`
                : 'control plane status unavailable'}
            </div>
          </Reveal>

          <div
            ref={authRef}
            className="panel panel-signal relative overflow-hidden p-6 sm:p-8"
            data-reveal
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent/10 blur-2xl"
              aria-hidden
            />
            <LoginCard />
          </div>
        </div>
      </section>

      <footer className="border-t border-line/60 py-9">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 px-4 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <Brand compact />
            <span>Connect. Orchestrate. Secure. Observe.</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#ecosystem" className="transition-colors hover:text-slate-300">
              Platform
            </a>
            <a href="#security" className="transition-colors hover:text-slate-300">
              Security
            </a>
            <span className="mono">MCP · MIT licensed</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ZapBadge() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent-soft">
      <Waypoints size={12} />
    </span>
  );
}
