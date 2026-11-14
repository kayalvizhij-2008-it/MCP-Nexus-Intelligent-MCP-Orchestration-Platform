import { Check, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
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
  Select,
  StatusBadge,
  Tabs,
  useToast,
} from '../components/ui.js';
import { api, ApiError } from '../lib/api.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type SecurityPayload = {
  users: Array<{ id: string; email: string; name: string; role: string; createdAt: string; lastLoginAt: string | null; activeSessions: number }>;
  roles: Array<{ role: string; permissions: string[] }>;
  sessions: Array<{ id: string; email: string; name: string; createdAt: string; expiresAt: string; ip: string; userAgent: string }>;
  policies: Array<{ id: string; scope: string; subject: string; permission: string; effect: string; requiresApproval: boolean; note: string; createdAt: string }>;
  approvals: Array<{ id: string; serverId: string; toolName: string; arguments: any; status: string; requestedBy: string; decidedBy: string | null; decidedAt: string | null; note: string; createdAt: string }>;
  secretStatus: Array<{ scope: string; name: string; keys: Array<{ key: string; value: string }> }>;
  events: Array<{ id: string; actor: string; action: string; detail: any; ip: string; createdAt: string }>;
  tokenConfigured: boolean;
};

type AuditPayload = {
  entries: Array<{ id: string; actor: string; action: string; targetType: string; detail: any; createdAt: string }>;
};

