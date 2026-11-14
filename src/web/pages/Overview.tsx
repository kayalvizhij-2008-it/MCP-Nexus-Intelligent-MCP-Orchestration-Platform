import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  FolderTree,
  Gauge,
  Server,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  Sparkline,
  StatCard,
  StatusBadge,
} from '../components/ui.js';
import { formatMs, formatNumber, timeAgo, truncate } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type ObservabilityPayload = {
  overview: {
    servers: { total: number; running: number; stopped: number; errors: number };
    tools: { total: number; enabled: number };
    resources: { total: number; reads24h: number };
    prompts: { total: number };
    requests: { last24h: number; failed24h: number; allTime: number; today: number };
    performance: { successRate: number | null; avgLatencyMs: number | null; slowestMs: number | null };
    pendingApprovals: number;
    recentExecutions: Array<{
      id: string;
      serverName: string;
      toolName: string;
      status: string;
      durationMs: number;
      createdAt: string;
    }>;
    activity: Array<{
      id: string;
      kind: string;
      subject: string;
      context: string;
      status: string;
      actor: string;
      createdAt: string;
    }>;
    serverHealth: Array<{
      id: string;
      name: string;
      status: string;
      transport: string;
      tools: number;
      lastError: string | null;
      lastConnectedAt: string | null;
    }>;
  };
  timeseries: Array<{ label: string; total: number; failed: number; avgLatencyMs: number | null }>;
  latency: { p50: number | null; p90: number | null; p95: number | null; p99: number | null; samples: number };
};

