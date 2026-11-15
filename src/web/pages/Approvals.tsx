import { Check, ShieldCheck, X } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.js';
import { PageHeader } from '../components/Layout.js';
import { SegmentedControl } from '../components/interactions.js';
import {
  Button,
  EmptyState,
  ErrorState,
  Modal,
  Panel,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui.js';
import { api, ApiError } from '../lib/api.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

type Approval = {
  id: string;
  serverId: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
};

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

export function ApprovalsPage() {
  const { can } = useAuth();
  const { push } = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Approval | null>(null);
  const [note, setNote] = useState('');

  const path = filter === 'all' ? '/api/approvals' : `/api/approvals?status=${filter}`;
  const data = useApi<{ approvals: Approval[] }>(path, { pollMs: 15000 });

  async function decide(approval: Approval, decision: 'approve' | 'reject', reason?: string) {
    setBusyId(approval.id);
    try {
      await api.post(`/api/approvals/${approval.id}/decide`, { decision, note: reason });
      push(decision === 'approve' ? 'Execution approved' : 'Execution rejected', 'ok');
      setRejecting(null);
      setNote('');
      data.reload();
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Decision failed', 'err');
    } finally {
      setBusyId(null);
    }
  }

  const rows = data.data?.approvals ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Approvals"
        subtitle="Calls that require an administrator decision before they reach an MCP server. Arguments are bound to the approval and consumed once."
        actions={
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            label="Approval status"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />

      {/* human-in-the-loop gate band */}
      <div className="panel mb-3 flex flex-wrap items-center gap-3 border-coral/20 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-coral/25 bg-coral/[0.08] text-coral">
          <ShieldCheck size={15} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-slate-200">Human-in-the-loop gate</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            Sensitive tools never reach a server until a decision is recorded here.
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {['arguments bound to the request', 'consumed exactly once', 'every decision audited'].map((fact) => (
            <span
              key={fact}
              className="rounded-full border border-line bg-surface-900/70 px-2 py-0.5 text-[9.5px] text-slate-500"
            >
              {fact}
            </span>
          ))}
        </div>
      </div>

      {data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : data.loading && !data.data ? (
        <Panel bodyClassName="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-16" />
          ))}
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ShieldCheck size={16} />}
            title={filter === 'pending' ? 'No pending approvals' : 'Nothing here yet'}
            description={
              filter === 'pending'
                ? 'Sensitive tool calls will park here until an administrator decides.'
                : 'Approvals appear here after a gated tool call is requested.'
            }
          />
        </Panel>
      ) : (
        <div className="space-y-2.5">
          {rows.map((approval) => (
            <Panel key={approval.id} bodyClassName="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[12.5px] font-medium text-slate-100">{approval.toolName}</span>
                    <StatusBadge status={approval.status} />
                    <Link
                      to={`/servers/${approval.serverId}`}
                      className="text-[11px] text-slate-500 transition-colors hover:text-slate-300"
                    >
                      {approval.serverName}
                    </Link>
                  </div>
                  <div className="mt-1 text-[10.5px] text-slate-500">
                    requested by {approval.requestedBy ?? 'unknown'} · {timeAgo(approval.createdAt)}
                    {approval.decidedBy ? ` · decided by ${approval.decidedBy} ${timeAgo(approval.decidedAt)}` : ''}
                  </div>
                  <pre className="code-block mt-2 max-h-[120px] max-w-[720px]">
                    {JSON.stringify(approval.arguments, null, 2)}
                  </pre>
                  {approval.note && (
                    <div className="mt-1.5 text-[10.5px] text-slate-500">note: {approval.note}</div>
                  )}
                </div>

                {approval.status === 'pending' && can('security:manage') && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busyId === approval.id}
                      onClick={() => void decide(approval, 'approve')}
                    >
                      <Check size={12} /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(approval)}>
                      <X size={12} /> Reject
                    </Button>
                  </div>
                )}
                {approval.status === 'pending' && !can('security:manage') && (
                  <span className="text-[11px] text-slate-500">Awaiting an administrator</span>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject execution"
        description={rejecting ? `${rejecting.toolName} on ${rejecting.serverName}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busyId === rejecting?.id}
              onClick={() => rejecting && void decide(rejecting, 'reject', note)}
            >
              Reject execution
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-slate-400">
            The requesting user will not be able to execute this call. The decision is written to the
            audit log.
          </p>
          <div>
            <div className="label">Reason (optional)</div>
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why is this call being rejected?"
            />
          </div>
          <div className="text-[10.5px] text-slate-600">Requested {rejecting ? formatDate(rejecting.createdAt) : ''}</div>
        </div>
      </Modal>
    </div>
  );
}
