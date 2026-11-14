import {
  ArrowUpRight,
  Download,
  FolderTree,
  MessageSquareCode,
  Plus,
  Play,
  RotateCw,
  Search,
  Server as ServerIcon,
  Square,
  Upload,
  Wrench,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.js';
import { PageHeader } from '../components/Layout.js';
import { ActionMenu, SegmentedControl } from '../components/interactions.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type ServerDto } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type ImportResult = {
  ok: boolean;
  dryRun: boolean;
  conflict: string;
  summary: { created: number; overwritten: number; skipped: number; invalid: number };
  results: Array<{ index: number; name: string; slug?: string; action: string; errors?: string[]; reason?: string }>;
};

const emptyForm = {
  name: '',
  description: '',
  transport: 'stdio' as 'stdio' | 'http',
  command: '',
  args: '',
  url: '',
  env: '',
  headers: '',
  tags: '',
  autoStart: true,
};

export function ServersPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { push } = useToast();
  const { data, error, loading, reload } = useApi<{ servers: ServerDto[] }>('/api/servers', { pollMs: 15000 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped' | 'error'>('all');
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importConflict, setImportConflict] = useState<'skip' | 'overwrite' | 'rename'>('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const servers = data?.servers ?? [];
  const filtered = useMemo(
    () =>
      servers.filter((server) => {
        const matchesSearch =
          !search ||
          `${server.name} ${server.slug} ${server.description} ${server.tags.join(' ')}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || server.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [servers, search, statusFilter],
  );

  function closeWizard() {
    setStep(0);
    setForm(emptyForm);
  }

  async function createServer(event?: React.FormEvent) {
    event?.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/servers', {
        ...form,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      push(form.autoStart ? 'Server registered — connecting' : 'Server registered', 'ok');
      closeWizard();
      reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Registration failed', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  async function control(server: ServerDto, action: 'start' | 'stop' | 'restart') {
    setBusyId(server.id);
    try {
      await api.post(`/api/servers/${server.id}/${action}`);
      push(`${server.name}: ${action} complete`, 'ok');
      reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : `${action} failed`, 'err');
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function exportBundle(only?: ServerDto) {
    try {
      await api.download(
        only ? `/api/servers/${only.id}/export` : '/api/servers/export',
        only ? `nexus-${only.slug}.json` : 'nexus-servers.json',
      );
      push(only ? 'Server configuration exported' : 'All configurations exported', 'ok');
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Export failed', 'err');
    }
  }

  async function runImport(dryRun: boolean) {
    setImporting(true);
    try {
      const parsed = JSON.parse(importText);
      const result = await api.post<ImportResult>('/api/servers/import', {
        ...parsed,
        conflict: importConflict,
        dryRun,
      });
      setImportResult(result);
      if (dryRun) push('Validation complete — review the plan', 'ok');
      else {
        push(`Imported · ${result.summary.created} created, ${result.summary.invalid} invalid`, result.summary.invalid ? 'err' : 'ok');
        reload();
      }
    } catch (error) {
      push(
        error instanceof ApiError
          ? error.message
          : error instanceof SyntaxError
            ? 'That is not valid JSON'
            : 'Import failed',
        'err',
      );
    } finally {
      setImporting(false);
    }
  }

  const canManage = can('server:manage');

  return (
    <div>
      <PageHeader
        eyebrow="Infrastructure"
        title="MCP Servers"
        subtitle="Register STDIO processes or Streamable HTTP endpoints. Starting a server performs a real MCP handshake and discovers its primitives."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void exportBundle()}>
              <Download size={13} /> Export
            </Button>
            {canManage && (
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
                <Upload size={13} /> Import
              </Button>
            )}
            {canManage && (
              <Button variant="primary" onClick={() => setStep(1)}>
                <Plus size={13} /> Register server
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          label="Server status"
          options={[
            { value: 'all', label: 'All', count: servers.length },
            { value: 'running', label: 'Running', count: servers.filter((s) => s.status === 'running').length },
            { value: 'stopped', label: 'Stopped', count: servers.filter((s) => s.status === 'stopped').length },
            { value: 'error', label: 'Failed', count: servers.filter((s) => s.status === 'error').length },
          ]}
        />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search servers"
            className="w-[240px] pl-8"
            aria-label="Search servers"
          />
        </div>
        <span className="ml-auto text-[11px] text-slate-500">
          {filtered.length} of {servers.length} servers
        </span>
      </div>

      {loading && !data && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-[168px]" />
          ))}
        </div>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && filtered.length === 0 && (
        <div className="rounded-xl border border-line bg-surface-850/60">
          <EmptyState
            icon={<ServerIcon size={16} />}
            title="No servers match"
            description="Adjust the filters, or register a new MCP server to begin discovery."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setStep(1)}>
                  <Plus size={12} /> Register server
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((server) => (
            <article
              key={server.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface-850/70 p-4 transition-colors duration-200 hover:border-line-strong"
            >
              <div
                className={`absolute inset-x-0 top-0 h-[2px] ${
                  server.status === 'running'
                    ? 'bg-gradient-to-r from-ok/70 to-transparent'
                    : server.status === 'error'
                      ? 'bg-gradient-to-r from-err/70 to-transparent'
                      : 'bg-line'
                }`}
                aria-hidden
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/servers/${server.id}`}
                    className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-100 transition-colors hover:text-white"
                  >
                    <span className="truncate">{server.name}</span>
                    <ArrowUpRight size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                  </Link>
                  <div className="mono mt-0.5 truncate text-[10px] text-slate-500">{server.slug}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={server.transport === 'http' ? 'violet' : 'muted'}>
                    {server.transport.toUpperCase()}
                  </Badge>
                  <StatusBadge status={server.status} />
                </div>
              </div>

              <p className="mt-2.5 line-clamp-2 min-h-[30px] text-[11.5px] leading-relaxed text-slate-400">
                {server.description || 'No description provided.'}
              </p>

              {server.lastError && (
                <div className="mt-2 rounded-md border border-err/25 bg-err/5 px-2 py-1.5 text-[10.5px] leading-relaxed text-err/90">
                  {server.lastError.slice(0, 140)}
                </div>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-[11px]">
                {[
                  { icon: Wrench, value: server.counts.tools, label: 'tools' },
                  { icon: FolderTree, value: server.counts.resources, label: 'resources' },
                  { icon: MessageSquareCode, value: server.counts.prompts, label: 'prompts' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5 text-slate-400">
                    <item.icon size={11} className="text-slate-600" />
                    <span className="mono text-slate-300">{item.value}</span>
                    <span className="text-[10px] text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-slate-600">
                  {server.lastConnectedAt ? `connected ${timeAgo(server.lastConnectedAt)}` : 'never connected'}
                </span>
                <div className="flex items-center gap-1">
                  {canManage &&
                    (server.connected ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busyId === server.id}
                          onClick={() => void control(server, 'restart')}
                          title="Restart server"
                        >
                          <RotateCw size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busyId === server.id}
                          onClick={() => void control(server, 'stop')}
                          title="Stop server"
                        >
                          <Square size={12} />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busyId === server.id}
                        onClick={() => void control(server, 'start')}
                        title="Start server"
                      >
                        <Play size={12} /> Start
                      </Button>
                    ))}
                  <ActionMenu
                    label={`${server.name} actions`}
                    items={[
                      { label: 'Open workspace', onSelect: () => navigate(`/servers/${server.id}`) },
                      { label: 'Export configuration', onSelect: () => void exportBundle(server) },
                    ]}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ---------------------------- import ---------------------------- */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportResult(null);
        }}
        title="Import server configurations"
        description="Paste a MCPNEXUS export bundle. Exports never contain secret values — re-enter credentials after importing."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void runImport(true)} loading={importing}>
              Validate
            </Button>
            <Button
              variant="primary"
              onClick={() => void runImport(false)}
              loading={importing}
              disabled={!importResult}
            >
              Apply import
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Bundle JSON">
            <Textarea
              rows={8}
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportResult(null);
              }}
              placeholder='{ "schema": "mcpnexus.server-export", "version": 1, "servers": [ … ] }'
              className="input-mono"
            />
          </Field>
          <Field label="When a slug already exists">
            <Select
              value={importConflict}
              onChange={(event) => setImportConflict(event.target.value as 'skip' | 'overwrite' | 'rename')}
            >
              <option value="skip">Skip existing</option>
              <option value="rename">Import as a new slug</option>
              <option value="overwrite">Overwrite existing</option>
            </Select>
          </Field>
          {importResult && (
            <div className="rounded-md border border-line bg-surface-900 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Badge tone="ok">{importResult.summary.created} create</Badge>
                <Badge tone="info">{importResult.summary.overwritten} overwrite</Badge>
                <Badge tone="muted">{importResult.summary.skipped} skip</Badge>
                <Badge tone={importResult.summary.invalid ? 'err' : 'muted'}>
                  {importResult.summary.invalid} invalid
                </Badge>
                <span className="text-slate-500">{importResult.dryRun ? 'validation only' : 'applied'}</span>
              </div>
              <div className="mt-2 space-y-1">
                {importResult.results.map((entry) => (
                  <div key={entry.index} className="flex items-start justify-between gap-3 text-[11px]">
                    <span className="mono truncate text-slate-300">{entry.name}</span>
                    <span className={entry.action === 'invalid' ? 'text-err' : 'text-slate-500'}>
                      {entry.errors?.length ? entry.errors.join(' · ') : entry.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* -------------------------- connect wizard ----------------------- */}
      <Modal
        open={step > 0}
        onClose={closeWizard}
        title={step === 1 ? 'Connect a server — transport' : 'Connection details'}
        description={
          step === 1
            ? 'STDIO servers run as child processes. Streamable HTTP servers are remote endpoints speaking MCP over HTTP.'
            : 'Credentials are encrypted at rest and never returned by the API.'
        }
        width="max-w-2xl"
        footer={
          step === 1 ? (
            <Button variant="ghost" onClick={closeWizard}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => void createServer()} loading={submitting}>
                Register &amp; {form.autoStart ? 'connect' : 'save'}
              </Button>
            </>
          )
        }
      >
        {step === 1 ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              {
                value: 'stdio' as const,
                title: 'STDIO process',
                copy: 'Spawn a local MCP server with a command and arguments (node, uvx, docker…).',
                meta: 'local · child process',
              },
              {
                value: 'http' as const,
                title: 'Streamable HTTP',
                copy: 'Connect to a remote MCP endpoint over HTTP with optional bearer headers.',
                meta: 'remote · /mcp',
              },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setForm({ ...form, transport: option.value });
                  setStep(2);
                }}
                className="group rounded-xl border border-line bg-surface-900 p-4 text-left transition-colors hover:border-accent/40 hover:bg-surface-850"
              >
                <div className="flex items-center justify-between">
                  <ServerIcon size={16} className="text-accent-soft" />
                  <Badge tone={option.value === 'http' ? 'violet' : 'muted'}>{option.meta}</Badge>
                </div>
                <div className="mt-3 text-[13px] font-semibold text-slate-100">{option.title}</div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{option.copy}</p>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={createServer} className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="My MCP server"
                  required
                  autoFocus
                />
              </Field>
              <Field label="Tags" hint="Comma separated — policies can target tags.">
                <Input
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  placeholder="production, search"
                />
              </Field>
            </div>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What does this server expose?"
              />
            </Field>

            {form.transport === 'stdio' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Command" hint="Executable on PATH or an absolute path.">
                  <Input
                    value={form.command}
                    onChange={(event) => setForm({ ...form, command: event.target.value })}
                    placeholder="node"
                    className="mono"
                    required
                  />
                </Field>
                <Field label="Arguments" hint="One argument per line.">
                  <Textarea
                    rows={3}
                    value={form.args}
                    onChange={(event) => setForm({ ...form, args: event.target.value })}
                    placeholder={'mcp-servers/toolbox.mjs'}
                    className="mono"
                  />
                </Field>
              </div>
            ) : (
              <Field label="Endpoint URL" hint="Absolute http(s) URL speaking Streamable HTTP.">
                <Input
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                  placeholder="https://example.com/mcp"
                  className="mono"
                  required
                />
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Environment" hint="KEY=value per line. Encrypted at rest.">
                <Textarea
                  rows={3}
                  value={form.env}
                  onChange={(event) => setForm({ ...form, env: event.target.value })}
                  placeholder="API_KEY=…"
                  className="mono"
                />
              </Field>
              <Field label="HTTP headers" hint="Header: value per line. Encrypted at rest.">
                <Textarea
                  rows={3}
                  value={form.headers}
                  onChange={(event) => setForm({ ...form, headers: event.target.value })}
                  placeholder="Authorization: Bearer …"
                  className="mono"
                />
              </Field>
            </div>

            <Field label="On save">
              <Select
                value={form.autoStart ? 'connect' : 'save'}
                onChange={(event) => setForm({ ...form, autoStart: event.target.value === 'connect' })}
              >
                <option value="connect">Connect immediately (runs handshake + discovery)</option>
                <option value="save">Save only — start it later</option>
              </Select>
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
}
