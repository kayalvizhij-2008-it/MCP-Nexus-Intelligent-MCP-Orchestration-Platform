import {
  Activity,
  Blocks,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Gauge,
  LayoutDashboard,
  LogOut,
  MessageSquareCode,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Wrench,
  X,
  Menu,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';
import { CommandPalette } from './CommandPalette.js';
import { AnimatedBackdrop, CommandButton, IconButton, Tooltip } from './interactions.js';
import { Badge, Dot } from './ui.js';

const NAV = [
  {
    group: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    group: 'Infrastructure',
    items: [
      { to: '/servers', label: 'MCP Servers', icon: Server },
      { to: '/tools', label: 'Tools', icon: Wrench },
      { to: '/resources', label: 'Resources', icon: FolderTree },
      { to: '/prompts', label: 'Prompts', icon: MessageSquareCode },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/playground', label: 'Playground', icon: TerminalSquare },
      { to: '/executions', label: 'Executions', icon: Activity },
      { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
      { to: '/observability', label: 'Observability', icon: Gauge },
    ],
  },
  {
    group: 'Governance',
    items: [{ to: '/security', label: 'Security', icon: ShieldCheck }],
  },
  {
    group: 'Management',
    items: [
      { to: '/integrations', label: 'Integrations', icon: Blocks },
      { to: '/deployments', label: 'Deployment', icon: Rocket },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
] as const;

const LABELS: Record<string, string> = {
  '': 'Dashboard',
  servers: 'MCP Servers',
  tools: 'Tools',
  resources: 'Resources',
  prompts: 'Prompts',
  playground: 'Playground',
  executions: 'Executions',
  approvals: 'Approvals',
  observability: 'Observability',
  security: 'Security',
  integrations: 'Integrations',
  deployments: 'Deployment',
  settings: 'Settings',
};

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
      <svg width="27" height="27" viewBox="0 0 32 32" fill="none" aria-hidden className="shrink-0">
        <path
          d="M16 3.5l10.5 6.2v12.6L16 28.5 5.5 22.3V9.7z"
          stroke="url(#nexus-grad-nav)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="3.1" fill="#36C78A" />
        <circle cx="16" cy="8" r="1.3" fill="#A0E6BD" />
        <circle cx="23" cy="20" r="1.3" fill="#A0E6BD" />
        <circle cx="9" cy="20" r="1.3" fill="#D9B978" />
        <defs>
          <linearGradient id="nexus-grad-nav" x1="4" y1="4" x2="28" y2="28">
            <stop stopColor="#A0E6BD" />
            <stop offset="1" stopColor="#A0E6BD" />
          </linearGradient>
        </defs>
      </svg>
      {!collapsed && (
        <div className="leading-none">
          <div className="text-[13.5px] font-semibold tracking-[-0.01em] text-white">MCPNEXUS</div>
          <div className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.2em] text-slate-500">
            control plane
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (!session) return null;
  const initials = session.user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface-850 px-2 py-1.5 transition-colors hover:border-line-strong"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent to-ice text-[10px] font-bold text-[#04211d]">
          {initials || 'N'}
        </span>
        <span className="hidden leading-tight text-left sm:block">
          <span className="block text-[11.5px] font-medium text-slate-200">{session.user.name}</span>
          <span className="block text-[9.5px] uppercase tracking-[0.12em] text-slate-500">
            {session.user.role}
          </span>
        </span>
        <ChevronDown size={12} className="text-slate-500" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            role="menu"
            className="absolute right-0 top-full z-40 mt-1.5 w-60 rounded-lg border border-line bg-surface-850 p-1.5 shadow-2xl"
          >
            <div className="border-b border-line px-2.5 pb-2 pt-1.5">
              <div className="truncate text-[12px] font-medium text-slate-200">{session.user.email}</div>
              <div className="mt-0.5 text-[10.5px] text-slate-500">
                {session.permissions.length} permissions · {session.user.role}
              </div>
            </div>
            <button
              role="menuitem"
              onClick={() => void signOut()}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-slate-300 transition-colors hover:bg-surface-800"
            >
              <LogOut size={13} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Primary">
      {NAV.map((group) => (
        <div key={group.group}>
          {collapsed ? (
            <div className="mx-auto my-3 h-px w-6 bg-line" />
          ) : (
            <div className="nav-group">{group.group}</div>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isEnd = Boolean((item as { end?: boolean }).end);
              const isActive = isEnd
                ? location.pathname === item.to
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              const link = (
                <NavLink
                  to={item.to}
                  end={isEnd}
                  onClick={onNavigate}
                  className={({ isActive: active }) =>
                    cn('nav-item', (active || isActive) && 'nav-item-active', collapsed && 'justify-center px-0')
                  }
                >
                  {isActive && !collapsed && (
                    <motion.span
                      layoutId="nav-active-surface"
                      className="absolute inset-0 -z-10 rounded-lg"
                      style={{
                        background: 'linear-gradient(90deg, rgba(54,199,138,0.2), rgba(160,230,189,0.05))',
                        boxShadow: 'inset 0 0 0 1px rgba(54,199,138,0.12)',
                      }}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <item.icon size={15} className="shrink-0 opacity-90" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={item.to} label={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                <React.Fragment key={item.to}>{link}</React.Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = [{ label: 'Control plane', to: '/' }];

  if (segments.length === 0) crumbs.push({ label: 'Dashboard', to: '/' });
  else {
    crumbs.push({ label: LABELS[segments[0]!] ?? segments[0]!, to: `/${segments[0]}` });
    if (segments[1]) crumbs.push({ label: segments[1] === 'new' ? 'New' : 'Workspace', to: location.pathname });
  }

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[11.5px] text-slate-500 sm:flex">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRight size={11} className="text-slate-700" />}
          <span className={cn('truncate', index === crumbs.length - 1 && 'text-slate-300')}>
            {crumb.label}
          </span>
        </span>
      ))}
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const reduced = useReducedMotion();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const health = useApi<{ ok: boolean; servers: { total: number; connected: number } }>('/api/health', {
    pollMs: 30000,
  });

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('nexus:nav-collapsed') === '1');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('nexus:nav-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handler);
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const apiOk = health.data?.ok ?? false;
  const serverSummary = useMemo(
    () => (health.data ? `${health.data.servers.connected}/${health.data.servers.total}` : '—'),
    [health.data],
  );

  return (
    <div className="relative flex min-h-screen bg-surface-950">
      <AnimatedBackdrop />
      {/* desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 236 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        className="sticky top-0 z-20 hidden h-screen shrink-0 border-r border-line bg-surface-900/75 backdrop-blur-xl lg:block"
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-accent/25 via-transparent to-transparent" />
        <div className="flex h-full flex-col">
          <div className={cn('flex items-center justify-between px-4 pb-2 pt-4', collapsed && 'px-2')}>
            <Brand collapsed={collapsed} />
            {!collapsed && (
              <IconButton
                label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                size="sm"
                onClick={() => setCollapsed(true)}
              >
                <PanelLeftClose size={14} />
              </IconButton>
            )}
          </div>
          {collapsed && (
            <div className="px-2 pb-1 pt-2">
              <IconButton label="Expand navigation" onClick={() => setCollapsed(false)} className="w-full">
                <PanelLeftOpen size={14} />
              </IconButton>
            </div>
          )}

          <SidebarNav collapsed={collapsed} />

          <div className={cn('border-t border-line px-3 py-3', collapsed && 'px-2')}>
            {collapsed ? (
              <Tooltip label={`${apiOk ? 'API connected' : 'API offline'} · ${serverSummary} servers`} side="right">
                <div className="flex justify-center py-1">
                  <Dot tone={apiOk ? 'ok' : 'err'} pulse={apiOk} />
                </div>
              </Tooltip>
            ) : (
              <div className="rounded-lg border border-line bg-surface-850 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  <Dot tone={apiOk ? 'ok' : 'err'} pulse={apiOk} />
                  {apiOk ? 'control plane online' : 'control plane offline'}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="mono text-[10.5px] text-slate-500">{serverSummary} servers</span>
                  <Badge tone="violet">v1.0</Badge>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-line-strong bg-surface-900 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <Brand />
                <button
                  ref={closeButtonRef}
                  onClick={() => setMobileOpen(false)}
                  className="btn btn-icon btn-ghost"
                  aria-label="Close navigation"
                >
                  <X size={16} />
                </button>
              </div>
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <div className="border-t border-line px-3 py-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <Dot tone={apiOk ? 'ok' : 'err'} pulse={apiOk} />
                  {apiOk ? 'control plane online' : 'control plane offline'}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between gap-3 border-b border-line/80 bg-surface-950/70 px-3 backdrop-blur-xl sm:px-5">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px top-hairline opacity-40" />
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              ref={menuButtonRef}
              className="btn btn-icon btn-ghost lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={17} />
            </button>
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="btn btn-icon btn-ghost hidden lg:inline-flex"
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
            <Breadcrumbs />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <CommandButton onOpen={() => setPaletteOpen(true)} />
            <span
              className="hidden items-center gap-1.5 rounded-md border border-line bg-surface-900 px-2 py-1 text-[10.5px] text-slate-400 md:flex"
              title={`${serverSummary} servers connected`}
            >
              <Dot tone={apiOk ? 'ok' : 'err'} pulse={apiOk} />
              {apiOk ? 'API connected' : 'API offline'}
            </span>
            <UserMenu />
          </div>
        </header>

        <main className="relative min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <motion.div
            key={location.pathname}
            initial={reduced ? false : { opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[1400px]"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line/60 pb-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.07] px-2.5 py-1">
            <span className="h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_rgba(54,199,138,0.9)]" />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