export function SecurityPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const security = useApi<SecurityPayload>('/api/security', { pollMs: 20000 });
  const audit = useApi<AuditPayload>('/api/audit?limit=80');
  const [tab, setTab] = useState('users');
  const [userModal, setUserModal] = useState(false);
  const [policyModal, setPolicyModal] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'operator' });
  const [policyForm, setPolicyForm] = useState({
    scope: 'role',
    subject: 'viewer',
    permission: 'tool:execute',
    effect: 'deny',
    requiresApproval: false,
    note: '',
  });
  const [saving, setSaving] = useState(false);

  if (security.loading && !security.data) return <LoadingBlock label="Loading security state" />;
  if (security.error) return <ErrorState error={security.error} onRetry={security.reload} />;
  const data = security.data!;
  const pending = data.approvals.filter((approval) => approval.status === 'pending');

  async function createUser() {
    setSaving(true);
    try {
      await api.post('/api/users', userForm);
      push('User created', 'ok');
      setUserModal(false);
      setUserForm({ name: '', email: '', password: '', role: 'operator' });
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Create failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(id: string, role: string) {
    try {
      await api.patch(`/api/users/${id}`, { role });
      push('Role updated', 'ok');
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Update failed', 'err');
    }
  }

  async function removeUser(id: string) {
    try {
      await api.del(`/api/users/${id}`);
      push('User removed', 'ok');
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Delete failed', 'err');
    }
  }

  async function revoke(id: string) {
    try {
      await api.del(`/api/security/sessions/${id}`);
      push('Session revoked', 'ok');
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Revoke failed', 'err');
    }
  }

  async function decide(id: string, decision: 'approve' | 'reject') {
    try {
      await api.post(`/api/approvals/${id}/decide`, { decision });
      push(`Approval ${decision}d`, 'ok');
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Decision failed', 'err');
    }
  }

  async function createPolicy() {
    setSaving(true);
    try {
      await api.post('/api/policies', policyForm);
      push('Policy created', 'ok');
      setPolicyModal(false);
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Create failed', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function deletePolicy(id: string) {
    try {
      await api.del(`/api/policies/${id}`);
      push('Policy deleted', 'ok');
      security.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Delete failed', 'err');
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Security Center"
        subtitle="Identity, role-based access control, approval gates, encrypted secrets and the audit trail."
        actions={
          <div className="flex items-center gap-2">
            {pending.length > 0 && <Badge tone="warn">{pending.length} pending approval</Badge>}
            <Badge tone="ok">
              <ShieldCheck size={11} /> RBAC enforced
            </Badge>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'users', label: 'Users', count: data.users.length },
          { id: 'policies', label: 'Policies', count: data.policies.length },
          { id: 'approvals', label: 'Approvals', count: data.approvals.length },
          { id: 'sessions', label: 'Sessions', count: data.sessions.length },
          { id: 'secrets', label: 'Secrets', count: data.secretStatus.length },
          { id: 'audit', label: 'Audit & events', count: audit.data?.entries.length ?? 0 },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-4 space-y-3">
        {tab === 'users' && (
          <>
            <Panel
              title="Users"
              subtitle="Roles map to a fixed permission set; passwords are scrypt-hashed"
              flush
              actions={
                can('user:manage') ? (
                  <Button size="sm" variant="primary" onClick={() => setUserModal(true)}>
                    <UserPlus size={11} /> Add user
                  </Button>
                ) : null
              }
            >
              <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Sessions</th>
                    <th>Last login</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="font-medium text-slate-200">{user.name}</div>
                        <div className="text-[11px] text-slate-500">{user.email}</div>
                      </td>
                      <td>
                        {can('user:manage') ? (
                          <Select
                            value={user.role}
                            onChange={(event) => void changeRole(user.id, event.target.value)}
                            className="h-7 w-[120px] py-0 text-[11.5px]"
                          >
                            <option value="admin">admin</option>
                            <option value="operator">operator</option>
                            <option value="viewer">viewer</option>
                          </Select>
                        ) : (
                          <Badge tone="muted">{user.role}</Badge>
                        )}
                      </td>
                      <td className="mono text-slate-400">{user.activeSessions}</td>
                      <td className="text-[11px] text-slate-500">{timeAgo(user.lastLoginAt)}</td>
                      <td className="text-right">
                        {can('user:manage') && (
                          <Button size="sm" variant="ghost" onClick={() => void removeUser(user.id)}>
                            <Trash2 size={11} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Panel>

            <Panel title="Role matrix" subtitle="Permission grants per role" flush>
              <div className="grid gap-0 sm:grid-cols-3">
                {data.roles.map((role) => (
                  <div key={role.role} className="border-b border-line/60 p-4 sm:border-b-0 sm:border-r last:border-r-0">
                    <div className="mb-2 flex items-center gap-1.5">
                      <Badge tone={role.role === 'admin' ? 'violet' : role.role === 'operator' ? 'info' : 'muted'}>
                        {role.role}
                      </Badge>
                      <span className="text-[10.5px] text-slate-500">{role.permissions.length} permissions</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((permission) => (
                        <span key={permission} className="mono rounded border border-line bg-surface-900 px-1 py-0.5 text-[10px] text-slate-400">
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}

        {tab === 'policies' && (
          <Panel
            title="Permission policies"
            subtitle="Deny wins. Allow policies can force approval before execution."
            flush
            actions={
              can('security:manage') ? (
                <Button size="sm" variant="primary" onClick={() => setPolicyModal(true)}>
                  <Plus size={11} /> New policy
                </Button>
              ) : null
            }
          >
            <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Permission</th>
                  <th>Effect</th>
                  <th>Approval</th>
                  <th>Note</th>
                  <th className="text-right"></th>
                </tr>
              </thead>
              <tbody>
                {data.policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>
                      <Badge tone="muted">{policy.scope}</Badge>{' '}
                      <span className="mono text-[11px] text-slate-400">{policy.subject}</span>
                    </td>
                    <td className="mono text-[11.5px] text-slate-300">{policy.permission}</td>
                    <td>
                      <Badge tone={policy.effect === 'deny' ? 'err' : 'ok'}>{policy.effect}</Badge>
                    </td>
                    <td className="text-[11.5px] text-slate-400">{policy.requiresApproval ? 'required' : '—'}</td>
                    <td className="max-w-[320px] text-[11px] text-slate-500">{policy.note}</td>
                    <td className="text-right">
                      {can('security:manage') && (
                        <Button size="sm" variant="ghost" onClick={() => void deletePolicy(policy.id)}>
                          <Trash2 size={11} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Panel>
        )}

        {tab === 'approvals' && (
          <Panel title="Tool execution approvals" subtitle="Sensitive calls wait here for an administrator decision" flush>
            {data.approvals.length === 0 ? (
              <EmptyState title="No approvals" description="Calls to tools marked for approval will appear here." />
            ) : (
              <div className="divide-y divide-line/60">
                {data.approvals.map((approval) => (
                  <div key={approval.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-slate-100">{approval.toolName}</span>
                          <StatusBadge status={approval.status} />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          requested by {approval.requestedBy} · {timeAgo(approval.createdAt)}
                          {approval.decidedBy ? ` · decided by ${approval.decidedBy}` : ''}
                        </div>
                      </div>
                      {approval.status === 'pending' && can('security:manage') && (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="primary" onClick={() => void decide(approval.id, 'approve')}>
                            <Check size={11} /> Approve
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void decide(approval.id, 'reject')}>
                            <X size={11} /> Reject
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <JsonBlock value={approval.arguments} maxHeight={120} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {tab === 'sessions' && (
          <Panel title="Active sessions" subtitle="Server-side sessions; revoking signs the browser out" flush>
            <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>IP</th>
                  <th className="text-right">Revoke</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <div className="text-slate-200">{session.name}</div>
                      <div className="text-[11px] text-slate-500">{session.email}</div>
                    </td>
                    <td className="text-[11px] text-slate-400">{formatDate(session.createdAt)}</td>
                    <td className="text-[11px] text-slate-400">{formatDate(session.expiresAt)}</td>
                    <td className="mono text-[11px] text-slate-500">{session.ip ?? '—'}</td>
                    <td className="text-right">
                      {can('user:manage') && (
                        <Button size="sm" variant="ghost" onClick={() => void revoke(session.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.sessions.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="No active sessions" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </Panel>
        )}

        {tab === 'secrets' && (
          <>
            <Panel title="Secret configuration status" subtitle="Names are visible; values are never returned by the API" flush>
              {data.secretStatus.length === 0 ? (
                <EmptyState title="No secrets stored" description="Server env vars, headers and integration credentials appear here." />
              ) : (
                <div className="divide-y divide-line/60">
                  {data.secretStatus.map((entry) => (
                    <div key={`${entry.scope}-${entry.name}`} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone="violet">{entry.scope}</Badge>
                        <span className="text-[12.5px] text-slate-200">{entry.name}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {entry.keys.map((key) => (
                          <span key={key.key} className="mono rounded border border-line bg-surface-900 px-1.5 py-0.5 text-[10.5px] text-slate-400">
                            {key.key} = {key.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Encryption" subtitle="How secrets are protected at rest">
              <div className="grid gap-3 text-[11.5px] leading-relaxed text-slate-500 sm:grid-cols-3">
                <div>
                  <div className="mb-1 font-medium text-slate-300">At rest</div>
                  AES-256-GCM with a 32-byte master key stored in <span className="mono">data/master.key</span>.
                  Override with <span className="mono">MCPNEXUS_MASTER_KEY</span>.
                </div>
                <div>
                  <div className="mb-1 font-medium text-slate-300">In transit</div>
                  Values are only decrypted inside the server process when spawning a server or calling a provider.
                </div>
                <div>
                  <div className="mb-1 font-medium text-slate-300">In the UI</div>
                  Only masked previews are rendered. Saving a masked value leaves the stored secret untouched.
                </div>
              </div>
            </Panel>
          </>
        )}

        {tab === 'audit' && (
          <>
            <Panel title="Security events" subtitle="Authentication, approvals and denials" flush>
              <div className="max-h-[300px] divide-y divide-line/60 overflow-y-auto">
                {data.events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0">
                      <div className="mono truncate text-[11.5px] text-slate-200">{event.action}</div>
                      <div className="text-[10.5px] text-slate-600">
                        {event.actor} · {event.ip ?? 'local'} · {timeAgo(event.createdAt)}
                      </div>
                    </div>
                    <span className="max-w-[280px] truncate text-[10.5px] text-slate-500">
                      {JSON.stringify(event.detail)}
                    </span>
                  </div>
                ))}
                {data.events.length === 0 && <EmptyState title="No security events" />}
              </div>
            </Panel>
            <Panel title="Audit trail" subtitle="Every mutating API action is recorded" flush>
              <div className="max-h-[420px] overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Target</th>
                      <th>Detail</th>
                      <th className="text-right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(audit.data?.entries ?? []).map((entry) => (
                      <tr key={entry.id}>
                        <td className="mono text-[11.5px] text-slate-200">{entry.action}</td>
                        <td className="text-[11.5px] text-slate-400">{entry.actor}</td>
                        <td className="text-[11px] text-slate-500">{entry.targetType ?? '—'}</td>
                        <td className="max-w-[300px] truncate mono text-[10.5px] text-slate-500">
                          {JSON.stringify(entry.detail)}
                        </td>
                        <td className="text-right text-[11px] text-slate-500">{timeAgo(entry.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>

      <Modal
        open={userModal}
        onClose={() => setUserModal(false)}
        title="Add user"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUserModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void createUser()} loading={saving}>
              Create user
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={userForm.email}
              onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
            />
          </Field>
          <Field label="Initial password" hint="Minimum 8 characters. The user can rotate it in Settings.">
            <Input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
            />
          </Field>
          <Field label="Role">
            <Select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={policyModal}
        onClose={() => setPolicyModal(false)}
        title="New permission policy"
        description="Policies are evaluated for every tool execution and resource read."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPolicyModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void createPolicy()} loading={saving}>
              Create policy
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scope">
              <Select
                value={policyForm.scope}
                onChange={(event) => setPolicyForm({ ...policyForm, scope: event.target.value })}
              >
                <option value="global">global</option>
                <option value="role">role</option>
                <option value="user">user</option>
                <option value="server">server</option>
                <option value="tool">tool</option>
                <option value="tag">tag</option>
              </Select>
            </Field>
            <Field label="Subject" hint="Role name, email, server id, tool name or tag">
              <Input
                value={policyForm.subject}
                onChange={(event) => setPolicyForm({ ...policyForm, subject: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Permission">
              <Input
                value={policyForm.permission}
                onChange={(event) => setPolicyForm({ ...policyForm, permission: event.target.value })}
                className="input-mono"
              />
            </Field>
            <Field label="Effect">
              <Select
                value={policyForm.effect}
                onChange={(event) => setPolicyForm({ ...policyForm, effect: event.target.value })}
              >
                <option value="deny">deny</option>
                <option value="allow">allow</option>
              </Select>
            </Field>
          </div>
          <Field label="Requires approval">
            <Select
              value={policyForm.requiresApproval ? 'yes' : 'no'}
              onChange={(event) => setPolicyForm({ ...policyForm, requiresApproval: event.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Note">
            <Input value={policyForm.note} onChange={(event) => setPolicyForm({ ...policyForm, note: event.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
