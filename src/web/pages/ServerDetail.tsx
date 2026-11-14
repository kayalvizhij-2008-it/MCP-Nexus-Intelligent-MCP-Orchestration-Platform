import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Code2,
  FileText,
  FolderTree,
  GitCompare,
  History,
  KeyRound,
  Play,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Square,
  Stethoscope,
  Trash2,
  Wrench,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App.js';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  JsonBlock,
  LoadingBlock,
  Modal,
  Panel,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  Toggle,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type ResourceDto, type ServerDto } from '../lib/api.js';
import { formatDate, formatMs, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type ToolDetail = {
  id: string;
  name: string;
  title: string | null;
  description: string;
  inputSchema: any;
  enabled: boolean;
  requiresApproval: boolean;
  discoveredAt: string;
};

type PromptDetail = {
  id: string;
  name: string;
  description: string;
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
  discoveredAt: string;
};

type Detail = {
  server: ServerDto;
  tools: ToolDetail[];
  resources: ResourceDto[];
  prompts: PromptDetail[];
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'tools', label: 'Tools' },
  { id: 'resources', label: 'Resources' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'logs', label: 'Logs' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'compatibility', label: 'Compatibility' },
];

export function ServerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const detail = useApi<Detail>(`/api/servers/${id}`, { pollMs: 20000 });

  async function control(action: 'start' | 'stop' | 'restart') {
    setBusy(true);
    try {
      await api.post(`/api/servers/${id}/${action}`);
      push(`${action} complete`, 'ok');
      detail.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : `${action} failed`, 'err');
      detail.reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/servers/${id}`);
      push('Server removed', 'ok');
      navigate('/servers');
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Delete failed', 'err');
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  if (detail.loading && !detail.data) return <LoadingBlock label="Loading server" />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return null;
  const { server, tools, resources, prompts } = detail.data;
  const canManage = can('server:manage');

  return (
    <div className="fade-in">
      <Link to="/servers" className="mb-3 inline-flex items-center gap-1 text-[11.5px] text-slate-500 hover:text-slate-300">
        <ArrowLeft size={12} /> All servers
      </Link>
      <PageHeader
        title={server.name}
        subtitle={server.description || 'No description configured'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={server.status} />
            <Badge tone={server.transport === 'http' ? 'violet' : 'muted'}>
              {server.transport.toUpperCase()}
            </Badge>
            {canManage && (
              <>
                {server.connected ? (
                  <>
                    <Button onClick={() => void control('restart')} loading={busy}>
                      <RotateCw size={12} /> Restart
                    </Button>
                    <Button onClick={() => void control('stop')} loading={busy}>
                      <Square size={12} /> Stop
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={() => void control('start')} loading={busy}>
                    <Play size={12} /> Start
                  </Button>
                )}
                <Button variant="danger" size="icon" onClick={() => setDeleteOpen(true)} title="Delete server">
                  <Trash2 size={13} />
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="mono">{server.slug}</span>
        <span>connected {timeAgo(server.lastConnectedAt)}</span>
        <span>health check {timeAgo(server.lastHealthAt)}</span>
        <span>{server.counts.tools} tools · {server.counts.resources} resources · {server.counts.prompts} prompts</span>
      </div>

      <Tabs
        tabs={TABS.map((entry) => ({
          ...entry,
          count:
            entry.id === 'tools'
              ? tools.length
              : entry.id === 'resources'
                ? resources.length
                : entry.id === 'prompts'
                  ? prompts.length
                  : undefined,
        }))}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-4">
        {tab === 'overview' && <OverviewTab server={server} />}
        {tab === 'configuration' && <ConfigurationTab server={server} onSaved={detail.reload} />}
        {tab === 'tools' && <ToolsTab server={server} tools={tools} onChanged={detail.reload} />}
        {tab === 'resources' && <ResourcesTab server={server} resources={resources} />}
        {tab === 'prompts' && <PromptsTab server={server} prompts={prompts} />}
        {tab === 'logs' && <LogsTab serverId={server.id} />}
        {tab === 'analytics' && <AnalyticsTab serverId={server.id} />}
        {tab === 'permissions' && <PermissionsTab serverId={server.id} />}
        {tab === 'diagnostics' && <DiagnosticsTab serverId={server.id} />}
        {tab === 'compatibility' && <CompatibilityTab serverId={server.id} />}
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${server.name}?`}
        description="The server registration, its discovered primitives, configuration versions and logs are removed. Execution history is retained for audit."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()} loading={busy}>
              Delete server
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-slate-400">
          This cannot be undone. If the process is running it will be stopped first.
        </p>
      </Modal>
    </div>
  );
}

