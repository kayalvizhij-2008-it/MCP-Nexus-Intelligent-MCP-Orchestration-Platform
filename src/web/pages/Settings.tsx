import { KeyRound, RefreshCw, Save, Settings2, ShieldAlert } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../App.js';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Panel,
  useToast,
} from '../components/ui.js';
import { api, ApiError } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';

type SettingsPayload = {
  settings: Record<string, string>;
  secret: { mcpHttpToken: string | null };
  editableKeys: string[];
  runtime: { dataDir: string; workspace: string; port: number };
};

type MetaPayload = {
  platform: { name: string; version: string; tagline: string };
  runtime: {
    node: string;
    platform: string;
    arch: string;
    pid: number;
    uptimeSeconds: number;
    port: number;
    dataDir: string;
    workspace: string;
  };
  sdk: { name: string; version: string };
  transports: string[];
  migrations: Array<{ id: string; description: string; applied_at: string }>;
};

export function SettingsPage() {
  const { session, can, signOut } = useAuth();
  const { push } = useToast();
  const settings = useApi<SettingsPayload>('/api/settings');
  const meta = useApi<MetaPayload>('/api/meta');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data.settings);
  }, [settings.data]);

  async function save() {
    setSaving(true);
    try {
      await api.put('/api/settings', form);
      push('Settings updated', 'ok');
      settings.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function rotateToken() {
    try {
      const response = await api.post<{ note: string }>('/api/settings/rotate-mcp-token');
      push(response.note, 'ok');
      settings.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Rotation failed', 'err');
    }
  }

  async function changePassword() {
    setPasswordSaving(true);
    try {
      await api.post('/api/auth/password', passwords);
      push('Password changed — sign in again', 'ok');
      await signOut();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Password change failed', 'err');
    } finally {
      setPasswordSaving(false);
    }
  }

  if (settings.loading && !settings.data) return <LoadingBlock />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;

  return (
    <div className="fade-in">
      <PageHeader
        title="Settings"
        subtitle="Platform behaviour, the HTTP MCP bearer token, runtime information and your own credentials."
        actions={<Badge tone="muted">{session?.user.role}</Badge>}
      />

      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Platform"
          subtitle="Control-plane behaviour — changes are audited"
          actions={<Settings2 size={13} className="text-slate-500" />}
        >
          <div className="space-y-3">
            <Field label="Platform name">
              <Input
                value={form['platform.name'] ?? ''}
                onChange={(event) => setForm({ ...form, 'platform.name': event.target.value })}
                disabled={!can('user:manage')}
              />
            </Field>
            <Field label="Require approval for destructive tools" hint="Applies to tools whose names match write/delete/exec patterns.">
              <select
                value={form['security.require_approval_destructive'] ?? 'true'}
                onChange={(event) =>
                  setForm({ ...form, 'security.require_approval_destructive': event.target.value })
                }
                disabled={!can('user:manage')}
                className="input"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </Field>
            <Field label="API requests per minute" hint="Sliding-window rate limit per session.">
              <Input
                type="number"
                value={form['rate.limit_per_minute'] ?? '240'}
                onChange={(event) => setForm({ ...form, 'rate.limit_per_minute': event.target.value })}
                disabled={!can('user:manage')}
              />
            </Field>
            {can('user:manage') && (
              <Button variant="primary" onClick={() => void save()} loading={saving}>
                <Save size={12} /> Save settings
              </Button>
            )}
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Your profile" subtitle="Identity and permissions for this session">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-[13px] font-semibold text-accent-soft">
                  {(session?.user.name ?? session?.user.email ?? '?')
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-slate-100">
                    {session?.user.name ?? session?.user.email}
                  </div>
                  <div className="truncate text-[11.5px] text-slate-500">{session?.user.email}</div>
                </div>
                <Badge tone={session?.user.role === 'admin' ? 'violet' : 'muted'}>{session?.user.role}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[11.5px]">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-600">Permissions</dt>
                  <dd className="mt-0.5 text-slate-300">{session?.permissions.length ?? 0} granted</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-600">Session</dt>
                  <dd className="mt-0.5 text-slate-300">HTTP-only cookie</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-1">
                {(session?.permissions ?? []).slice(0, 8).map((permission) => (
                  <span
                    key={permission}
                    className="mono rounded border border-line bg-surface-900 px-1.5 py-0.5 text-[10px] text-slate-400"
                  >
                    {permission}
                  </span>
                ))}
              </div>
              <Button onClick={() => void signOut()}>Sign out of this session</Button>
            </div>
          </Panel>

          <Panel title="MCP HTTP bearer token" subtitle="Protects the platform's own Streamable HTTP endpoint">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface-900 px-3 py-2">
                <span className="mono text-[12px] text-slate-300">
                  {settings.data?.secret.mcpHttpToken ?? 'not configured'}
                </span>
                <Badge tone={settings.data?.secret.mcpHttpToken ? 'ok' : 'warn'}>
                  {settings.data?.secret.mcpHttpToken ? 'active' : 'missing'}
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Rotating replaces the token and rewrites the encrypted header on the
                <span className="mono"> nexus-control-http </span> server. Restart that server afterwards.
              </p>
              {can('user:manage') && (
                <Button onClick={() => void rotateToken()}>
                  <RefreshCw size={12} /> Rotate token
                </Button>
              )}
            </div>
          </Panel>

          <Panel title="Change password" subtitle="Sessions are revoked after a successful change">
            <div className="space-y-3">
              <Field label="Current password">
                <Input
                  type="password"
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                />
              </Field>
              <Field label="New password" hint="Minimum 8 characters.">
                <Input
                  type="password"
                  value={passwords.newPassword}
                  onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                />
              </Field>
              <Button
                onClick={() => void changePassword()}
                loading={passwordSaving}
                disabled={!passwords.currentPassword || passwords.newPassword.length < 8}
              >
                <KeyRound size={12} /> Update password
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Runtime" subtitle="Live process and storage information">
          {meta.loading && !meta.data ? (
            <LoadingBlock />
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-[12px]">
              {[
                ['Platform version', `v${meta.data?.platform.version}`],
                ['MCP SDK', meta.data?.sdk.version ?? '—'],
                ['Node', meta.data?.runtime.node ?? '—'],
                ['Uptime', `${Math.floor((meta.data?.runtime.uptimeSeconds ?? 0) / 60)} min`],
                ['Port', String(meta.data?.runtime.port)],
                ['PID', String(meta.data?.runtime.pid)],
                ['Data directory', meta.data?.runtime.dataDir ?? '—'],
                ['Workspace', meta.data?.runtime.workspace ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10.5px] uppercase tracking-wider text-slate-600">{label}</dt>
                  <dd className="mono mt-0.5 break-all text-slate-300">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <Panel title="Database migrations" subtitle="Schema versions applied to this instance" flush>
          <div className="divide-y divide-line/60">
            {(meta.data?.migrations ?? []).map((migration) => (
              <div key={migration.id} className="flex items-start justify-between gap-2 px-4 py-2">
                <div>
                  <div className="mono text-[11.5px] text-slate-200">{migration.id}</div>
                  <div className="text-[10.5px] text-slate-500">{migration.description}</div>
                </div>
                <Badge tone="ok">applied</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="mt-3 border-warn/20 bg-warn/5">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={15} className="mt-0.5 text-warn" />
          <div>
            <div className="text-[12.5px] font-medium text-warn">Local-first security posture</div>
            <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-slate-400">
              MCPNEXUS binds to 127.0.0.1 by default. Session cookies are HTTP-only; set
              <span className="mono"> MCPNEXUS_COOKIE_SECURE=true </span> when serving over HTTPS. The master key
              lives in <span className="mono">data/master.key</span> — back it up, because stored secrets cannot be
              decrypted without it.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
