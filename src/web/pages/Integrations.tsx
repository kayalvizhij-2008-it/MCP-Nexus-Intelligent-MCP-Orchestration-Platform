import { Blocks, ExternalLink, Play, Plug, Settings2, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
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
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui.js';
import { api, ApiError } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type IntegrationField = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
  placeholder?: string;
  help?: string;
};

type Integration = {
  key: string;
  name: string;
  category: string;
  description: string;
  fields: IntegrationField[];
  capabilities: string[];
  docs?: string;
  enabled: boolean;
  status: string;
  config: Record<string, string>;
  lastCheckedAt: string | null;
  lastError: string | null;
};

export function IntegrationsPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const integrations = useApi<{ integrations: Integration[] }>('/api/integrations', { pollMs: 30000 });
  const [configuring, setConfiguring] = useState<Integration | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ name: string; ok: boolean; message: string; details?: unknown } | null>(null);
  const [actionResult, setActionResult] = useState<{ title: string; body: unknown; ok: boolean } | null>(null);
  const [querySql, setQuerySql] = useState('select name, role from users');
  const [docPath, setDocPath] = useState('README.md');

  function openConfig(integration: Integration) {
    setConfiguring(integration);
    setForm(integration.config ?? {});
  }

  async function save() {
    if (!configuring) return;
    setSaving(true);
    try {
      await api.put(`/api/integrations/${configuring.key}`, { config: form });
      push('Configuration saved', 'ok');
      setConfiguring(null);
      integrations.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function test(integration: Integration) {
    setTesting(integration.key);
    setTestResult(null);
    try {
      const response = await api.post<{ ok: boolean; message: string; details?: unknown }>(
        `/api/integrations/${integration.key}/test`,
      );
      setTestResult({ name: integration.name, ...response });
      push(`${integration.name}: ${response.ok ? 'connected' : 'failed'}`, response.ok ? 'ok' : 'err');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Test failed';
      setTestResult({ name: integration.name, ok: false, message });
      push(message, 'err');
    } finally {
      setTesting(null);
      integrations.reload();
    }
  }

  async function action(integration: Integration, name: string, body: Record<string, unknown>) {
    try {
      const response = await api.post<Record<string, unknown>>(`/api/integrations/${integration.key}/action`, {
        action: name,
        ...body,
      });
      setActionResult({ title: `${integration.name} · ${name}`, body: response, ok: response.ok !== false });
      integrations.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Action failed', 'err');
    }
  }

  if (integrations.loading && !integrations.data) return <LoadingBlock label="Loading integrations" />;
  if (integrations.error) return <ErrorState error={integrations.error} onRetry={integrations.reload} />;

  const rows = integrations.data?.integrations ?? [];

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Ecosystem"
        title="Integration Hub"
        subtitle="External systems are only marked connected after a real credential check. Unconfigured providers stay disconnected."
        actions={
          <Badge tone="muted">
            <Plug size={11} /> {rows.filter((row) => row.status === 'connected').length} connected / {rows.length}
          </Badge>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((integration) => (
          <div key={integration.key} className="panel flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13px] font-medium text-slate-100">{integration.name}</div>
                <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-slate-500">
                  {integration.category}
                </div>
              </div>
              <StatusBadge
                status={integration.status}
                label={
                  integration.status === 'available'
                    ? 'available'
                    : integration.status === 'connected'
                      ? 'connected'
                      : integration.status === 'error'
                        ? 'error'
                        : 'disconnected'
                }
              />
            </div>

            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">{integration.description}</p>

            <div className="mt-2.5 flex flex-wrap gap-1">
              {integration.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded border border-line bg-surface-900 px-1.5 py-0.5 text-[10px] text-slate-400"
                >
                  {capability}
                </span>
              ))}
            </div>

            <div className="mt-2.5 space-y-1">
              {integration.fields.length === 0 ? (
                <div className="flex items-center gap-1 text-[10.5px] text-ok">
                  <ShieldCheck size={10} /> no credentials required
                </div>
              ) : (
                integration.fields.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="text-slate-500">{field.label}</span>
                    <span className="mono text-slate-400">
                      {integration.config[field.key] ? integration.config[field.key] : 'not set'}
                    </span>
                  </div>
                ))
              )}
              <div className="text-[10px] text-slate-600">
                checked {timeAgo(integration.lastCheckedAt)}
                {integration.lastError ? ` · ${integration.lastError}` : ''}
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
              <Button size="sm" variant="ghost" onClick={() => void test(integration)} loading={testing === integration.key}>
                <Play size={11} /> Test
              </Button>
              {can('integration:manage') && integration.fields.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => openConfig(integration)}>
                  <Settings2 size={11} /> Configure
                </Button>
              )}
              {integration.key === 'database' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void action(integration, 'query', { sql: querySql })}
                >
                  Query
                </Button>
              )}
              {integration.key === 'documents' && (
                <Button size="sm" variant="ghost" onClick={() => void action(integration, 'extract', { path: docPath })}>
                  Extract
                </Button>
              )}
              {integration.key === 'github' && (
                <Button size="sm" variant="ghost" onClick={() => void action(integration, 'repos', {})}>
                  Repositories
                </Button>
              )}
              {integration.key === 'rest-api' && (
                <Button size="sm" variant="ghost" onClick={() => void action(integration, 'get', {})}>
                  GET
                </Button>
              )}
              {integration.key === 'webhook' && (
                <Button size="sm" variant="ghost" onClick={() => void action(integration, 'send', {})}>
                  Send test
                </Button>
              )}
              {integration.docs && (
                <a
                  href={integration.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-ghost ml-auto"
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {(rows.length === 0) && (
        <Panel>
          <EmptyState title="No integrations" icon={<Blocks size={16} />} />
        </Panel>
      )}

      <Panel
        title="Working with external providers"
        subtitle="Credentials are encrypted with AES-256-GCM before they touch the database"
        className="mt-3"
      >
        <div className="grid gap-3 sm:grid-cols-3 text-[11.5px] leading-relaxed text-slate-500">
          <div>
            <div className="mb-1 font-medium text-slate-300">Database</div>
            Runs read-only SQL against the platform SQLite database. Only SELECT / WITH statements are accepted.
          </div>
          <div>
            <div className="mb-1 font-medium text-slate-300">Documents</div>
            Extracts text from files inside the Nexus workspace. Path traversal is rejected.
          </div>
          <div>
            <div className="mb-1 font-medium text-slate-300">GitHub & REST</div>
            GitHub calls the official REST API with your token. The REST integration performs real outbound requests.
          </div>
        </div>
      </Panel>

      <Modal
        open={Boolean(configuring)}
        onClose={() => setConfiguring(null)}
        title={configuring ? `Configure ${configuring.name}` : ''}
        description="Secret fields show the masked stored value; leave them untouched to keep the existing credential."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfiguring(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving}>
              Save configuration
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(configuring?.fields ?? []).map((field) => (
            <Field key={field.key} label={field.label + (field.required ? ' *' : '')} hint={field.help}>
              <Input
                type={field.type === 'password' ? 'password' : 'text'}
                value={form[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                className={field.type === 'password' ? 'input-mono' : undefined}
              />
            </Field>
          ))}
          {configuring?.key === 'database' && (
            <Field label="Sample query" hint="Stored only in this browser for the Query action.">
              <Textarea rows={3} value={querySql} onChange={(event) => setQuerySql(event.target.value)} className="input-mono" />
            </Field>
          )}
          {configuring?.key === 'documents' && (
            <Field label="Sample document path" hint="Relative to the Nexus workspace.">
              <Input value={docPath} onChange={(event) => setDocPath(event.target.value)} className="input-mono" />
            </Field>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(testResult)}
        onClose={() => setTestResult(null)}
        title={testResult ? `${testResult.name} connection test` : ''}
        footer={
          <Button variant="ghost" onClick={() => setTestResult(null)}>
            Close
          </Button>
        }
      >
        {testResult && (
          <div className="space-y-3">
            <Badge tone={testResult.ok ? 'ok' : 'err'}>{testResult.ok ? 'connected' : 'failed'}</Badge>
            <p className="text-[12.5px] text-slate-300">{testResult.message}</p>
            {testResult.details !== undefined && <JsonBlock value={testResult.details} maxHeight={280} />}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(actionResult)}
        onClose={() => setActionResult(null)}
        title={actionResult?.title ?? ''}
        width="max-w-3xl"
        footer={
          <Button variant="ghost" onClick={() => setActionResult(null)}>
            Close
          </Button>
        }
      >
        {actionResult && (
          <div className="space-y-2">
            <Badge tone={actionResult.ok ? 'ok' : 'err'}>{actionResult.ok ? 'ok' : 'error'}</Badge>
            <JsonBlock value={actionResult.body} maxHeight={400} />
          </div>
        )}
      </Modal>
    </div>
  );
}
