import { Clock, Play, TerminalSquare } from 'lucide-react';
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

type PlaygroundResponse = {
  status: number;
  statusText: string;
  durationMs: number;
  contentType: string | null;
  body: unknown;
  truncated: boolean;
};

type HistoryEntry = {
  id: number;
  method: string;
  path: string;
  at: number;
  response: PlaygroundResponse | null;
  error: string | null;
};

function methodTone(method: string) {
  if (method === 'GET') return 'border-accent/25 bg-accent/[0.06] text-accent-soft';
  if (method === 'POST') return 'border-ice/25 bg-ice/[0.06] text-ice';
  if (method === 'DELETE') return 'border-coral/25 bg-coral/[0.06] text-coral';
  return 'border-line bg-surface-900 text-slate-400';
}

export function PlaygroundPage() {
  const { push } = useToast();
  const endpoints = useApi<{ endpoints: Endpoint[] }>('/api/playground/endpoints');
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/overview');
  const [body, setBody] = useState('{}');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

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
    const startedPath = path;
    const startedMethod = method;
    try {
      let parsedBody: unknown = undefined;
      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        try {
          parsedBody = JSON.parse(body || '{}');
        } catch {
          throw new Error('Request body must be valid JSON');
        }
      }
      const result = await api.post<{ response: PlaygroundResponse }>('/api/playground/request', {
        method,
        path,
        body: parsedBody,
      });
      setResponse(result.response);
      setHistory((current) =>
        [
          {
            id: Date.now(),
            method: startedMethod,
            path: startedPath,
            at: Date.now(),
            response: result.response,
            error: null,
          },
          ...current,
        ].slice(0, 12),
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Request failed';
      setError(message);
      setHistory((current) =>
        [
          { id: Date.now(), method: startedMethod, path: startedPath, at: Date.now(), response: null, error: message },
          ...current,
        ].slice(0, 12),
      );
      push(message, 'err');
    } finally {
      setSending(false);
    }
  }

  if (endpoints.loading && !endpoints.data) return <LoadingBlock />;
  if (endpoints.error) return <ErrorState error={endpoints.error} onRetry={endpoints.reload} />;

  const list = endpoints.data?.endpoints ?? [];
  const needsBody = ['POST', 'PATCH', 'PUT'].includes(method);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Developer console"
        title="API Playground"
        subtitle="Send authenticated requests to the control-plane API and inspect the exact payload returned to the browser."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="info">session-authenticated</Badge>
            <Badge tone="muted">{list.length} endpoints</Badge>
          </div>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* endpoint rail */}
        <div className="space-y-3">
          <Panel title="Endpoints" subtitle="Access enforced server-side" flush>
            <div className="max-h-[440px] overflow-y-auto">
              {list.map((endpoint) => (
                <button
                  key={`${endpoint.method}-${endpoint.path}`}
                  onClick={() => setSelected(endpoint)}
                  className={`flex w-full items-start gap-2 border-b border-line/60 px-3 py-2.5 text-left transition-colors ${
                    selected?.path === endpoint.path ? 'bg-accent/[0.08]' : 'hover:bg-surface-800/60'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-11 shrink-0 rounded border px-1 py-0.5 text-center font-mono text-[9.5px] ${methodTone(endpoint.method)}`}
                  >
                    {endpoint.method}
                  </span>
                  <span className="min-w-0">
                    <span className="mono block truncate text-[11.5px] text-slate-200">{endpoint.path}</span>
                    <span className="block truncate text-[10.5px] text-slate-500">{endpoint.description}</span>
                  </span>
                  {!endpoint.allowed && (
                    <span className="ml-auto shrink-0 text-[9.5px] uppercase text-coral">denied</span>
                  )}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Session history" subtitle="Requests sent from this page" flush>
            {history.length === 0 ? (
              <p className="px-4 py-5 text-[11.5px] text-slate-500">
                Nothing sent yet. Requests you send are listed here with their real status.
              </p>
            ) : (
              <div className="max-h-[220px] divide-y divide-line/60 overflow-y-auto">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setResponse(entry.response);
                      setError(entry.error);
                      setMethod(entry.method);
                      setPath(entry.path);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-800/60"
                  >
                    <span
                      className={`w-9 shrink-0 rounded border px-1 py-0.5 text-center font-mono text-[9px] ${methodTone(entry.method)}`}
                    >
                      {entry.method}
                    </span>
                    <span className="mono min-w-0 flex-1 truncate text-[10.5px] text-slate-400">{entry.path}</span>
                    <span
                      className={`mono shrink-0 text-[9.5px] ${
                        entry.error ? 'text-coral' : (entry.response?.status ?? 0) < 400 ? 'text-ok' : 'text-coral'
                      }`}
                    >
                      {entry.error ? 'ERR' : entry.response?.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          {/* request console */}
          <section className="panel panel-signal overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line/80 px-4 py-3">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <TerminalSquare size={13} className="text-accent" /> Request
              </span>
              <span className="mono ml-auto text-[10px] text-slate-600">
                your session cookie is attached by the server
              </span>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[116px] shrink-0">
                  <Field label="Method">
                    <Select value={method} onChange={(event) => setMethod(event.target.value)}>
                      {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((verb) => (
                        <option key={verb} value={verb}>
                          {verb}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="min-w-[180px] flex-1">
                  <Field label="Path">
                    <Input value={path} onChange={(event) => setPath(event.target.value)} className="input-mono" />
                  </Field>
                </div>
              </div>

              {needsBody && (
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={() => void send()} loading={sending}>
                  <Play size={12} /> Send request
                </Button>
                {response && (
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-500">
                    <Clock size={10} /> {formatMs(response.durationMs)} round trip
                  </span>
                )}
                {error && <span className="text-[10.5px] text-coral">{error}</span>}
              </div>
            </div>
          </section>

          <Panel
            title="Response"
            signal
            subtitle={
              response
                ? `${response.status} ${response.statusText} · ${formatMs(response.durationMs)}`
                : 'No request selected yet'
            }
            actions={
              response ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={response.status < 400 ? 'ok' : 'err'}>{response.status}</Badge>
                  <Badge tone="muted">{response.contentType ?? 'unknown'}</Badge>
                  {response.truncated && <Badge tone="warn">truncated</Badge>}
                </div>
              ) : null
            }
          >
            {error && !response ? (
              <ErrorState error={error} />
            ) : !response ? (
              <EmptyState
                title="Send a request"
                description="Pick an endpoint, adjust the path and inspect the real JSON payload."
                icon={<TerminalSquare size={16} />}
              />
            ) : (
              <JsonBlock value={response.body} maxHeight={460} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
