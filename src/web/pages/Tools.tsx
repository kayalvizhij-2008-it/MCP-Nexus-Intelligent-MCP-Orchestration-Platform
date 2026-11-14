import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Play,
  Search,
  ShieldAlert,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../App.js';
import { PageHeader } from '../components/Layout.js';
import { SchemaForm, coerceArguments, schemaSummary } from '../components/SchemaForm.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  JsonBlock,
  LoadingBlock,
  Panel,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type ExecutionDto, type ServerDto, type ToolDto } from '../lib/api.js';
import { formatMs, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type ExecuteResponse = {
  status: string;
  execution?: ExecutionDto & { text?: string | null };
  pendingApproval?: { approval?: { id: string; requestedBy: string } };
  message?: string;
};

export function ToolsPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const serversApi = useApi<{ servers: ServerDto[] }>('/api/servers');
  const toolsApi = useApi<{ tools: ToolDto[] }>('/api/tools', { pollMs: 20000 });

  const [serverFilter, setServerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const tools = toolsApi.data?.tools ?? [];
  const selectedId = params.get('tool');
  const selected = tools.find((tool) => tool.id === selectedId) ?? tools[0] ?? null;

  const filtered = useMemo(
    () =>
      tools.filter((tool) => {
        const matchesServer = serverFilter === 'all' || tool.serverId === serverFilter;
        const matchesSearch =
          !search ||
          `${tool.name} ${tool.description} ${tool.serverName ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase());
        return matchesServer && matchesSearch;
      }),
    [tools, serverFilter, search],
  );

  const schema = selected?.inputSchema ?? {};
  const summary = schemaSummary(schema);

  useEffect(() => {
    setValues({});
    setRawJson('{}');
    setResult(null);
    setRunError(null);
  }, [selected?.id]);

  const historyApi = useApi<{ executions: ExecutionDto[] }>(
    selected ? `/api/executions?limit=40&serverId=${selected.serverId}` : null,
    { pollMs: 15000 },
  );
  const history = (historyApi.data?.executions ?? []).filter(
    (execution) => execution.toolName === selected?.name,
  );

  async function execute() {
    if (!selected) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const args = rawMode
        ? (() => {
            try {
              return JSON.parse(rawJson || '{}');
            } catch {
              throw new Error('Arguments must be valid JSON');
            }
          })()
        : coerceArguments(schema, values);
      const response = await api.post<ExecuteResponse>(`/api/tools/${selected.id}/execute`, {
        arguments: args,
      });
      setResult(response);
      if (response.status === 'pending_approval') {
        push('Execution parked for approval', 'info');
      } else if (response.execution?.isError) {
        push('Tool returned an error', 'err');
      } else {
        push(`Executed in ${formatMs(response.execution?.durationMs)}`, 'ok');
      }
      historyApi.reload();
    } catch (error) {
      setRunError(error instanceof ApiError ? error.message : String(error));
      const details = (error as ApiError)?.details as { issues?: Array<{ path: string; message: string }> } | undefined;
      if (details?.issues) {
        setRunError(`${(error as ApiError).message}: ${details.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
      }
    } finally {
      setRunning(false);
    }
  }

  if (toolsApi.loading && !toolsApi.data) return <LoadingBlock label="Discovering tools" />;
  if (toolsApi.error) return <ErrorState error={toolsApi.error} onRetry={toolsApi.reload} />;

  return (
    <div className="fade-in">
      <PageHeader
        title="Tool Explorer"
        subtitle="Every tool is discovered over MCP. Arguments are validated against the live JSON schema, then executed with a real tools/call."
        actions={
          <Badge tone="info">
            <Wrench size={11} /> {tools.length} tools discovered
          </Badge>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <Panel flush>
            <div className="space-y-2 border-b border-line p-3">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search tools"
                  className="pl-8"
                />
              </div>
              <Select value={serverFilter} onChange={(event) => setServerFilter(event.target.value)}>
                <option value="all">All servers</option>
                {(serversApi.data?.servers ?? []).map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {filtered.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setParams({ tool: tool.id })}
                  className={`flex w-full items-start gap-2 border-b border-line/60 px-3 py-2.5 text-left transition-colors ${
                    selected?.id === tool.id ? 'bg-accent/10' : 'hover:bg-surface-800/60'
                  }`}
                >
                  <ChevronRight
                    size={13}
                    className={`mt-0.5 shrink-0 ${selected?.id === tool.id ? 'text-accent-soft' : 'text-slate-600'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-slate-200">{tool.name}</span>
                      {tool.requiresApproval && <ShieldAlert size={11} className="shrink-0 text-warn" />}
                      {!tool.enabled && <span className="text-[10px] text-slate-500">disabled</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[10.5px] text-slate-500">
                      {tool.serverName} · {schemaSummary(tool.inputSchema).count} args
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <EmptyState title="No tools" description="Start a server to discover its tools." />
              )}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-3">
          {!selected ? (
            <Panel>
              <EmptyState
                title="Select a tool"
                description="Tools appear here once an MCP session has completed discovery."
                icon={<Wrench size={16} />}
              />
            </Panel>
          ) : (
            <>
              <Panel
                title={selected.name}
                subtitle={selected.description || 'No description provided by the server'}
                actions={
                  <div className="flex items-center gap-1.5">
                    <Badge tone="muted">{selected.serverName}</Badge>
                    {selected.requiresApproval && (
                      <Badge tone="warn">
                        <ShieldAlert size={10} /> approval
                      </Badge>
                    )}
                  </div>
                }
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="section-title">Arguments</span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant={rawMode ? 'default' : 'ghost'} onClick={() => setRawMode(false)}>
                          Form
                        </Button>
                        <Button size="sm" variant={rawMode ? 'ghost' : 'default'} onClick={() => setRawMode(true)}>
                          <Terminal size={11} /> JSON
                        </Button>
                      </div>
                    </div>
                    {rawMode ? (
                      <Textarea
                        rows={10}
                        value={rawJson}
                        onChange={(event) => setRawJson(event.target.value)}
                        className="input-mono"
                        spellCheck={false}
                      />
                    ) : (
                      <SchemaForm schema={schema} values={values} onChange={setValues} />
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="primary"
                        onClick={() => void execute()}
                        loading={running}
                        disabled={!can('tool:execute') || !selected.enabled}
                      >
                        <Play size={12} /> Execute tool
                      </Button>
                      {!can('tool:execute') && (
                        <span className="text-[11px] text-slate-500">Your role cannot execute tools.</span>
                      )}
                      {selected.enabled === false && (
                        <span className="text-[11px] text-warn">Tool is disabled by an administrator.</span>
                      )}
                    </div>
                    {selected.requiresApproval && (
                      <p className="hint mt-2">
                        This tool requires an approval decision. Administrators are auto-approved; other roles
                        create a pending request in the Security Center.
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="section-title">Input schema</span>
                      <Badge tone="muted">
                        {summary.required.length} required / {summary.count} props
                      </Badge>
                    </div>
                    <JsonBlock value={schema} maxHeight={280} />
                  </div>
                </div>
              </Panel>

              {runError && <ErrorState error={runError} />}

              {result?.status === 'pending_approval' && (
                <Panel className="border-warn/30 bg-warn/5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="mt-0.5 text-warn" />
                    <div>
                      <div className="text-[13px] font-medium text-warn">Awaiting approval</div>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        Approval <span className="mono">{result.pendingApproval?.approval?.id}</span> was created
                        for {result.pendingApproval?.approval?.requestedBy}. An administrator can approve it in
                        the Security Center, then re-run the call.
                      </p>
                    </div>
                  </div>
                </Panel>
              )}

              {result?.execution && (
                <Panel
                  title="Execution result"
                  subtitle={`${result.execution.serverName} · ${result.execution.toolName}`}
                  actions={
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={result.execution.status} />
                      <Badge tone="muted">{formatMs(result.execution.durationMs)}</Badge>
                    </div>
                  }
                >
                  {result.execution.isError ? (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-err/25 bg-err/10 px-3 py-2 text-[12px] text-red-200">
                      <XCircle size={14} className="mt-0.5 shrink-0" />
                      <span className="whitespace-pre-wrap">{result.execution.error ?? 'Tool reported an error'}</span>
                    </div>
                  ) : (
                    <div className="mb-3 flex items-center gap-2 text-[12px] text-ok">
                      <CheckCircle2 size={14} /> Completed with {result.execution.result?.content?.length ?? 0}{' '}
                      content part(s)
                    </div>
                  )}
                  {result.execution.text ? (
                    <pre className="code-block max-h-[360px] whitespace-pre-wrap">{result.execution.text}</pre>
                  ) : null}
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="section-title">Raw MCP payload</span>
                      <Badge tone="muted">tools/call</Badge>
                    </div>
                    <JsonBlock
                      value={{ arguments: result.execution.arguments, result: result.execution.result }}
                      maxHeight={280}
                    />
                  </div>
                </Panel>
              )}

              <Panel title="Recent runs of this tool" subtitle="Persisted execution history" flush>
                {history.length === 0 ? (
                  <EmptyState title="No runs yet" description="Execute the tool to build a timeline." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Arguments</th>
                          <th className="text-right">Duration</th>
                          <th>Actor</th>
                          <th className="text-right">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.slice(0, 10).map((execution) => (
                          <tr key={execution.id}>
                            <td>
                              <StatusBadge status={execution.status} />
                            </td>
                            <td className="max-w-[280px] truncate mono text-slate-400">
                              {JSON.stringify(execution.arguments)}
                            </td>
                            <td className="text-right mono text-slate-400">{formatMs(execution.durationMs)}</td>
                            <td className="text-[11px] text-slate-500">{execution.actor ?? 'system'}</td>
                            <td className="text-right text-[11px] text-slate-500">
                              {timeAgo(execution.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
