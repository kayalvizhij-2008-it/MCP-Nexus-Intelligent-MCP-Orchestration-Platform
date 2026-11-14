import { Play, TerminalSquare } from 'lucide-react';
import React, { useEffect, useState } from 'react';
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
  Panel,
  Select,
  Textarea,
  useToast,
} from '../components/ui.js';
import { api, ApiError } from '../lib/api.js';
import { formatMs } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type Endpoint = { method: string; path: string; description: string; permission: string; allowed: boolean };

export function PlaygroundPage() {
  const { push } = useToast();
  const endpoints = useApi<{ endpoints: Endpoint[] }>('/api/playground/endpoints');
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/overview');
  const [body, setBody] = useState('{}');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    contentType: string | null;
    body: unknown;
    truncated: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) {
      setMethod(selected.method);
      setPath(selected.path);
      setResponse(null);
      setError(null);
    }
  }, [selected]);

  async function send() {
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      let parsedBody: unknown = undefined;
      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        try {
          parsedBody = JSON.parse(body || '{}');
        } catch {
          throw new Error('Request body must be valid JSON');
        }
      }
      const result = await api.post<{ response: any }>('/api/playground/request', {
        method,
        path,
        body: parsedBody,
      });
      setResponse(result.response);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Request failed';
      setError(message);
      push(message, 'err');
    } finally {
      setSending(false);
    }
  }

  if (endpoints.loading && !endpoints.data) return <LoadingBlock />;
  if (endpoints.error) return <ErrorState error={endpoints.error} onRetry={endpoints.reload} />;

  const list = endpoints.data?.endpoints ?? [];

  return (
    <div className="fade-in">
      <PageHeader
        title="API Playground"
        subtitle="Send authenticated requests to the control-plane API and inspect the exact payload returned to the browser."
        actions={<Badge tone="muted">session-authenticated</Badge>}
      />

      <div className="grid gap-3 xl:grid-cols-[320px_1fr]">
        <Panel title="Endpoints" subtitle="Your role's access is enforced server-side" flush>
          <div className="max-h-[520px] overflow-y-auto">
            {list.map((endpoint) => (
              <button
                key={`${endpoint.method}-${endpoint.path}`}
                onClick={() => setSelected(endpoint)}
                className={`flex w-full items-start gap-2 border-b border-line/60 px-3 py-2.5 text-left transition-colors ${
                  selected?.path === endpoint.path ? 'bg-accent/10' : 'hover:bg-surface-800/60'
                }`}
              >
                <span
                  className={`mt-0.5 w-11 shrink-0 rounded border px-1 py-0.5 text-center font-mono text-[9.5px] ${
                    endpoint.method === 'GET'
                      ? 'border-accent/25 text-accent-soft'
                      : endpoint.method === 'POST'
                        ? 'border-violet/25 text-violet'
                        : 'border-line text-slate-400'
                  }`}
                >
                  {endpoint.method}
                </span>
                <span className="min-w-0">
                  <span className="mono block truncate text-[11.5px] text-slate-200">{endpoint.path}</span>
                  <span className="block truncate text-[10.5px] text-slate-500">{endpoint.description}</span>
                </span>
                {!endpoint.allowed && (
                  <span className="ml-auto shrink-0 text-[9.5px] uppercase text-err">denied</span>
                )}
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Request" subtitle="Path substitutions are manual — replace :id with a real identifier">
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Field label="Method">
                <Select value={method} onChange={(event) => setMethod(event.target.value)}>
                  {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((verb) => (
                    <option key={verb} value={verb}>
                      {verb}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Path">
                <Input value={path} onChange={(event) => setPath(event.target.value)} className="input-mono" />
              </Field>
            </div>
            {['POST', 'PATCH', 'PUT'].includes(method) && (
              <div className="mt-3">
                <Field label="JSON body">
                  <Textarea
                    rows={6}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="input-mono"
                    spellCheck={false}
                  />
                </Field>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" onClick={() => void send()} loading={sending}>
                <Play size={12} /> Send request
              </Button>
              <span className="text-[11px] text-slate-500">
                Requests execute through the running API with your session cookie.
              </span>
            </div>
            {error && <div className="mt-3"><ErrorState error={error} /></div>}
          </Panel>

          <Panel
            title="Response"
            subtitle={
              response
                ? `${response.status} ${response.statusText} · ${formatMs(response.durationMs)}`
                : 'No request sent yet'
            }
            actions={
              response ? (
                <div className="flex items-center gap-1.5">
                  <Badge tone={response.status < 400 ? 'ok' : 'err'}>{response.status}</Badge>
                  <Badge tone="muted">{response.contentType ?? 'unknown'}</Badge>
                </div>
              ) : null
            }
          >
            {!response ? (
              <EmptyState
                title="Send a request"
                description="Pick an endpoint, adjust the path and inspect the real JSON payload."
                icon={<TerminalSquare size={16} />}
              />
            ) : (
              <JsonBlock value={response.body} maxHeight={420} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
