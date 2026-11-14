import {
  Activity,
  ArrowRight,
  Blocks,
  Command,
  FolderTree,
  Gauge,
  LayoutDashboard,
  MessageSquareCode,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { cn } from '../lib/format.js';

type ServerHit = { id: string; name: string; slug: string; status: string; counts: { tools: number } };

const DESTINATIONS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, keywords: 'overview home metrics' },
  { to: '/servers', label: 'MCP Servers', icon: Server, keywords: 'register connect stdio http' },
  { to: '/tools', label: 'Tool Explorer', icon: Wrench, keywords: 'execute schema' },
  { to: '/resources', label: 'Resource Explorer', icon: FolderTree, keywords: 'uri read' },
  { to: '/prompts', label: 'Prompt Studio', icon: MessageSquareCode, keywords: 'template prompts' },
  { to: '/playground', label: 'API Playground', icon: TerminalSquare, keywords: 'request rest' },
  { to: '/executions', label: 'Executions', icon: Activity, keywords: 'history search csv' },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck, keywords: 'pending approve reject' },
  { to: '/observability', label: 'Observability', icon: Gauge, keywords: 'latency failures timeline' },
  { to: '/security', label: 'Security Center', icon: ShieldCheck, keywords: 'users roles policies audit' },
  { to: '/integrations', label: 'Integration Hub', icon: Blocks, keywords: 'github webhook rest' },
  { to: '/deployments', label: 'Deployment Center', icon: Rocket, keywords: 'readiness checks' },
  { to: '/settings', label: 'Settings', icon: Settings, keywords: 'profile workspace secrets' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [servers, setServers] = useState<ServerHit[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setError(null);
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    api
      .get<{ servers: ServerHit[] }>('/api/servers')
      .then((result) => setServers(result.servers))
      .catch(() => setError('Server list unavailable'));
    return () => clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pages = DESTINATIONS.filter(
      (item) =>
        !term ||
        item.label.toLowerCase().includes(term) ||
        item.keywords.includes(term) ||
        item.to.includes(term),
    ).map((item) => ({
      id: `page:${item.to}`,
      label: item.label,
      hint: item.to,
      icon: item.icon,
      run: () => navigate(item.to),
    }));

    const serverHits = servers
      .filter(
        (server) =>
          !term ||
          server.name.toLowerCase().includes(term) ||
          server.slug.toLowerCase().includes(term),
      )
      .slice(0, 6)
      .map((server) => ({
        id: `server:${server.id}`,
        label: server.name,
        hint: `${server.status} · ${server.counts.tools} tools`,
        icon: Server,
        run: () => navigate(`/servers/${server.id}`),
      }));

    return [...pages, ...serverHits];
  }, [query, servers, navigate]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((current) => Math.min(current + 1, results.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        results[active]?.run();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results, active, onClose]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="fade-in w-full max-w-[560px] overflow-hidden rounded-xl border border-line-strong bg-surface-850 shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Command size={14} className="text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and servers…"
            className="w-full bg-transparent text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
            aria-label="Search commands"
          />
          <button onClick={onClose} className="btn btn-icon btn-ghost" aria-label="Close command palette">
            <X size={13} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-slate-500">
              No matches{error ? ` · ${error}` : ''}
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                data-index={index}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  result.run();
                  onClose();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  index === active ? 'bg-surface-800 text-white' : 'text-slate-300 hover:bg-surface-800/60',
                )}
              >
                <result.icon size={14} className="text-slate-500" />
                <span className="flex-1 truncate text-[12.5px]">{result.label}</span>
                <span className="mono truncate text-[10px] text-slate-600">{result.hint}</span>
                {index === active && <ArrowRight size={12} className="text-slate-500" />}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[10.5px] text-slate-600">
          <span>Navigate with ↑ ↓ · open with ↵</span>
          <span className="mono">esc to close</span>
        </div>
      </div>
    </div>
  );
}
