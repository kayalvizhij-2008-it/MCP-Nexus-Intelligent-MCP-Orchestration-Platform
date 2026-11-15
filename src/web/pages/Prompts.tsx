import { FileText, Plus, Sparkles, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
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
  Tabs,
  Textarea,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type PromptDto, type ServerDto } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';

type CustomPrompt = {
  id: string;
  name: string;
  category: string;
  description: string;
  template: string;
  arguments: Array<{ name: string; required?: boolean; description?: string }>;
  createdBy: string;
  updatedAt: string;
};

export function PromptsPage() {
  const [tab, setTab] = useState('server');
  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Infrastructure"
        title="Prompt Studio"
        subtitle="Inspect prompts registered by MCP servers and author reusable templates with dynamic arguments."
      />
      <Tabs
        tabs={[
          { id: 'server', label: 'Server prompts' },
          { id: 'custom', label: 'Custom templates' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4">{tab === 'server' ? <ServerPrompts /> : <CustomPrompts />}</div>
    </div>
  );
}

function ServerPrompts() {
  const { push } = useToast();
  const servers = useApi<{ servers: ServerDto[] }>('/api/servers');
  const prompts = useApi<{ prompts: PromptDto[] }>('/api/prompts', { pollMs: 20000 });
  const [serverFilter, setServerFilter] = useState('all');
  const [active, setActive] = useState<PromptDto | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const rows = (prompts.data?.prompts ?? []).filter(
    (prompt) => serverFilter === 'all' || prompt.serverId === serverFilter,
  );

  async function generate() {
    if (!active) return;
    setLoading(true);
    try {
      const response = await api.post<{ messages: any[] }>('/api/prompts/preview', {
        serverId: active.serverId,
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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={serverFilter} onChange={(event) => setServerFilter(event.target.value)} className="w-[240px]">
          <option value="all">All servers</option>
          {(servers.data?.servers ?? []).map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </Select>
        <Badge tone="info">{rows.length} prompts</Badge>
      </div>

      {prompts.loading && !prompts.data && <LoadingBlock />}
      {prompts.error && <ErrorState error={prompts.error} onRetry={prompts.reload} />}

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            title="No server prompts"
            description="Prompts appear after a server completes its MCP handshake."
            icon={<FileText size={16} />}
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Prompt</th>
                <th>Server</th>
                <th>Arguments</th>
                <th className="text-right">Preview</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((prompt) => (
                <tr key={prompt.id}>
                  <td>
                    <div className="font-medium text-slate-200">{prompt.name}</div>
                    <div className="max-w-[460px] text-[11px] text-slate-500">{prompt.description}</div>
                  </td>
                  <td className="text-[11.5px] text-slate-400">{prompt.serverName}</td>
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
                      <Sparkles size={11} /> Generate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active ? `${active.serverName} · ${active.name}` : ''}
        description={active?.description}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setActive(null)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => void generate()} loading={loading}>
              Generate messages
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(active?.arguments ?? []).map((arg) => (
            <Field key={arg.name} label={`${arg.name}${arg.required ? ' *' : ''}`} hint={arg.description}>
              <Textarea
                rows={/text|code|content/i.test(arg.name) ? 4 : 2}
                value={values[arg.name] ?? ''}
                onChange={(event) => setValues({ ...values, [arg.name]: event.target.value })}
              />
            </Field>
          ))}
          {messages && <JsonBlock value={messages} maxHeight={320} />}
        </div>
      </Modal>
    </div>
  );
}

function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function CustomPrompts() {
  const { can } = useAuth();
  const { push } = useToast();
  const prompts = useApi<{ prompts: CustomPrompt[] }>('/api/custom-prompts');
  const [editing, setEditing] = useState<CustomPrompt | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'General', description: '', template: '' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<CustomPrompt | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string | null>(null);

  const placeholders = useMemo(() => extractPlaceholders(form.template), [form.template]);

  function beginCreate() {
    setForm({ name: '', category: 'General', description: '', template: '' });
    setCreating(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        description: form.description,
        template: form.template,
        arguments: placeholders.map((name) => ({ name, required: true })),
      };
      if (editing) await api.patch(`/api/custom-prompts/${editing.id}`, payload);
      else await api.post('/api/custom-prompts', payload);
      push(editing ? 'Template updated' : 'Template created', 'ok');
      setCreating(false);
      setEditing(null);
      prompts.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function remove(prompt: CustomPrompt) {
    try {
      await api.del(`/api/custom-prompts/${prompt.id}`);
      push('Template deleted', 'ok');
      prompts.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Delete failed', 'err');
    }
  }

  async function render() {
    if (!preview) return;
    try {
      const response = await api.post<{ rendered: string }>(`/api/custom-prompts/${preview.id}/preview`, {
        values,
      });
      setRendered(response.rendered);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Preview failed', 'err');
    }
  }

  useEffect(() => {
    if (!preview) setRendered(null);
  }, [preview]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-500">
          Templates use <span className="mono text-slate-300">{'{{variable}}'}</span> placeholders. Every
          placeholder becomes a required argument automatically.
        </p>
        {can('prompt:manage') && (
          <Button variant="primary" onClick={beginCreate}>
            <Plus size={13} /> New template
          </Button>
        )}
      </div>

      {prompts.loading && !prompts.data && <LoadingBlock />}
      {prompts.error && <ErrorState error={prompts.error} onRetry={prompts.reload} />}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(prompts.data?.prompts ?? []).map((prompt) => (
          <div key={prompt.id} className="panel flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13px] font-medium text-slate-100">{prompt.name}</div>
                <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-slate-500">
                  {prompt.category}
                </div>
              </div>
              <Badge tone="muted">{extractPlaceholders(prompt.template).length} vars</Badge>
            </div>
            <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-slate-500">
              {prompt.description || 'No description'}
            </p>
            <pre className="mt-2 max-h-[86px] overflow-hidden rounded-md border border-line bg-surface-950 p-2 font-mono text-[10.5px] leading-relaxed text-slate-400">
              {prompt.template.slice(0, 220)}
            </pre>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPreview(prompt);
                  setValues({});
                }}
              >
                <Sparkles size={11} /> Preview
              </Button>
              {can('prompt:manage') && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(prompt);
                      setForm({
                        name: prompt.name,
                        category: prompt.category,
                        description: prompt.description,
                        template: prompt.template,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void remove(prompt)}>
                    <Trash2 size={11} />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {(prompts.data?.prompts ?? []).length === 0 && !prompts.loading && (
          <div className="md:col-span-2 xl:col-span-3">
            <Panel>
              <EmptyState
                title="No custom templates"
                description="Create a reusable prompt with dynamic placeholders."
                action={
                  can('prompt:manage') ? (
                    <Button size="sm" onClick={beginCreate}>
                      <Plus size={12} /> New template
                    </Button>
                  ) : undefined
                }
              />
            </Panel>
          </div>
        )}
      </div>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Edit template' : 'New prompt template'}
        width="max-w-2xl"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!form.name || !form.template}>
              {editing ? 'Save changes' : 'Create template'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="Category">
              <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="Template" hint="Use {{name}} for dynamic arguments.">
            <Textarea
              rows={8}
              value={form.template}
              onChange={(event) => setForm({ ...form, template: event.target.value })}
              className="input-mono"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Detected arguments:</span>
            {placeholders.length ? (
              placeholders.map((name) => (
                <Badge key={name} tone="info">
                  {name}
                </Badge>
              ))
            ) : (
              <span className="text-[11px] text-slate-600">none</span>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? `Preview · ${preview.name}` : ''}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => void render()}>
              Render
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {extractPlaceholders(preview?.template ?? '').map((name) => (
            <Field key={name} label={name}>
              <Textarea
                rows={name.match(/text|schema|error|code/i) ? 3 : 1}
                value={values[name] ?? ''}
                onChange={(event) => setValues({ ...values, [name]: event.target.value })}
              />
            </Field>
          ))}
          {rendered && <pre className="code-block max-h-[320px] whitespace-pre-wrap">{rendered}</pre>}
          {!rendered && preview && (
            <pre className="code-block max-h-[220px] whitespace-pre-wrap opacity-60">{preview.template}</pre>
          )}
        </div>
      </Modal>
    </div>
  );
}
