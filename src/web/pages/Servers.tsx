import { ArrowUpRight, Download, Play, Plus, RotateCw, Search, Square, Upload } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Panel,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui.js';
import { useAuth } from '../App.js';
import { api, ApiError, type ServerDto } from '../lib/api.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

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

type ImportResult = {
  ok: boolean;
  dryRun: boolean;
  conflict: string;
  summary: { created: number; overwritten: number; skipped: number; invalid: number };
  results: Array<{ index: number; name: string; slug?: string; action: string; errors?: string[]; reason?: string }>;
};

export function ServersPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const { data, error, loading, reload } = useApi<{ servers: ServerDto[] }>('/api/servers', {
    pollMs: 15000,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
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

  async function createServer(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/servers', {
        ...form,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      push('Server registered', 'ok');
      setModalOpen(false);
      setForm(emptyForm);
      reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Registration failed', 'err');
    } finally {
      setSubmitting(false);
    }
  }

  async function exportBundle(only?: ServerDto) {
    try {
      await api.download(
        only ? `/api/servers/${only.id}/export` : '/api/servers/export',
        only ? `nexus-${only.slug}.json` : 'nexus-servers.json',
      );
      push(only ? 'Server configuration exported' : 'All server configurations exported', 'ok');
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
      if (dryRun) {
        push('Validation complete — review the plan before importing', 'ok');
      } else {
        push(
          `Import complete · ${result.summary.created} created, ${result.summary.overwritten} overwritten, ${result.summary.skipped} skipped, ${result.summary.invalid} invalid`,
          result.summary.invalid ? 'err' : 'ok',
        );
        reload();
      }
    } catch (error) {
      push(
        error instanceof ApiError ? error.message : error instanceof SyntaxError ? 'That is not valid JSON' : 'Import failed',
        'err',
      );
    } finally {
      setImporting(false);
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

  return (
    <div className="fade-in">
      <PageHeader
        title="MCP Servers"
        subtitle="Register STDIO processes or Streamable HTTP endpoints, then start them to perform a real MCP handshake and discovery."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void exportBundle()} title="Export every server configuration as JSON">
              <Download size={13} /> Export
            </Button>
            {can('server:manage') && (
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
                <Upload size={13} /> Import
              </Button>
            )}
            {can('server:manage') && (
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                <Plus size={13} /> Register server
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search servers"
            className="w-[240px] pl-8"
          />
        </div>
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-[160px]">
          <option value="all">All states</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
          <option value="error">Error</option>
        </Select>
        <span className="ml-auto text-[11px] text-slate-500">
          {filtered.length} of {servers.length} servers
        </span>
      </div>

      {loading && !data && <LoadingBlock />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <Panel flush>
          {filtered.length === 0 ? (
            <EmptyState
              title="No servers match"
              description="Adjust the filters or register a new MCP server."
              action={
                can('server:manage') ? (
                  <Button size="sm" onClick={() => setModalOpen(true)}>
                    <Plus size={12} /> Register server
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Server</th>
                    <th>Transport</th>
                    <th>Status</th>
                    <th className="text-right">Tools</th>
                    <th className="text-right">Resources</th>
                    <th>Last connected</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((server) => (
                    <tr key={server.id}>
                      <td>
                        <Link to={`/servers/${server.id}`} className="group block">
                          <div className="flex items-center gap-1.5 font-medium text-slate-100 group-hover:text-white">
                            {server.name}
                            <ArrowUpRight size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
                          </div>
                          <div className="mono mt-0.5 text-[10.5px] text-slate-500">{server.slug}</div>
                        </Link>
                      </td>
                      <td>
                        <Badge tone={server.transport === 'http' ? 'violet' : 'muted'}>
                          {server.transport.toUpperCase()}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={server.status} />
                          {server.lastError && (
                            <span className="max-w-[220px] truncate text-[10px] text-err/80" title={server.lastError}>
                              {server.lastError}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right mono text-slate-300">{server.counts.tools}</td>
                      <td className="text-right mono text-slate-300">{server.counts.resources}</td>
                      <td className="text-[11px] text-slate-500" title={formatDate(server.lastConnectedAt)}>
                        {timeAgo(server.lastConnectedAt)}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {server.connected ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busyId === server.id}
                                onClick={() => void control(server, 'restart')}
                                title="Restart"
                              >
                                <RotateCw size={12} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busyId === server.id}
                                onClick={() => void control(server, 'stop')}
                                title="Stop"
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
                              title="Start"
                            >
                              <Play size={12} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void exportBundle(server)}
                            title="Export this configuration"
                          >
                            <Download size={12} />
                          </Button>
                          <Link to={`/servers/${server.id}`} className="btn btn-sm btn-ghost">
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

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
            <Button variant="primary" onClick={() => void runImport(false)} loading={importing} disabled={!importResult}>
              Import {importResult ? `${importResult.summary.created + importResult.summary.overwritten} server(s)` : ''}
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
          <Field label="When a slug already exists" hint="Overwrite replaces the stored configuration and stops the server; rename keeps both.">
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
                    <span className="mono text-slate-300">
                      {entry.name} {entry.slug && entry.slug !== entry.name ? `(${entry.slug})` : ''}
                    </span>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Register MCP server"
        description="STDIO servers are spawned as child processes; HTTP servers use the Streamable HTTP transport."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={createServer} loading={submitting}>
              Register server
            </Button>
          </>
        }
      >
        <form onSubmit={createServer} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="My MCP server"
                required
              />
            </Field>
            <Field label="Transport">
              <Select
                value={form.transport}
                onChange={(event) =>
                  setForm({ ...form, transport: event.target.value as 'stdio' | 'http' })
                }
              >
                <option value="stdio">STDIO · child process</option>
                <option value="http">Streamable HTTP</option>
              </Select>
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
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Command" hint="Executable on PATH, or an absolute path.">
                  <Input
                    value={form.command}
                    onChange={(event) => setForm({ ...form, command: event.target.value })}
                    placeholder="node"
                    className="input-mono"
                    required
                  />
                </Field>
                <Field label="Arguments" hint="One argument per line.">
                  <Textarea
                    rows={3}
                    value={form.args}
                    onChange={(event) => setForm({ ...form, args: event.target.value })}
                    placeholder={'mcp-servers/toolbox.mjs'}
                    className="input-mono"
                  />
                </Field>
              </div>
            </>
          ) : (
            <Field label="Endpoint URL" hint="Absolute http(s) URL speaking Streamable HTTP.">
              <Input
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder="https://example.com/mcp"
                className="input-mono"
                required
              />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Environment variables" hint="KEY=value per line. Stored encrypted; values never leave the server.">
              <Textarea
                rows={3}
                value={form.env}
                onChange={(event) => setForm({ ...form, env: event.target.value })}
                placeholder="API_KEY=…"
                className="input-mono"
              />
            </Field>
            <Field label="HTTP headers" hint="Header: value per line. Encrypted at rest.">
              <Textarea
                rows={3}
                value={form.headers}
                onChange={(event) => setForm({ ...form, headers: event.target.value })}
                placeholder="Authorization: Bearer …"
                className="input-mono"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tags" hint="Comma separated — policies can target tags.">
              <Input
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="production, search"
              />
            </Field>
            <Field label="Start automatically">
              <Select
                value={form.autoStart ? 'yes' : 'no'}
                onChange={(event) => setForm({ ...form, autoStart: event.target.value === 'yes' })}
              >
                <option value="yes">Connect on boot</option>
                <option value="no">Leave stopped</option>
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