function VolumeChart({ data }: { data: Array<{ label: string; total: number; failed: number }> }) {
  const max = Math.max(1, ...data.map((point) => point.total));
  return (
    <div>
      <div className="flex h-[132px] items-end gap-[3px]">
        {data.map((point, index) => {
          const height = (point.total / max) * 100;
          const failedHeight = point.total ? (point.failed / point.total) * height : 0;
          return (
            <div key={index} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className="relative w-full overflow-hidden rounded-sm bg-surface-700"
                style={{ height: `${Math.max(point.total ? 3 : 0, height)}%` }}
              >
                <div className="absolute bg-accent/90" style={{ height: `${100 - (point.total ? (point.failed / point.total) * 100 : 0)}%`, bottom: 0, width: '100%' }} />
                <div className="absolute top-0 w-full bg-err/80" style={{ height: `${failedHeight}%` }} />
              </div>
              <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border border-line-strong bg-surface-900 px-1.5 py-0.5 text-[10px] text-slate-300 group-hover:block">
                {point.label} · {point.total} calls
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-600">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { data, error, loading, reload } = useApi<ObservabilityPayload>('/api/observability?hours=24', {
    pollMs: 20000,
  });

  if (loading && !data) return <LoadingBlock label="Reading control-plane telemetry" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { overview, timeseries, latency } = data;
  const successTone =
    overview.performance.successRate === null
      ? 'info'
      : overview.performance.successRate >= 98
        ? 'ok'
        : overview.performance.successRate >= 90
          ? 'warn'
          : 'err';

  return (
    <div className="fade-in">
      <PageHeader
        title="Overview"
        subtitle="Live state of every MCP server, tool and execution recorded by this control plane."
        actions={
          <div className="flex items-center gap-2">
            {overview.pendingApprovals > 0 && (
              <Link to="/security">
                <Badge tone="warn">
                  <AlertTriangle size={11} /> {overview.pendingApprovals} pending approval
                  {overview.pendingApprovals === 1 ? '' : 's'}
                </Badge>
              </Link>
            )}
            <span className="text-[11px] text-slate-500">polling every 20s</span>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MCP servers"
          value={`${overview.servers.running}/${overview.servers.total}`}
          icon={<Server size={13} />}
          tone={overview.servers.errors ? 'warn' : 'ok'}
          sub={`${overview.servers.running} running · ${overview.servers.stopped} stopped · ${overview.servers.errors} failed`}
        />
        <StatCard
          label="Registered tools"
          value={formatNumber(overview.tools.total)}
          icon={<Wrench size={13} />}
          sub={`${overview.tools.enabled} enabled for execution`}
        />
        <StatCard
          label="Resources"
          value={formatNumber(overview.resources.total)}
          icon={<FolderTree size={13} />}
          sub={`${formatNumber(overview.resources.reads24h)} reads in the last 24h`}
        />
        <StatCard
          label="Prompt templates"
          value={formatNumber(overview.prompts.total)}
          icon={<Boxes size={13} />}
          sub="Server prompts and custom studio templates"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Requests · 24h"
          value={formatNumber(overview.requests.last24h)}
          icon={<Activity size={13} />}
          sub={`${formatNumber(overview.requests.allTime)} all-time · ${formatNumber(overview.requests.failed24h)} failed`}
        >
          <Sparkline values={timeseries.map((point) => point.total)} width={78} />
        </StatCard>
        <StatCard
          label="Success rate"
          value={overview.performance.successRate === null ? '—' : `${overview.performance.successRate}%`}
          icon={<ShieldCheck size={13} />}
          tone={successTone as any}
          sub={
            overview.performance.successRate === null
              ? 'No executions recorded yet'
              : `${formatNumber(overview.requests.failed24h)} failures in the last 24h`
          }
        />
        <StatCard
          label="Avg latency"
          value={formatMs(overview.performance.avgLatencyMs)}
          icon={<Gauge size={13} />}
          sub={`p95 ${formatMs(latency.p95)} · ${latency.samples} samples`}
        />
        <StatCard
          label="Today"
          value={formatNumber(overview.requests.today)}
          icon={<Activity size={13} />}
          sub="Tool calls since midnight (server local time)"
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <Panel
          title="Request volume"
          subtitle="Hourly MCP tool calls over the last 24 hours — failures stacked in red"
        >
          {timeseries.every((point) => point.total === 0) ? (
            <EmptyState
              title="No executions yet"
              description="Run a tool from the Tool Explorer and the timeline will populate with real measurements."
              action={
                <Link to="/tools" className="btn btn-sm">
                  Open Tool Explorer
                </Link>
              }
            />
          ) : (
            <VolumeChart data={timeseries} />
          )}
        </Panel>

        <Panel
          title="Server health"
          subtitle="Connection state of each registered server"
          flush
          actions={<Link to="/servers" className="btn btn-sm btn-ghost">Manage <ArrowUpRight size={11} /></Link>}
        >
          <div className="divide-y divide-line/70">
            {overview.serverHealth.map((server) => (
              <Link
                key={server.id}
                to={`/servers/${server.id}`}
                className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-800/60"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-slate-200">{server.name}</div>
                  <div className="mono mt-0.5 text-[10.5px] uppercase text-slate-500">
                    {server.transport} · {server.tools} tools · {timeAgo(server.lastConnectedAt)}
                  </div>
                </div>
                <StatusBadge status={server.status} />
              </Link>
            ))}
            {overview.serverHealth.length === 0 && (
              <EmptyState title="No servers registered" description="Register an MCP server to begin." />
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="Recent executions" subtitle="Calls persisted by the MCP connection manager" flush>
          {overview.recentExecutions.length === 0 ? (
            <EmptyState
              title="Nothing executed yet"
              description="Every tool call is written to SQLite with its duration and result metadata."
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Server</th>
                  <th>Status</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentExecutions.map((execution) => (
                  <tr key={execution.id}>
                    <td className="font-medium text-slate-200">{execution.toolName}</td>
                    <td className="text-slate-400">{execution.serverName}</td>
                    <td>
                      <StatusBadge status={execution.status} />
                    </td>
                    <td className="text-right mono text-slate-400">{formatMs(execution.durationMs)}</td>
                    <td className="text-right text-[11px] text-slate-500">{timeAgo(execution.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Activity" subtitle="Executions and audited actions" flush>
          <div className="max-h-[320px] divide-y divide-line/60 overflow-y-auto">
            {overview.activity.map((entry) => (
              <div key={`${entry.kind}-${entry.id}`} className="flex items-start gap-2.5 px-4 py-2.5">
                <span className="mt-1.5">
                  <span
                    className={
                      entry.kind === 'audit'
                        ? 'block h-1.5 w-1.5 rounded-full bg-violet'
                        : entry.status === 'error'
                          ? 'block h-1.5 w-1.5 rounded-full bg-err'
                          : 'block h-1.5 w-1.5 rounded-full bg-ok'
                    }
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-slate-300">
                    <span className="mono text-[10.5px] uppercase tracking-wide text-slate-500">
                      {entry.kind}
                    </span>{' '}
                    {truncate(entry.subject, 46)}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-slate-600">
                    {entry.actor || 'system'} · {timeAgo(entry.createdAt)}
                  </div>
                </div>
              </div>
            ))}
            {overview.activity.length === 0 && (
              <EmptyState title="No activity" description="Interactions will appear here." />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
