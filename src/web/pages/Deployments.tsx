import { CheckCircle2, Download, Rocket, XCircle } from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../App.js';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  StatusBadge,
  useToast,
} from '../components/ui.js';
import { api, ApiError } from '../lib/api.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type Deployment = {
  id: string;
  environment: string;
  version: string;
  status: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  notes: string;
  createdBy: string;
  createdAt: string;
};

export function DeploymentsPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const deployments = useApi<{ deployments: Deployment[]; environments: Array<{ name: string; url: string | null; description: string }> }>(
    '/api/deployments',
  );
  const migrations = useApi<{ migrations: Array<{ id: string; description: string; applied_at: string }> }>(
    '/api/migrations',
  );
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<Deployment | null>(null);

  async function runCheck() {
    setRunning(true);
    try {
      const response = await api.post<{ deployment: Deployment }>('/api/deployments', {
        environment: 'local',
        notes: 'Readiness check triggered from the Deployment Center',
      });
      push(`Readiness check: ${response.deployment.status}`, response.deployment.status === 'ready' ? 'ok' : 'err');
      setLatest(response.deployment);
      deployments.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Check failed', 'err');
    } finally {
      setRunning(false);
    }
  }

  if (deployments.loading && !deployments.data) return <LoadingBlock />;
  if (deployments.error) return <ErrorState error={deployments.error} onRetry={deployments.reload} />;

  const history = deployments.data?.deployments ?? [];
  const checks = latest?.checks ?? history[0]?.checks ?? [];

  return (
    <div className="fade-in">
      <PageHeader
        title="Deployment Center"
        subtitle="Readiness checks run against this instance: runtime, database, migrations, MCP SDK and server connectivity."
        actions={
          can('deployment:manage') ? (
            <Button variant="primary" onClick={() => void runCheck()} loading={running}>
              <Rocket size={13} /> Run readiness check
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Readiness checks"
          subtitle={latest ? `Checked ${timeAgo(latest.createdAt)}` : 'Latest recorded check'}
          actions={latest ? <StatusBadge status={latest.status} /> : null}
          flush
        >
          {checks.length === 0 ? (
            <EmptyState title="No checks recorded" description="Run a readiness check to snapshot the current state." />
          ) : (
            <div className="divide-y divide-line/60">
              {checks.map((check) => (
                <div key={check.name} className="flex items-start gap-2.5 px-4 py-2.5">
                  {check.ok ? (
                    <CheckCircle2 size={14} className="mt-0.5 text-ok" />
                  ) : (
                    <XCircle size={14} className="mt-0.5 text-err" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-slate-200">{check.name}</div>
                    <div className="mono text-[10.5px] text-slate-500">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-3">
          <Panel title="Environments" subtitle="Where this code runs">
            <div className="space-y-2">
              {(deployments.data?.environments ?? []).map((environment) => (
                <div key={environment.name} className="rounded-lg border border-line bg-surface-900 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-slate-200">{environment.name}</span>
                    <Badge tone="muted">{environment.url ?? 'managed'}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{environment.description}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Configuration manifest"
            subtitle="Secrets are excluded by design"
            actions={
              <a href="/api/deployments/manifest" className="btn btn-sm btn-ghost" download>
                <Download size={11} /> Download
              </a>
            }
          >
            <p className="text-[11.5px] leading-relaxed text-slate-500">
              The manifest contains every server definition, transport, argument list and the names of stored
              secrets — never their values. Use it to bootstrap another MCPNEXUS instance.
            </p>
          </Panel>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Check history" subtitle="Every readiness run is persisted" flush>
          {history.length === 0 ? (
            <EmptyState title="No history" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>By</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((deployment) => (
                  <tr key={deployment.id}>
                    <td className="text-slate-200">{deployment.environment}</td>
                    <td>
                      <StatusBadge status={deployment.status} />
                    </td>
                    <td className="mono">v{deployment.version}</td>
                    <td className="text-[11.5px] text-slate-500">{deployment.createdBy}</td>
                    <td className="text-right text-[11px] text-slate-500" title={formatDate(deployment.createdAt)}>
                      {timeAgo(deployment.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Database migrations" subtitle="Applied in order at boot" flush>
          <div className="divide-y divide-line/60">
            {(migrations.data?.migrations ?? []).map((migration) => (
              <div key={migration.id} className="px-4 py-2.5">
                <div className="mono text-[11.5px] text-slate-200">{migration.id}</div>
                <div className="text-[10.5px] text-slate-500">
                  {migration.description} · {timeAgo(migration.applied_at)}
                </div>
              </div>
            ))}
            {(migrations.data?.migrations ?? []).length === 0 && <EmptyState title="No migrations recorded" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}
