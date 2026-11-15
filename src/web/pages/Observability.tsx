import { Activity, AlertTriangle, Clock, FolderTree, Gauge, Wrench } from 'lucide-react';
import React, { useState } from 'react';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Panel,
  Select,
  StatCard,
  StatusBadge,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type ExecutionDto } from '../lib/api.js';
import { formatDate, formatMs, formatNumber, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type Payload = {
  overview: {
    requests: { last24h: number; failed24h: number; allTime: number; today: number };
    performance: { successRate: number | null; avgLatencyMs: number | null; slowestMs: number | null };
    servers: { total: number; running: number };
    tools: { total: number; enabled: number };
    resources: { total: number; reads24h: number };
  };
  timeseries: Array<{ label: string; total: number; failed: number; avgLatencyMs: number | null }>;
  toolUsage: Array<{ name: string; calls: number; failures: number; avgLatencyMs: number | null }>;
  errors: Array<{ server: string; tool: string; failures: number }>;
  latency: { p50: number | null; p90: number | null; p95: number | null; p99: number | null; samples: number };
  resources: {
    top: Array<{ uri: string; name: string; serverName: string; reads: number; lastRead: string; bytes: number }>;
    totals: { reads: number; failures: number; avgLatencyMs: number | null };
  };
  hours: number;
};

type TimelinePayload = {
  events: Array<{
    id: string;
    serverName: string;
    toolName: string;
    status: string;
    durationMs: number;
    isError: boolean;
    error: string | null;
    actor: string | null;
    createdAt: string;
  }>;
};

export function ObservabilityPage() {
  const [hours, setHours] = useState('24');
  const [serverFilter, setServerFilter] = useState('');
  const data = useApi<Payload>(`/api/observability?hours=${hours}`, { pollMs: 30000 });
  const timeline = useApi<TimelinePayload>(
    `/api/observability/timeline?limit=60${serverFilter ? `&serverId=${serverFilter}` : ''}`,
    { pollMs: 20000 },
  );
  const serverList = useApi<{ servers: Array<{ id: string; name: string }> }>('/api/servers');

  // Execution history search — paged, filtered and exportable.
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [toolFilter, setToolFilter] = useState('');
  const [execServer, setExecServer] = useState('');
  const [execStatus, setExecStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const pageSize = 25;

  const filters = new URLSearchParams();
  if (search.trim()) filters.set('q', search.trim());
  if (execServer) filters.set('serverId', execServer);
  if (toolFilter.trim()) filters.set('tool', toolFilter.trim());
  if (execStatus) filters.set('status', execStatus);
  if (from) filters.set('from', new Date(from).toISOString());
  if (to) filters.set('to', new Date(to).toISOString());
  const filterQuery = filters.toString();
  const executions = useApi<{ total: number; executions: ExecutionDto[] }>(
    `/api/executions?limit=${pageSize}&offset=${offset}${filterQuery ? `&${filterQuery}` : ''}`,
    { pollMs: 20000 },
  );

  async function exportCsv() {
    try {
      await api.download(`/api/executions/export${filterQuery ? `?${filterQuery}` : ''}`, 'mcpnexus-executions.csv');
      push('Execution history exported', 'ok');
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Export failed', 'err');
    }
  }

  if (data.loading && !data.data) return <LoadingBlock label="Aggregating telemetry" />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  const payload = data.data!;
  const max = Math.max(1, ...payload.timeseries.map((point) => point.total));

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Operations"
        title="Observability"
        subtitle="Everything here is computed from persisted execution records — no synthetic metrics."
        actions={
          <div className="flex items-center gap-2">
            <Select value={hours} onChange={(event) => setHours(event.target.value)} className="w-[140px]">
              <option value="24">Last 24 hours</option>
              <option value="72">Last 72 hours</option>
              <option value="168">Last 7 days</option>
            </Select>
            <Badge tone="info">{payload.latency.samples} samples</Badge>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Requests · ${hours}h`}
          value={formatNumber(payload.overview.requests.last24h)}
          icon={<Activity size={13} />}
          sub={`${formatNumber(payload.overview.requests.failed24h)} failed · ${formatNumber(payload.overview.requests.allTime)} all-time`}
        />
        <StatCard
          label="Success rate"
          value={
            payload.overview.performance.successRate === null
              ? '—'
              : `${payload.overview.performance.successRate}%`
          }
          icon={<Clock size={13} />}
          tone={payload.overview.performance.successRate === null ? 'info' : payload.overview.performance.successRate > 95 ? 'ok' : 'warn'}
        />
        <StatCard
          label="Average latency"
          value={formatMs(payload.overview.performance.avgLatencyMs)}
          icon={<Gauge size={13} />}
          sub={`p50 ${formatMs(payload.latency.p50)} · p99 ${formatMs(payload.latency.p99)}`}
        />
        <StatCard
          label="Resource reads"
          value={formatNumber(payload.resources.totals.reads)}
          icon={<FolderTree size={13} />}
          sub={`${formatNumber(payload.overview.resources.reads24h)} in the last 24h`}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Request volume" subtitle="Hourly calls with failures highlighted">
          {payload.timeseries.every((point) => point.total === 0) ? (
            <EmptyState title="No traffic recorded" description="Execute a tool to populate this chart." />
          ) : (
            <div>
              <div className="flex h-[170px] items-end gap-[3px]">
                {payload.timeseries.map((point, index) => (
                  <div key={index} className="group relative flex-1">
                    <div
                      className="w-full rounded-sm bg-accent/80"
                      style={{ height: `${(point.total / max) * 100}%`, minHeight: point.total ? 3 : 0 }}
                    >
                      <div
                        className="absolute top-0 w-full bg-err/80"
                        style={{ height: point.total ? `${(point.failed / point.total) * 100}%` : 0 }}
                      />
                    </div>
                    <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border border-line-strong bg-surface-900 px-1.5 py-0.5 text-[10px] text-slate-300 group-hover:block">
                      {point.label} · {point.total} calls · {point.failed} failed
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-600">
                <span>{payload.timeseries[0]?.label}</span>
                <span>{payload.timeseries[payload.timeseries.length - 1]?.label}</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Latency distribution" subtitle="Percentiles across all recorded executions">
          <div className="space-y-3">
            {[
              ['p50', payload.latency.p50],
              ['p90', payload.latency.p90],
              ['p95', payload.latency.p95],
              ['p99', payload.latency.p99],
            ].map(([label, value]) => {
              const maxLatency = Math.max(1, payload.latency.p99 ?? 1);
              return (
                <div key={String(label)}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{label}</span>
                    <span className="mono text-slate-300">{formatMs(value as number | null)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-violet"
                      style={{ width: `${Math.min(100, ((value as number) ?? 0) / maxLatency * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-line bg-surface-900 p-2.5">
              <div className="text-slate-500">Tools</div>
              <div className="mono mt-0.5 text-slate-200">
                {payload.overview.tools.total} ({payload.overview.tools.enabled} enabled)
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface-900 p-2.5">
              <div className="text-slate-500">Servers</div>
              <div className="mono mt-0.5 text-slate-200">
                {payload.overview.servers.running}/{payload.overview.servers.total} running
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="Tool usage" subtitle="Calls, failures and average latency per tool" flush>
          {payload.toolUsage.length === 0 ? (
            <EmptyState title="No tool usage" icon={<Wrench size={16} />} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th className="text-right">Calls</th>
                  <th className="text-right">Failures</th>
                  <th className="text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {payload.toolUsage.map((tool) => (
                  <tr key={tool.name}>
                    <td className="font-medium text-slate-200">{tool.name}</td>
                    <td className="text-right mono">{tool.calls}</td>
                    <td className={`text-right mono ${tool.failures ? 'text-err' : 'text-slate-500'}`}>
                      {tool.failures}
                    </td>
                    <td className="text-right mono">{formatMs(tool.avgLatencyMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Error distribution" subtitle="Where failures concentrate" flush>
          {payload.errors.length === 0 ? (
            <EmptyState title="No failures recorded" description="A clean error budget so far." />
          ) : (
            <div className="divide-y divide-line/60">
              {payload.errors.map((error, index) => (
                <div key={index} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-err" />
                    <div>
                      <div className="text-[12px] text-slate-200">{error.tool}</div>
                      <div className="text-[10.5px] text-slate-500">{error.server}</div>
                    </div>
                  </div>
                  <Badge tone="err">{error.failures} failed</Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Execution timeline"
          subtitle="Individual tool calls with durations, actors and status"
          flush
          actions={
            <Select
              value={serverFilter}
              onChange={(event) => setServerFilter(event.target.value)}
              className="h-7 w-[160px] py-0 text-[11.5px]"
            >
              <option value="">All servers</option>
              {(serverList.data?.servers ?? []).map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </Select>
          }
        >
          {(timeline.data?.events ?? []).length === 0 ? (
            <EmptyState title="No executions yet" description="The timeline fills as tools are executed." />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {timeline.data!.events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 border-b border-line/50 px-4 py-2.5 last:border-0">
                  <span className="mt-1.5">
                    <span
                      className={`block h-1.5 w-1.5 rounded-full ${event.isError ? 'bg-err' : 'bg-ok'}`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-slate-200">{event.toolName}</span>
                      <span className="text-[10.5px] text-slate-500">{event.serverName}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-600">
                      {event.actor ?? 'system'} · {timeAgo(event.createdAt)} · {formatMs(event.durationMs)}
                      {event.error ? ` · ${event.error.slice(0, 80)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={event.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Most-read resources" subtitle="Access statistics from real reads" flush>
          {payload.resources.top.length === 0 ? (
            <EmptyState title="No resource reads" />
          ) : (
            <div className="divide-y divide-line/60">
              {payload.resources.top.map((resource) => (
                <div key={resource.uri} className="px-4 py-2.5">
                  <div className="mono truncate text-[11.5px] text-slate-200">{resource.uri}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-slate-500">
                    <span>{resource.serverName}</span>
                    <span>
                      {resource.reads} reads · {timeAgo(resource.lastRead)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Execution history"
        subtitle="Searchable tool-call records. Secret-looking arguments are masked before they leave the server."
        className="mt-3"
        flush
        actions={
          <Button size="sm" variant="ghost" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder="Search tool, server, error or arguments"
            className="w-[240px]"
          />
          <Input
            value={toolFilter}
            onChange={(event) => {
              setToolFilter(event.target.value);
              setOffset(0);
            }}
            placeholder="Exact tool"
            className="w-[150px]"
          />
          <Select
            value={execServer}
            onChange={(event) => {
              setExecServer(event.target.value);
              setOffset(0);
            }}
            className="w-[170px]"
          >
            <option value="">All servers</option>
            {(serverList.data?.servers ?? []).map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </Select>
          <Select
            value={execStatus}
            onChange={(event) => {
              setExecStatus(event.target.value);
              setOffset(0);
            }}
            className="w-[130px]"
          >
            <option value="">Any status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setOffset(0);
            }}
            className="w-[150px]"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setOffset(0);
            }}
            className="w-[150px]"
          />
          <span className="ml-auto text-[11px] text-slate-500">
            {executions.data ? `${executions.data.total} matching records` : 'loading'}
          </span>
        </div>

        {executions.loading && !executions.data ? (
          <LoadingBlock label="Loading execution history" />
        ) : executions.error ? (
          <ErrorState error={executions.error} onRetry={executions.reload} />
        ) : (executions.data?.executions ?? []).length === 0 ? (
          <EmptyState title="No matching executions" description="Adjust the filters, or run a tool to create a record." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Server</th>
                    <th>Tool</th>
                    <th>Status</th>
                    <th className="text-right">Latency</th>
                    <th>Actor</th>
                    <th>Arguments</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.data!.executions.map((execution) => (
                    <tr key={execution.id}>
                      <td className="whitespace-nowrap text-[11px] text-slate-500" title={formatDate(execution.createdAt)}>
                        {timeAgo(execution.createdAt)}
                      </td>
                      <td className="text-[11.5px] text-slate-300">{execution.serverName}</td>
                      <td className="mono text-[11.5px] text-slate-200">{execution.toolName}</td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status={execution.status} />
                          {execution.error && (
                            <span className="max-w-[260px] truncate text-[10px] text-err/80" title={execution.error}>
                              {execution.error}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right mono text-[11px] text-slate-400">{formatMs(execution.durationMs)}</td>
                      <td className="text-[11px] text-slate-500">{execution.actor ?? 'system'}</td>
                      <td className="max-w-[260px] truncate mono text-[10.5px] text-slate-500">
                        {JSON.stringify(execution.arguments)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
              <span className="text-[11px] text-slate-500">
                {offset + 1}–{Math.min(offset + pageSize, executions.data!.total)} of {executions.data!.total}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset + pageSize >= executions.data!.total}
                  onClick={() => setOffset(offset + pageSize)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
