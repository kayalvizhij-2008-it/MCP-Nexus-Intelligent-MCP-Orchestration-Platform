import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FolderTree,
  Gauge,
  Play,
  Server,
  ShieldCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import React, { Suspense, lazy, useMemo } from 'react';
const Combined3D = lazy(() => import('../components/3d/Combined3D.js'));

import { Link } from 'react-router-dom';
import { useAuth } from '../App.js';
import { AnimatedNumber } from '../components/interactions.js';
import {
  Badge,
  EmptyState,
  ErrorState,
  Panel,
  StatusBadge,
  StatCard,
} from '../components/ui.js';
import type { OverviewDto } from '../lib/api.js';
import { formatMs, formatNumber, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type Telemetry = {
  timeseries: Array<{ label: string; total: number; failed: number; avgLatencyMs: number | null }>;
  toolUsage: Array<{ name: string; calls: number; failures: number; avgLatencyMs: number | null }>;
  latency: { p50: number | null; p90: number | null; p99: number | null; samples: number };
  hours: number;
};

export function OverviewPage() {
  const { session } = useAuth();
  const overview = useApi<OverviewDto>('/api/overview', { pollMs: 20000 });
  const telemetry = useApi<Telemetry>('/api/observability?hours=24', { pollMs: 30000 });

  const successRate = overview.data?.performance.successRate ?? null;
  const ring = useMemo(() => {
    const ratio = successRate === null ? 0 : Math.max(0, Math.min(1, successRate / 100));
    const circumference = 2 * Math.PI * 34;
    return { ratio, circumference, dash: circumference * ratio };
  }, [successRate]);

  if (overview.loading && !overview.data) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-7 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-[116px]" />
          ))}
        </div>
        <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
          <div className="skeleton h-[280px]" />
          <div className="skeleton h-[280px]" />
        </div>
      </div>
    );
  }
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;

  const data = overview.data!;
  const series = telemetry.data?.timeseries ?? [];
  const maxTotal = Math.max(1, ...series.map((point) => point.total));
  const failed24h = data.requests.failed24h;
  const total24h = data.requests.last24h;
  const needsOnboarding = data.servers.total > 0 && data.requests.allTime === 0;

  return (
    <div>
      {/* ------------------------------ command deck ------------------------ */}
      <section className="panel panel-signal relative mb-4 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(60% 120% at 8% 0%, rgba(54,199,138,0.14), transparent 62%), radial-gradient(45% 100% at 92% 10%, rgba(160,230,189,0.1), transparent 66%)',
          }}
          aria-hidden
        />
        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.5fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.07] px-2.5 py-1">
              <span className="h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_rgba(54,199,138,0.9)]" />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
                control plane · {data.servers.running}/{data.servers.total} live
              </span>
            </div>
            <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[30px]">
              Welcome back, {session?.user.name.split(' ')[0] ?? 'operator'}
            </h1>
            <p className="mt-2 max-w-[560px] text-[12px] leading-relaxed text-slate-400">
              Live state of every MCP server, tool and execution recorded by this control plane —
              computed from stored rows, not samples.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link to="/playground" className="btn btn-primary btn-sm">
                <Zap size={12} /> Open playground
              </Link>
              <Link to="/servers" className="btn btn-sm">
                <Server size={12} /> Manage servers
              </Link>
              {data.pendingApprovals > 0 ? (
                <Link
                  to="/approvals"
                  className="btn btn-sm border-coral/30 bg-coral/10 text-coral-soft hover:bg-coral/15"
                >
                  <ShieldCheck size={12} /> {data.pendingApprovals} awaiting approval
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-900/60 px-2 py-1 text-[10.5px] text-slate-500">
                  <ShieldCheck size={11} /> no approvals pending
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-line/70 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {[
              { label: 'Tools', value: data.tools.total, icon: Wrench },
              { label: 'Resources', value: data.resources.total, icon: FolderTree },
              { label: 'Prompts', value: data.prompts.total, icon: Activity },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line/70 bg-surface-950/40 px-3 py-2.5">
                <item.icon size={11} className="text-accent/70" />
                <div className="mt-2 text-[17px] font-semibold leading-none text-slate-50">
                  <AnimatedNumber value={item.value} />
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-[0.14em] text-slate-600">
                  {item.label}
                </div>
              </div>
            ))}
            <div className="col-span-3 flex items-center justify-between rounded-lg border border-line/70 bg-surface-950/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
                {data.servers.running} running · {data.servers.stopped} stopped
                {data.servers.errors > 0 ? ` · ${data.servers.errors} failed` : ''}
              </span>
              <span className="mono text-[9.5px] text-slate-600">
                {formatNumber(data.requests.allTime)} calls logged
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-4 h-[160px] overflow-hidden rounded-xl border border-line/60 bg-surface-950/40 sm:h-[200px]">
        <Suspense fallback={<div className="h-full w-full bg-surface-950/40" />}>
          <Combined3D variant="accent" subtle />
        </Suspense>
      </div>

      {needsOnboarding && (
        <Panel className="mb-3 border-accent/25" bodyClassName="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent-soft">
            <Play size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-slate-100">Run your first tool call</div>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              {data.servers.running} server{data.servers.running === 1 ? '' : 's'} connected and{' '}
              {data.tools.total} tools discovered. Executing a tool will populate every chart on this page.
            </p>
          </div>
          <Link to="/tools" className="btn btn-primary btn-sm">
            Open Tool Explorer <ArrowRight size={12} />
          </Link>
        </Panel>
      )}

      {/* ---------------------------- top metrics ---------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MCP servers"
          value={
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={data.servers.running} />
              <span className="text-[16px] font-medium text-slate-500">/ {data.servers.total}</span>
            </span>
          }
          icon={<Server size={13} />}
          tone={data.servers.errors > 0 ? 'err' : 'ok'}
          sub={`${data.servers.stopped} stopped · ${data.servers.errors} failed`}
        />
        <StatCard
          label="Executions · 24h"
          value={<AnimatedNumber value={data.requests.last24h} />}
          icon={<Activity size={13} />}
          sub={`${formatNumber(data.requests.allTime)} all-time · ${failed24h} failed`}
        />
        <StatCard
          label="Success rate"
          value={successRate === null ? '—' : `${successRate}%`}
          icon={<CheckCircle2 size={13} />}
          tone={successRate === null ? 'info' : successRate >= 95 ? 'ok' : successRate >= 80 ? 'warn' : 'err'}
          sub={total24h === 0 ? 'no traffic yet' : `${total24h - failed24h} succeeded of ${total24h}`}
        />
        <StatCard
          label="Average latency"
          value={formatMs(data.performance.avgLatencyMs)}
          icon={<Gauge size={13} />}
          sub={`p50 ${formatMs(telemetry.data?.latency.p50 ?? null)} · p99 ${formatMs(telemetry.data?.latency.p99 ?? null)}`}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        {/* ------------------------ activity chart ------------------------ */}
        <Panel
          title="Request volume"
          subtitle="Hourly MCP tool calls over the last 24 hours — failures stacked in red"
          actions={<Badge tone="muted">{telemetry.data?.latency.samples ?? 0} samples</Badge>}
        >
          {series.every((point) => point.total === 0) ? (
            <EmptyState
              title="No traffic recorded yet"
              description="Execute a tool and this chart fills from real execution rows."
              action={
                <Link to="/tools" className="btn btn-sm btn-outline">
                  Open Tool Explorer
                </Link>
              }
            />
          ) : (
            <div>
              <div className="flex h-[168px] items-end gap-[3px]" role="img" aria-label="Hourly execution volume">
                {series.map((point, index) => {
                  const height = (point.total / maxTotal) * 100;
                  const failedShare = point.total ? (point.failed / point.total) * 100 : 0;
                  return (
                    <div
                      key={`${point.label}-${index}`}
                      className="chart-bar group relative flex-1 rounded-t-[2px] bg-accent/70"
                      style={{ height: `${Math.max(2, height)}%`, animationDelay: `${index * 12}ms` }}
                      title={`${point.label}: ${point.total} calls · ${point.failed} failed`}
                    >
                      <div
                        className="absolute inset-x-0 top-0 rounded-t-[2px] bg-err"
                        style={{ height: `${failedShare}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-600">
                <span>{series[0]?.label ?? ''}</span>
                <span>{series[Math.floor(series.length / 2)]?.label ?? ''}</span>
                <span>{series[series.length - 1]?.label ?? ''}</span>
              </div>
            </div>
          )}
        </Panel>

        {/* ------------------------- health ring -------------------------- */}
        <Panel title="Success distribution" subtitle="Recorded outcomes over the last 24 hours">
          <div className="flex items-center gap-5">
            <svg width="96" height="96" viewBox="0 0 88 88" className="shrink-0" role="img" aria-label="Success rate">
              <circle cx="44" cy="44" r="34" fill="none" stroke="#1e2f45" strokeWidth="7" />
              <circle
                cx="44"
                cy="44"
                r="34"
                fill="none"
                stroke={successRate === null ? '#3a4d42' : successRate >= 95 ? '#36C78A' : successRate >= 80 ? '#D9B978' : '#D9B978'}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${ring.dash} ${ring.circumference}`}
                transform="rotate(-90 44 44)"
              />
              <text x="44" y="48" textAnchor="middle" fill="#f4f6fc" fontSize="16" fontFamily="Inter, sans-serif" fontWeight="600">
                {successRate === null ? '—' : `${Math.round(successRate)}%`}
              </text>
            </svg>
            <dl className="min-w-0 flex-1 space-y-2 text-[11.5px]">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Successful
                </dt>
                <dd className="mono text-slate-200">{formatNumber(total24h - failed24h)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-err" /> Failed
                </dt>
                <dd className="mono text-slate-200">{formatNumber(failed24h)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-slate-400">
                  <Clock size={10} /> Slowest
                </dt>
                <dd className="mono text-slate-200">{formatMs(data.performance.slowestMs)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
            {[
              { icon: Wrench, label: 'Tools', value: data.tools.total },
              { icon: FolderTree, label: 'Resources', value: data.resources.total },
              { icon: ShieldCheck, label: 'Prompts', value: data.prompts.total },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                  <item.icon size={10} /> {item.label}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-slate-100">
                  <AnimatedNumber value={item.value} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.25fr_1fr]">
        {/* --------------------------- servers --------------------------- */}
        <Panel
          title="Server health"
          subtitle="Connection state of each registered server"
          flush
          actions={
            <Link to="/servers" className="btn btn-sm btn-ghost">
              Manage <ArrowUpRight size={11} />
            </Link>
          }
        >
          {data.serverHealth.length === 0 ? (
            <EmptyState title="No servers registered" description="Register your first MCP server to begin." />
          ) : (
            <div className="divide-y divide-line/70">
              {data.serverHealth.map((server) => (
                <Link
                  key={server.id}
                  to={`/servers/${server.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-800/50"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      server.status === 'running' ? 'bg-ok' : server.status === 'error' ? 'bg-err' : 'bg-slate-600'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-slate-200">{server.name}</div>
                    <div className="mono text-[10px] text-slate-500">
                      {server.transport.toUpperCase()} · {server.tools} tools
                      {server.lastError ? ` · ${server.lastError.slice(0, 46)}` : ''}
                    </div>
                  </div>
                  <span className="text-[10.5px] text-slate-600">{timeAgo(server.lastConnectedAt)}</span>
                  <StatusBadge status={server.status} />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {/* ------------------------- recent calls ------------------------ */}
        <Panel
          title="Recent executions"
          subtitle="Newest persisted tool calls"
          flush
          actions={
            <Link to="/executions" className="btn btn-sm btn-ghost">
              History <ArrowUpRight size={11} />
            </Link>
          }
        >
          {data.recentExecutions.length === 0 ? (
            <EmptyState title="Nothing executed yet" description="Tool calls appear here with latency and status." />
          ) : (
            <div className="divide-y divide-line/70">
              {data.recentExecutions.slice(0, 6).map((execution) => (
                <div key={execution.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${execution.isError ? 'bg-err' : 'bg-ok'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="mono truncate text-[11.5px] text-slate-200">{execution.toolName}</span>
                      <span className="truncate text-[10.5px] text-slate-500">{execution.serverName}</span>
                    </div>
                    <div className="text-[10px] text-slate-600">
                      {execution.actor ?? 'system'} · {timeAgo(execution.createdAt)} · {formatMs(execution.durationMs)}
                    </div>
                  </div>
                  <StatusBadge status={execution.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ----------------------------- activity ------------------------- */}
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.25fr]">
        <Panel title="Top tools" subtitle="Ranked by recorded calls" flush>
          {(telemetry.data?.toolUsage.length ?? 0) === 0 ? (
            <EmptyState title="No tool usage yet" />
          ) : (
            <div className="divide-y divide-line/70">
              {telemetry.data!.toolUsage.slice(0, 6).map((tool) => {
                const top = telemetry.data!.toolUsage[0]!.calls || 1;
                return (
                  <div key={tool.name} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono truncate text-[11.5px] text-slate-200">{tool.name}</span>
                      <span className="text-[10.5px] text-slate-500">
                        {tool.calls} calls · {formatMs(tool.avgLatencyMs)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-sky"
                        style={{ width: `${Math.max(4, (tool.calls / top) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Activity" subtitle="Audited platform events" flush>
          {data.activity.length === 0 ? (
            <EmptyState title="No activity recorded" />
          ) : (
            <div className="divide-y divide-line/70">
              {data.activity.slice(0, 7).map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line bg-surface-800 text-slate-500">
                    <Activity size={10} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] text-slate-300">{event.subject}</div>
                    <div className="truncate text-[10px] text-slate-600">
                      {event.kind} · {event.actor} · {timeAgo(event.createdAt)}
                    </div>
                  </div>
                  <Badge tone={event.status === 'ok' ? 'ok' : event.status === 'error' ? 'err' : 'muted'}>
                    {event.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