/* -------------------------------- overview -------------------------------- */

function OverviewTab({ server }: { server: ServerDto }) {
  const health = useApi<{ connected: boolean; history: Array<{ status: string; latencyMs: number; checkedAt: string }> }>(
    `/api/servers/${server.id}/health`,
    { pollMs: 30000 },
  );
  const history = health.data?.history ?? [];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Connection" subtitle="Negotiated MCP session state">
        <dl className="space-y-2.5 text-[12.5px]">
          {[
            ['Status', <StatusBadge key="s" status={server.status} />],
            ['Transport', <span key="t" className="mono">{server.transport.toUpperCase()}</span>],
            ['Server implementation', <span key="i" className="mono">{server.serverInfo?.name ?? '—'} {server.serverInfo?.version ? `v${server.serverInfo.version}` : ''}</span>],
            ['Endpoint', <span key="e" className="mono break-all">{server.transport === 'http' ? server.url : [server.command, ...server.args].join(' ')}</span>],
            ['Last connected', <span key="l">{formatDate(server.lastConnectedAt)}</span>],
            ['Health check', <span key="h">{timeAgo(server.lastHealthAt)}</span>],
          ].map(([label, value], index) => (
            <div key={index} className="flex items-start justify-between gap-4 border-b border-line/60 pb-2 last:border-0">
              <dt className="shrink-0 text-slate-500">{label}</dt>
              <dd className="text-right text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
        {server.lastError && (
          <div className="mt-3 rounded-lg border border-err/25 bg-err/10 px-3 py-2 text-[11.5px] text-red-200">
            {server.lastError}
          </div>
        )}
      </Panel>

      <Panel title="Capabilities" subtitle="Advertised during the initialize handshake">
        {Object.keys(server.capabilities).length === 0 ? (
          <EmptyState title="No capabilities recorded" description="Start the server to perform discovery." />
        ) : (
          <JsonBlock value={server.capabilities} maxHeight={260} />
        )}
      </Panel>

      <Panel title="Health history" subtitle="Recent ping results recorded by the control plane">
        {history.length === 0 ? (
          <EmptyState title="No health samples" description="Health checks run every 30 seconds while connected." />
        ) : (
          <div className="flex h-24 items-end gap-1">
            {history.slice(-50).map((sample, index) => (
              <div
                key={index}
                title={`${sample.status} · ${sample.latencyMs}ms · ${formatDate(sample.checkedAt)}`}
                className={`flex-1 rounded-sm ${sample.status === 'up' ? 'bg-ok/70' : 'bg-err/60'}`}
                style={{ height: `${Math.max(8, Math.min(100, sample.latencyMs / 4 + 10))}%` }}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Configuration snapshot" subtitle="Current runtime settings">
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          {[
            ['Enabled', server.enabled ? 'yes' : 'no'],
            ['Auto start', server.autoStart ? 'yes' : 'no'],
            ['Tags', server.tags.join(', ') || '—'],
            ['Env variables', `${server.envKeys.length} encrypted`],
            ['HTTP headers', `${server.headerKeys.length} encrypted`],
            ['Created', formatDate(server.createdAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[10.5px] uppercase tracking-wider text-slate-600">{label}</div>
              <div className="mt-0.5 text-slate-300">{value}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ configuration ----------------------------- */

function ConfigurationTab({ server, onSaved }: { server: ServerDto; onSaved: () => void }) {
  const { push } = useToast();
  const [form, setForm] = useState({
    name: server.name,
    description: server.description,
    command: server.command ?? '',
    args: server.args.join('\n'),
    url: server.url ?? '',
    tags: server.tags.join(', '),
    autoStart: server.autoStart,
    enabled: server.enabled,
    env: '',
    headers: '',
  });
  const [saving, setSaving] = useState(false);
  const [diff, setDiff] = useState<ConfigDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const versions = useApi<{ versions: Array<{ id: string; version: number; note: string; createdBy: string; createdAt: string; config: any }> }>(
    `/api/servers/${server.id}/config-versions`,
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        autoStart: form.autoStart,
        enabled: form.enabled,
      };
      if (server.transport === 'stdio') {
        payload.command = form.command;
        payload.args = form.args;
      } else {
        payload.url = form.url;
      }
      if (form.env.trim()) payload.env = form.env;
      if (form.headers.trim()) payload.headers = form.headers;
      const response = await api.patch<{ restartRequired?: boolean }>(`/api/servers/${server.id}`, payload);
      push(response.restartRequired ? 'Saved — restart to apply transport changes' : 'Configuration saved', 'ok');
      setForm({ ...form, env: '', headers: '' });
      versions.reload();
      onSaved();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function showDiff(version: number) {
    setDiffLoading(true);
    try {
      const result = await api.get<ConfigDiff & { ok: boolean }>(
        `/api/servers/${server.id}/config-versions/${version}/diff`,
      );
      setDiff(result);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Could not build the diff', 'err');
    } finally {
      setDiffLoading(false);
    }
  }

  async function restore(version: number) {
    try {
      await api.post(`/api/servers/${server.id}/config-versions/${version}/restore`);
      push(`Restored version ${version}`, 'ok');
      versions.reload();
      onSaved();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Restore failed', 'err');
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[1.25fr_1fr]">
      <Panel title="Server configuration" subtitle="Transport settings, environment and start behaviour">
        <form onSubmit={save} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="Tags" hint="Comma separated">
              <Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          {server.transport === 'stdio' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Command">
                <Input
                  value={form.command}
                  onChange={(event) => setForm({ ...form, command: event.target.value })}
                  className="input-mono"
                />
              </Field>
              <Field label="Arguments" hint="One per line">
                <Textarea
                  rows={3}
                  value={form.args}
                  onChange={(event) => setForm({ ...form, args: event.target.value })}
                  className="input-mono"
                />
              </Field>
            </div>
          ) : (
            <Field label="Endpoint URL">
              <Input
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                className="input-mono"
              />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Replace environment"
              hint={`${server.envKeys.length ? server.envKeys.join(', ') : 'none stored'} — submit only to overwrite`}
            >
              <Textarea
                rows={3}
                value={form.env}
                onChange={(event) => setForm({ ...form, env: event.target.value })}
                placeholder="KEY=value"
                className="input-mono"
              />
            </Field>
            <Field
              label="Replace headers"
              hint={`${server.headerKeys.length ? server.headerKeys.join(', ') : 'none stored'} — encrypted at rest`}
            >
              <Textarea
                rows={3}
                value={form.headers}
                onChange={(event) => setForm({ ...form, headers: event.target.value })}
                placeholder="Authorization: Bearer …"
                className="input-mono"
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-5 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-[12px] text-slate-300">
              <Toggle
                checked={form.enabled}
                onChange={(next) => setForm({ ...form, enabled: next })}
                label="Enabled"
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-300">
              <Toggle
                checked={form.autoStart}
                onChange={(next) => setForm({ ...form, autoStart: next })}
                label="Auto start"
              />
              Connect on boot
            </label>
            <Button type="submit" variant="primary" loading={saving} className="ml-auto">
              Save configuration
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Configuration versions" subtitle="Every change is versioned with a diffable snapshot" flush>
        {versions.loading && !versions.data ? (
          <LoadingBlock />
        ) : (
          <div className="max-h-[520px] divide-y divide-line/60 overflow-y-auto">
            {(versions.data?.versions ?? []).map((version) => (
              <div key={version.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="info">v{version.version}</Badge>
                    <span className="truncate text-[12px] text-slate-300">{version.note || 'No note'}</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-slate-600">
                    {version.createdBy} · {timeAgo(version.createdAt)}
                  </div>
                  <div className="mono mt-1 truncate text-[10.5px] text-slate-500">
                    {version.config?.transport} · {version.config?.command || version.config?.url}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={diffLoading}
                    onClick={() => void showDiff(version.version)}
                    title="Compare with the current configuration"
                  >
                    <GitCompare size={11} /> Compare
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void restore(version.version)}>
                    <History size={11} /> Restore
                  </Button>
                </div>
              </div>
            ))}
            {versions.data?.versions?.length === 0 && <EmptyState title="No versions" />}
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(diff)}
        onClose={() => setDiff(null)}
        title={diff ? `v${diff.version} compared with the current configuration` : 'Configuration diff'}
        description={diff ? `${diff.note || 'No note'} · ${diff.createdBy} · ${formatDate(diff.createdAt)}` : undefined}
        width="max-w-2xl"
        footer={
          <Button variant="ghost" onClick={() => setDiff(null)}>
            Close
          </Button>
        }
      >
        {diff?.identical ? (
          <EmptyState title="No differences" description="This version matches the live configuration." />
        ) : (
          <div className="space-y-2">
            {(diff?.changes ?? []).map((change) => (
              <div key={change.field} className="rounded-md border border-line bg-surface-900 p-2.5">
                <div className="mono text-[11px] uppercase tracking-wide text-slate-500">{change.field}</div>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  <div className="rounded border border-err/25 bg-err/5 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-err/80">v{diff?.version}</div>
                    <pre className="mono mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-300">
                      {formatDiffValue(change.before)}
                    </pre>
                  </div>
                  <div className="rounded border border-ok/25 bg-ok/5 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-ok/80">current</div>
                    <pre className="mono mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-300">
                      {formatDiffValue(change.after)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

type ConfigDiff = {
  version: number;
  createdAt: string;
  createdBy: string;
  note: string;
  identical: boolean;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
};

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

/* --------------------------------- tools ---------------------------------- */

function ToolsTab({ server, tools, onChanged }: { server: ServerDto; tools: ToolDetail[]; onChanged: () => void }) {
  const { can } = useAuth();
  const { push } = useToast();
  return (
    <Panel title="Discovered tools" subtitle="Enablement and approval requirements are enforced on every call" flush>
      {tools.length === 0 ? (
        <EmptyState
          title="No tools discovered"
          description="Start the server; MCPNEXUS calls tools/list and stores the result."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Arguments</th>
                <th>Approval</th>
                <th>Enabled</th>
                <th className="text-right">Run</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => {
                const props = Object.keys(tool.inputSchema?.properties ?? {});
                const required: string[] = tool.inputSchema?.required ?? [];
                return (
                  <tr key={tool.id}>
                    <td>
                      <div className="font-medium text-slate-200">{tool.name}</div>
                      <div className="max-w-[420px] text-[11px] text-slate-500">{tool.description || '—'}</div>
                    </td>
                    <td className="mono text-[11px] text-slate-400">
                      {props.length === 0 ? 'none' : props.map((p) => (required.includes(p) ? `${p}*` : p)).join(', ')}
                    </td>
                    <td>
                      <Toggle
                        checked={tool.requiresApproval}
                        disabled={!can('server:manage')}
                        onChange={async (next) => {
                          try {
                            await api.patch(`/api/tools/${tool.id}`, { requiresApproval: next });
                            onChanged();
                            push('Approval policy updated', 'ok');
                          } catch (error) {
                            push(error instanceof ApiError ? error.message : 'Update failed', 'err');
                          }
                        }}
                      />
                    </td>
                    <td>
                      <Toggle
                        checked={tool.enabled}
                        disabled={!can('server:manage')}
                        onChange={async (next) => {
                          try {
                            await api.patch(`/api/tools/${tool.id}`, { enabled: next });
                            onChanged();
                            push('Tool state updated', 'ok');
                          } catch (error) {
                            push(error instanceof ApiError ? error.message : 'Update failed', 'err');
                          }
                        }}
                      />
                    </td>
                    <td className="text-right">
                      <Link to={`/tools?tool=${tool.id}`} className="btn btn-sm btn-ghost">
                        <Play size={11} /> Execute
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-line px-4 py-2.5 text-[11px] text-slate-500">
        Server: {server.name} · tool schemas are read live from the MCP server
      </div>
    </Panel>
  );
}

/* ------------------------------- resources -------------------------------- */

function ResourcesTab({ server, resources }: { server: ServerDto; resources: ResourceDto[] }) {
  const { push } = useToast();
  const [reading, setReading] = useState<ResourceDto | null>(null);
  const [content, setContent] = useState<{ text: string; mimeType: string | null; durationMs: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const notifications = useApi<{ notifications: Array<{ id: string; kind: string; payload: any; createdAt: string }> }>(
    '/api/notifications?limit=10',
    { pollMs: 15000 },
  );

  async function read(resource: ResourceDto) {
    setReading(resource);
    setContent(null);
    setLoading(true);
    try {
      const response = await api.post<{ contents: Array<{ uri: string; mimeType: string | null; text: string | null }>; durationMs: number }>(
        '/api/resources/read',
        { serverId: resource.serverId, uri: resource.uri },
      );
      const first = response.contents[0];
      setContent({
        text: first?.text ?? '(binary content has no text representation)',
        mimeType: first?.mimeType ?? resource.mimeType,
        durationMs: response.durationMs,
      });
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Read failed', 'err');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Resources and templates" subtitle={`${server.name} · resources/list and resources/templates/list`} flush>
        {resources.length === 0 ? (
          <EmptyState
            title="No resources"
            description="This server does not expose resources, or discovery has not run yet."
            icon={<FolderTree size={16} />}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>URI</th>
                <th>Type</th>
                <th className="text-right">Read</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id}>
                  <td>
                    <div className="mono break-all text-[11.5px] text-slate-200">{resource.uri}</div>
                    <div className="text-[11px] text-slate-500">
                      {resource.name} {resource.mimeType ? `· ${resource.mimeType}` : ''}
                    </div>
                  </td>
                  <td>
                    <Badge tone={resource.isTemplate ? 'violet' : 'muted'}>
                      {resource.isTemplate ? 'template' : 'static'}
                    </Badge>
                  </td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => void read(resource)}>
                      <BookOpen size={11} /> Read
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Update notifications" subtitle="resources/updated notifications from the server" flush>
        {(notifications.data?.notifications ?? []).length === 0 ? (
          <EmptyState title="No notifications" description="Servers that support subscriptions will appear here." />
        ) : (
          <div className="divide-y divide-line/60">
            {notifications.data!.notifications.map((notification) => (
              <div key={notification.id} className="px-4 py-2.5">
                <div className="mono text-[11.5px] text-slate-300">{notification.payload?.uri ?? notification.kind}</div>
                <div className="text-[10.5px] text-slate-600">
                  {notification.kind} · {timeAgo(notification.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.uri ?? 'Resource'}
        description={reading?.mimeType ?? undefined}
        width="max-w-3xl"
      >
        {loading ? (
          <LoadingBlock label="Calling resources/read" />
        ) : content ? (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="muted">{content.mimeType ?? 'unknown type'}</Badge>
              <Badge tone="info">{formatMs(content.durationMs)}</Badge>
            </div>
            <pre className="code-block max-h-[420px] whitespace-pre-wrap">{content.text}</pre>
          </div>
        ) : (
          <p className="text-[12.5px] text-slate-400">Select read to load this resource.</p>
        )}
      </Modal>
    </div>
  );
}

/* -------------------------------- prompts --------------------------------- */

function PromptsTab({ server, prompts }: { server: ServerDto; prompts: PromptDetail[] }) {
  const { push } = useToast();
  const [active, setActive] = useState<PromptDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Array<{ role: string; content: any }> | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview() {
    if (!active) return;
    setLoading(true);
    try {
      const response = await api.post<{ messages: Array<{ role: string; content: any }> }>('/api/prompts/preview', {
        serverId: server.id,
        name: active.name,
        arguments: values,
      });
      setMessages(response.messages);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Preview failed', 'err');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title="Server prompts" subtitle={`${server.name} · prompts/list`} flush>
      {prompts.length === 0 ? (
        <EmptyState
          title="No prompts"
          description="This server does not register prompts, or discovery has not completed."
          icon={<FileText size={16} />}
        />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Arguments</th>
              <th className="text-right">Preview</th>
            </tr>
          </thead>
          <tbody>
            {prompts.map((prompt) => (
              <tr key={prompt.id}>
                <td>
                  <div className="font-medium text-slate-200">{prompt.name}</div>
                  <div className="max-w-[420px] text-[11px] text-slate-500">{prompt.description}</div>
                </td>
                <td className="mono text-[11px] text-slate-400">
                  {prompt.arguments.length
                    ? prompt.arguments.map((arg) => (arg.required ? `${arg.name}*` : arg.name)).join(', ')
                    : 'none'}
                </td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActive(prompt);
                      setValues({});
                      setMessages(null);
                    }}
                  >
                    <ClipboardList size={11} /> Build
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active ? `Prompt · ${active.name}` : ''}
        description={active?.description}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setActive(null)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => void preview()} loading={loading}>
              Generate messages
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(active?.arguments ?? []).map((arg) => (
            <Field key={arg.name} label={`${arg.name}${arg.required ? ' *' : ''}`} hint={arg.description}>
              <Textarea
                rows={arg.name.match(/text|code|content/i) ? 4 : 2}
                value={values[arg.name] ?? ''}
                onChange={(event) => setValues({ ...values, [arg.name]: event.target.value })}
              />
            </Field>
          ))}
          {(active?.arguments ?? []).length === 0 && (
            <p className="text-[12px] text-slate-500">This prompt takes no arguments.</p>
          )}
          {messages && (
            <div>
              <div className="mb-1.5 section-title">Generated messages</div>
              <JsonBlock value={messages} maxHeight={320} />
            </div>
          )}
        </div>
      </Modal>
    </Panel>
  );
}

/* ---------------------------------- logs ---------------------------------- */

function LogsTab({ serverId }: { serverId: string }) {
  const [level, setLevel] = useState('all');
  const logs = useApi<{ logs: Array<{ id: string; level: string; message: string; createdAt: string }> }>(
    `/api/servers/${serverId}/logs?limit=300`,
    { pollMs: 5000 },
  );
  const entries = (logs.data?.logs ?? []).filter((entry) => level === 'all' || entry.level === level);
  return (
    <Panel
      title="Server logs"
      subtitle="Captured stderr, protocol errors and lifecycle events"
      flush
      actions={
        <div className="flex items-center gap-1.5">
          <Select value={level} onChange={(event) => setLevel(event.target.value)} className="h-7 w-[130px] py-0 text-[11.5px]">
            <option value="all">All levels</option>
            <option value="info">info</option>
            <option value="stderr">stderr</option>
            <option value="error">error</option>
            <option value="notification">notification</option>
          </Select>
          <Button size="sm" variant="ghost" onClick={logs.reload}>
            <RefreshCw size={11} />
          </Button>
        </div>
      }
    >
      {entries.length === 0 ? (
        <EmptyState title="No log entries" description="Start the server to capture process output." />
      ) : (
        <div className="max-h-[480px] overflow-y-auto bg-surface-950 p-3 font-mono text-[11.5px] leading-relaxed">
          {entries.map((entry) => (
            <div key={entry.id} className="flex gap-2 border-b border-line/40 py-1 last:border-0">
              <span className="shrink-0 text-slate-600">{new Date(entry.createdAt).toLocaleTimeString()}</span>
              <span
                className={`w-16 shrink-0 uppercase ${
                  entry.level === 'error'
                    ? 'text-err'
                    : entry.level === 'stderr'
                      ? 'text-warn'
                      : entry.level === 'notification'
                        ? 'text-violet'
                        : 'text-slate-500'
                }`}
              >
                {entry.level}
              </span>
              <span className="whitespace-pre-wrap break-all text-slate-300">{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------- analytics ------------------------------- */

function AnalyticsTab({ serverId }: { serverId: string }) {
  const analytics = useApi<{
    totals: { calls24h: number; failed24h: number; avgLatencyMs: number | null; allTime: number };
    buckets: Array<{ bucket: string; total: number; failed: number }>;
    tools: Array<{ name: string; calls: number; failures: number; avg_ms: number | null }>;
    recent: Array<{ id: string; tool_name: string; status: string; duration_ms: number; created_at: string }>;
    health: Array<{ status: string; latencyMs: number; checkedAt: string }>;
  }>(`/api/servers/${serverId}/analytics`, { pollMs: 20000 });

  if (analytics.loading && !analytics.data) return <LoadingBlock />;
  if (analytics.error) return <ErrorState error={analytics.error} onRetry={analytics.reload} />;
  const data = analytics.data!;
  const max = Math.max(1, ...data.buckets.map((bucket) => bucket.total));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Calls · 24h', String(data.totals.calls24h)],
          ['Failures · 24h', String(data.totals.failed24h)],
          ['Avg latency', formatMs(data.totals.avgLatencyMs)],
          ['All-time calls', String(data.totals.allTime)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <div className="stat-label">{label}</div>
            <div className="stat-value mt-2">{value}</div>
          </div>
        ))}
      </div>
      <Panel title="Volume" subtitle="Hourly calls in the last 24 hours">
        {data.buckets.length === 0 ? (
          <EmptyState title="No traffic yet" />
        ) : (
          <div className="flex h-32 items-end gap-1">
            {data.buckets.map((bucket) => (
              <div key={bucket.bucket} className="flex-1" title={`${bucket.bucket}:00 · ${bucket.total} calls`}>
                <div className="relative w-full rounded-sm bg-accent/70" style={{ height: `${(bucket.total / max) * 100}%`, minHeight: bucket.total ? 3 : 0 }}>
                  <div
                    className="absolute top-0 w-full bg-err/80"
                    style={{ height: bucket.total ? `${(bucket.failed / bucket.total) * 100}%` : 0 }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Per-tool performance" flush>
          {data.tools.length === 0 ? (
            <EmptyState title="No tool calls" />
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
                {data.tools.map((tool) => (
                  <tr key={tool.name}>
                    <td className="font-medium text-slate-200">{tool.name}</td>
                    <td className="text-right mono">{tool.calls}</td>
                    <td className={`text-right mono ${tool.failures ? 'text-err' : 'text-slate-500'}`}>{tool.failures}</td>
                    <td className="text-right mono">{formatMs(tool.avg_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Recent executions" flush>
          {data.recent.length === 0 ? (
            <EmptyState title="No executions" />
          ) : (
            <div className="max-h-[320px] divide-y divide-line/60 overflow-y-auto">
              {data.recent.map((execution) => (
                <div key={execution.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-slate-200">{execution.tool_name}</div>
                    <div className="text-[10.5px] text-slate-600">{timeAgo(execution.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] text-slate-400">{formatMs(execution.duration_ms)}</span>
                    <StatusBadge status={execution.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------- permissions ------------------------------ */

function PermissionsTab({ serverId }: { serverId: string }) {
  const permissions = useApi<{
    canExecute: boolean;
    tags: string[];
    tools: Array<{ name: string; requiresApproval: boolean; decision: { allowed: boolean; requiresApproval: boolean; reason?: string } }>;
    policies: Array<any>;
  }>(`/api/servers/${serverId}/permissions`);

  if (permissions.loading && !permissions.data) return <LoadingBlock />;
  if (permissions.error) return <ErrorState error={permissions.error} onRetry={permissions.reload} />;
  const data = permissions.data!;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
      <Panel
        title="Effective tool permissions"
        subtitle="Policy evaluation for your role on this server"
        actions={<Badge tone={data.canExecute ? 'ok' : 'err'}>{data.canExecute ? 'tool:execute granted' : 'execute denied'}</Badge>}
        flush
      >
        <table className="table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Decision</th>
              <th>Approval</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.tools.map((tool) => (
              <tr key={tool.name}>
                <td className="font-medium text-slate-200">{tool.name}</td>
                <td>
                  <Badge tone={tool.decision.allowed ? 'ok' : 'err'}>
                    {tool.decision.allowed ? 'allowed' : 'denied'}
                  </Badge>
                </td>
                <td className="text-[11.5px] text-slate-400">
                  {tool.requiresApproval || tool.decision.requiresApproval ? 'required' : 'not required'}
                </td>
                <td className="text-[11px] text-slate-500">{tool.decision.reason ?? '—'}</td>
              </tr>
            ))}
            {data.tools.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="No tools discovered" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
      <Panel title="Applicable policies" subtitle="Global, server and tag scoped rules" flush>
        <div className="divide-y divide-line/60">
          {data.policies.map((policy) => (
            <div key={policy.id} className="px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Badge tone={policy.effect === 'deny' ? 'err' : 'ok'}>{policy.effect}</Badge>
                <span className="mono text-[11px] text-slate-300">{policy.permission}</span>
                <span className="text-[10.5px] text-slate-500">· {policy.scope}:{policy.subject}</span>
              </div>
              {policy.note && <div className="mt-1 text-[11px] text-slate-500">{policy.note}</div>}
            </div>
          ))}
          {data.policies.length === 0 && <EmptyState title="No policies apply" />}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------- diagnostics ------------------------------ */

function DiagnosticsTab({ serverId }: { serverId: string }) {
  const report = useApi<{
    report: {
      score: number;
      items: Array<{ id: string; severity: string; title: string; detail: string; suggestion?: string }>;
      checkedAt: string;
    };
  }>(`/api/servers/${serverId}/diagnostics`);

  if (report.loading && !report.data) return <LoadingBlock label="Running diagnostics" />;
  if (report.error) return <ErrorState error={report.error} onRetry={report.reload} />;
  const data = report.data!.report;

  return (
    <div className="space-y-3">
      <Panel
        title="Diagnostic report"
        subtitle={`Checked ${timeAgo(data.checkedAt)} · ${data.items.length} signals`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={data.score >= 85 ? 'ok' : data.score >= 60 ? 'warn' : 'err'}>score {data.score}</Badge>
            <Button size="sm" onClick={report.reload}>
              <Stethoscope size={11} /> Re-run
            </Button>
          </div>
        }
        flush
      >
        <div className="divide-y divide-line/60">
          {data.items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5">
                {item.severity === 'ok' ? (
                  <CheckCircle2 size={14} className="text-ok" />
                ) : item.severity === 'warn' ? (
                  <AlertTriangle size={14} className="text-warn" />
                ) : item.severity === 'error' ? (
                  <AlertTriangle size={14} className="text-err" />
                ) : (
                  <Activity size={14} className="text-slate-500" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-slate-200">{item.title}</div>
                <div className="text-[11.5px] text-slate-500">{item.detail}</div>
                {item.suggestion && (
                  <div className="mt-1 text-[11px] text-accent-soft/90">→ {item.suggestion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ compatibility ----------------------------- */

function CompatibilityTab({ serverId }: { serverId: string }) {
  const compat = useApi<{
    report: {
      score: number;
      server: { transport: string; connected: boolean; serverInfo: any; capabilities: any };
      platform: { sdkVersion: string; clientCapabilities: Record<string, boolean>; transports: string[] };
      featureMatrix: Array<{ feature: string; supportedByServer: boolean; supportedByClient: boolean; note: string }>;
      tools: Array<{ name: string; valid: boolean; issues: string[]; properties: number; required: string[] }>;
      issues: Array<{ severity: string; area: string; message: string; fix?: string }>;
      counts: Record<string, number>;
    };
  }>(`/api/servers/${serverId}/compatibility`);

  if (compat.loading && !compat.data) return <LoadingBlock label="Inspecting compatibility" />;
  if (compat.error) return <ErrorState error={compat.error} onRetry={compat.reload} />;
  const report = compat.data!.report;

  return (
    <div className="space-y-3">
      <Panel
        title="Protocol compatibility"
        subtitle={`MCP SDK ${report.platform.sdkVersion} · client capabilities are advertised during initialize`}
        actions={<Badge tone={report.score >= 90 ? 'ok' : report.score >= 70 ? 'warn' : 'err'}>score {report.score}</Badge>}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {report.featureMatrix.map((feature) => (
            <div key={feature.feature} className="rounded-lg border border-line bg-surface-900 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="mono text-[11.5px] text-slate-200">{feature.feature}</span>
                <Badge tone={feature.supportedByServer ? 'ok' : 'muted'}>
                  {feature.supportedByServer ? 'negotiated' : 'absent'}
                </Badge>
              </div>
              <div className="mt-1 text-[10.5px] text-slate-500">{feature.note}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Schema validation" subtitle="Every discovered tool is checked against MCP expectations" flush>
          <table className="table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Valid</th>
                <th>Props</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {report.tools.map((tool) => (
                <tr key={tool.name}>
                  <td className="font-medium text-slate-200">{tool.name}</td>
                  <td>
                    <Badge tone={tool.valid ? 'ok' : 'warn'}>{tool.valid ? 'valid' : 'issues'}</Badge>
                  </td>
                  <td className="mono">{tool.properties}</td>
                  <td className="text-[11px] text-slate-500">{tool.issues.join('; ') || '—'}</td>
                </tr>
              ))}
              {report.tools.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState title="No tools to validate" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <Panel title="Findings" subtitle="Actionable compatibility diagnostics" flush>
          <div className="divide-y divide-line/60">
            {report.issues.map((issue, index) => (
              <div key={index} className="flex items-start gap-2.5 px-4 py-2.5">
                <Code2 size={13} className={issue.severity === 'error' ? 'mt-0.5 text-err' : 'mt-0.5 text-slate-500'} />
                <div>
                  <div className="text-[12px] text-slate-300">
                    <span className="mono text-[10.5px] text-slate-500">{issue.area}</span> · {issue.message}
                  </div>
                  {issue.fix && <div className="text-[11px] text-accent-soft/80">→ {issue.fix}</div>}
                </div>
              </div>
            ))}
            {report.issues.length === 0 && <EmptyState title="No compatibility issues" />}
          </div>
        </Panel>
      </div>

      <Panel title="Counts" subtitle="Primitives discovered from this server">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Object.entries(report.counts).map(([key, value]) => (
            <div key={key}>
              <div className="text-[10.5px] uppercase tracking-wider text-slate-600">{key}</div>
              <div className="mono mt-0.5 text-[15px] text-slate-200">{value}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

void KeyRound;
void ShieldCheck;
void Wrench;
