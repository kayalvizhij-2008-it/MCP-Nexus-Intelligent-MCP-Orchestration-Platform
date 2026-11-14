import {
  Activity,
  Blocks,
  ChevronDown,
  FolderTree,
  LayoutDashboard,
  LogOut,
  MessageSquareCode,
  Menu,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../App.js';
import { cn } from '../lib/format.js';
import { Badge, Dot } from './ui.js';

const NAV = [
  {
    group: 'Operate',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/servers', label: 'MCP Servers', icon: Server },
      { to: '/tools', label: 'Tool Explorer', icon: Wrench },
      { to: '/resources', label: 'Resource Explorer', icon: FolderTree },
      { to: '/prompts', label: 'Prompt Studio', icon: MessageSquareCode },
    ],
  },
  {
    group: 'Build',
    items: [
      { to: '/integrations', label: 'Integration Hub', icon: Blocks },
      { to: '/playground', label: 'API Playground', icon: TerminalSquare },
      { to: '/deployments', label: 'Deployment Center', icon: Rocket },
    ],
  },
  {
    group: 'Govern',
    items: [
      { to: '/security', label: 'Security Center', icon: ShieldCheck },
      { to: '/observability', label: 'Observability', icon: Activity },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M16 3.5l10.5 6.2v12.6L16 28.5 5.5 22.3V9.7z"
          stroke="url(#nexus-grad)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="3.2" fill="#8b5cf6" />
        <circle cx="16" cy="8" r="1.4" fill="#4d7cff" />
        <circle cx="23" cy="20" r="1.4" fill="#4d7cff" />
        <circle cx="9" cy="20" r="1.4" fill="#4d7cff" />
        <defs>
          <linearGradient id="nexus-grad" x1="4" y1="4" x2="28" y2="28">
            <stop stopColor="#7ea0ff" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="leading-none">
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-white">MCPNEXUS</div>
        <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">
          control plane
        </div>
      </div>
    </div>
  );
}

function UserMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!session) return null;
  const initials = session.user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface-850 px-2 py-1.5 text-left transition-colors hover:border-line-strong"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent to-violet text-[10px] font-bold text-white">
          {initials || 'N'}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[12px] font-medium text-slate-200">{session.user.name}</span>
          <span className="block text-[10px] uppercase tracking-wider text-slate-500">
            {session.user.role}
          </span>
        </span>
        <ChevronDown size={13} className="text-slate-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1.5 w-56 rounded-lg border border-line bg-surface-850 p-1.5 shadow-2xl">
            <div className="border-b border-line px-2.5 pb-2 pt-1.5">
              <div className="truncate text-[12px] font-medium text-slate-200">{session.user.email}</div>
              <div className="mt-0.5 text-[10.5px] text-slate-500">{session.permissions.length} permissions granted</div>
            </div>
            <button
              onClick={() => void signOut()}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-slate-300 hover:bg-surface-800"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-surface-950">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[228px] shrink-0 border-r border-line bg-surface-900/95 backdrop-blur transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <Logo />
            <button
              className="btn btn-icon btn-ghost lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X size={15} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            {NAV.map((group) => (
              <div key={group.group}>
                <div className="nav-group">{group.group}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
                  >
                    <item.icon size={15} className="shrink-0 opacity-80" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="border-t border-line px-3 py-3">
            <div className="rounded-lg border border-line bg-surface-850 px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
                <Dot tone="ok" pulse /> local runtime
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="mono text-[10.5px] text-slate-500">stdio · http</span>
                <Badge tone="violet">v1.0</Badge>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-line bg-surface-950/80 px-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-icon btn-ghost lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={16} />
            </button>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600 sm:inline">
              MCP Server Control Plane
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-md border border-line bg-surface-850 px-2 py-1 text-[10.5px] text-slate-400 md:flex">
              <Dot tone="ok" /> API connected
            </span>
            <UserMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
