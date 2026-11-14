import { Download, Search, Terminal } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { PageHeader } from '../components/Layout.js';
import { SegmentedControl } from '../components/interactions.js';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Panel,
  Select,
  StatusBadge,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type ExecutionDto } from '../lib/api.js';
import { formatDate, formatMs, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type Page = { total: number; executions: ExecutionDto[] };

const PAGE_SIZE = 25;

export function ExecutionsPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<'all' | 'success' | 'error'>('all');
  const [search, setSearch] = useState('');
  const [server, setServer] = useState('');
  const [tool, setTool] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ExecutionDto | null>(null);
  const [exporting, setExporting] = useState(false);

  const servers = useApi<{ servers: Array<{ id: string; name: string }> }>('/api/servers');

  const filters = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (server) params.set('serverId', server);
    if (tool.trim()) params.set('tool', tool.trim());
    if (status !== 'all') params.set('status', status);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    return params;
  }, [search, server, tool, status, from, to]);

  const query = filters.toString();
  const data = useApi<Page>(
    `/api/executions?limit=${PAGE_SIZE}&offset=${offset}${query ? `&${query}` : ''}`,
    { pollMs: 20000 },
  );

  function reset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setOffset(0);
      setSelected(null);
    };
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await api.download(`/api/executions/export${query ? `?${query}` : ''}`, 'mcpnexus-executions.csv');
      push('Execution history exported', 'ok');
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Export failed', 'err');
    } finally {
      setExporting(false);
    }
  }

  const total = data.data?.total ?? 0;
  const rows = data.data?.executions ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Executions"
        subtitle="Every tool call persisted by the control plane. Arguments are masked for secret-looking keys before they leave the server."
        actions={
          <Button variant="outline" size="sm" onClick={() => void exportCsv()} loading={exporting}>
            <Download size={13} /> Export CSV
          </Button>
        }
      />

      <Panel className="mb-3" bodyClassName="flex flex-wrap items-center gap-2 p-3">
        <SegmentedControl
          value={status}
          onChange={reset(setStatus)}
          label="Status filter"
          options={[
            { value: 'all', label: 'All' },
            { value: 'success', label: 'Success' },
            { value: 'error', label: 'Failed' },
          ]}
        />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => reset(setSearch)(event.target.value)}
            placeholder="Search tool, server, error or arguments"
            className="w-[260px] pl-8"
            aria-label="Search executions"
          />
        </div>
        <Select
          value={server}
          onChange={(event) => reset(setServer)(event.target.value)}
          className="w-[180px]"
          aria-label="Filter by server"
        >
          <option value="">All servers</option>
          {(servers.data?.servers ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </Select>
        <Input
          value={tool}
          onChange={(event) => reset(setTool)(event.target.value)}
          placeholder="Exact tool"
          className="w-[150px] mono"
          aria-label="Filter by tool name"
        />
        <Input
          type="date"
          value={from}
          onChange={(event) => reset(setFrom)(event.target.value)}
          className="w-[148px]"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => reset(setTo)(event.target.value)}
          className="w-[148px]"
          aria-label="To date"
        />
        <span className="ml-auto text-[11px] text-slate-500">{total} records</span>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Panel flush>
          {data.loading && !data.data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="skeleton h-8" />
              ))}
            </div>
          ) : data.error ? (
            <div className="p-4">
              <ErrorState error={data.error} onRetry={data.reload} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No executions match"
              description="Adjust the filters, or run a tool from the Tool Explorer to create a record."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Tool</th>
                      <th>Status</th>
                      <th className="text-right">Latency</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelected(row)}
                        className={`cursor-pointer ${selected?.id === row.id ? 'bg-surface-750/70' : ''}`}
                      >
                        <td className="whitespace-nowrap text-[11px] text-slate-500" title={formatDate(row.createdAt)}>
                          {timeAgo(row.createdAt)}
                        </td>
                        <td>
                          <div className="mono text-[11.5px] text-slate-200">{row.toolName}</div>
                          <div className="text-[10.5px] text-slate-500">{row.serverName}</div>
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="text-right mono text-[11px] text-slate-400">{formatMs(row.durationMs)}</td>
                        <td className="text-[11px] text-slate-500">{row.actor ?? 'system'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
                <span className="text-[11px] text-slate-500">
                  {Math.min(offset + 1, total)}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Execution detail" subtitle="Masked arguments and the recorded result">
          {!selected ? (
            <EmptyState
              icon={<Terminal size={16} />}
              title="Select an execution"
              description="Pick a row to inspect its arguments, result and timing."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.status} />
                <span className="mono text-[11px] text-slate-400">{selected.toolName}</span>
                <span className="text-[11px] text-slate-500">{selected.serverName}</span>
                <span className="ml-auto mono text-[10.5px] text-slate-600">{formatMs(selected.durationMs)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="stat-label">Executed</dt>
                  <dd className="mt-0.5 text-slate-300">{formatDate(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt className="stat-label">Actor</dt>
                  <dd className="mt-0.5 text-slate-300">{selected.actor ?? 'system'}</dd>
                </div>
              </dl>
              <div>
                <div className="label">Arguments</div>
                <pre className="code-block max-h-[180px]">{JSON.stringify(selected.arguments, null, 2)}</pre>
              </div>
              {selected.error && (
                <div>
                  <div className="label">Error</div>
                  <pre className="code-block max-h-[140px] border-err/30 text-err/90">{selected.error}</pre>
                </div>
              )}
              <div>
                <div className="label">Result</div>
                <pre className="code-block max-h-[240px]">
                  {selected.result ? JSON.stringify(selected.result, null, 2) : 'No result recorded'}
                </pre>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
