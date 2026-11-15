import { Bell, BookOpen, FolderTree } from 'lucide-react';
import React, { useState } from 'react';
import { PageHeader } from '../components/Layout.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  JsonBlock,
  LoadingBlock,
  Modal,
  Panel,
  Select,
  StatusBadge,
  useToast,
} from '../components/ui.js';
import { api, ApiError, type ResourceDto, type ServerDto } from '../lib/api.js';
import { formatMs, timeAgo } from '../lib/format.js';
import { useApi } from '../lib/useApi.js';

export function ResourcesPage() {
  const { push } = useToast();
  const servers = useApi<{ servers: ServerDto[] }>('/api/servers');
  const resources = useApi<{ resources: ResourceDto[] }>('/api/resources', { pollMs: 20000 });
  const notifications = useApi<{
    notifications: Array<{ id: string; serverName: string; kind: string; payload: any; createdAt: string }>;
  }>('/api/notifications?limit=20', { pollMs: 15000 });

  const [serverFilter, setServerFilter] = useState('all');
  const [reading, setReading] = useState<ResourceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<{ contents: any[]; durationMs: number } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const rows = (resources.data?.resources ?? []).filter(
    (resource) => serverFilter === 'all' || resource.serverId === serverFilter,
  );

  async function read(resource: ResourceDto) {
    setReading(resource);
    setContent(null);
    setReadError(null);
    setLoading(true);
    try {
      const response = await api.post<{ contents: any[]; durationMs: number }>('/api/resources/read', {
        serverId: resource.serverId,
        uri: resource.uri,
      });
      setContent(response);
    } catch (error) {
      setReadError(error instanceof ApiError ? error.message : 'Read failed');
      push('Resource read failed', 'err');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Infrastructure"
        title="Resource Explorer"
        subtitle="Static resources and URI templates discovered from every connected MCP server, read over the real protocol."
        actions={<Badge tone="info">{rows.length} resources</Badge>}
      />

      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
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
          </div>

          {resources.loading && !resources.data && <LoadingBlock />}
          {resources.error && <ErrorState error={resources.error} onRetry={resources.reload} />}

          <Panel title="Discovered resources" subtitle="resources/list and resources/templates/list" flush>
            {rows.length === 0 ? (
              <EmptyState
                title="No resources discovered"
                description="Servers that expose resources will appear here after their MCP session starts."
                icon={<FolderTree size={16} />}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Server</th>
                      <th>Type</th>
                      <th className="text-right">Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((resource) => (
                      <tr key={resource.id}>
                        <td>
                          <div className="mono break-all text-[11.5px] text-slate-200">{resource.uri}</div>
                          <div className="text-[11px] text-slate-500">
                            {resource.name} {resource.mimeType ? `· ${resource.mimeType}` : ''}
                          </div>
                        </td>
                        <td className="text-[11.5px] text-slate-400">{resource.serverName}</td>
                        <td>
                          <Badge tone={resource.isTemplate ? 'violet' : 'muted'}>
                            {resource.isTemplate ? 'template' : 'static'}
                          </Badge>
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => void read(resource)}>
                            <BookOpen size={11} /> Read
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title="Resource update notifications"
          subtitle="Server-pushed resources/updated events"
          flush
          actions={<Bell size={13} className="text-slate-500" />}
        >
          {(notifications.data?.notifications ?? []).length === 0 ? (
            <EmptyState
              title="No notifications"
              description="MCPNEXUS subscribes to resource updates from every connected server."
            />
          ) : (
            <div className="max-h-[560px] divide-y divide-line/60 overflow-y-auto">
              {notifications.data!.notifications.map((notification) => (
                <div key={notification.id} className="px-4 py-2.5">
                  <div className="mono truncate text-[11.5px] text-slate-200">
                    {notification.payload?.uri ?? notification.kind}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-600">
                    <span>{notification.serverName}</span>
                    <StatusBadge status="info" label={notification.kind} />
                    <span>{timeAgo(notification.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.uri ?? 'Resource'}
        description={reading ? `${reading.serverName} · ${reading.mimeType ?? 'unknown type'}` : undefined}
        width="max-w-3xl"
      >
        {loading && <LoadingBlock label="Calling resources/read" />}
        {readError && <ErrorState error={readError} />}
        {content && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="ok">{content.contents.length} content part(s)</Badge>
              <Badge tone="muted">{formatMs(content.durationMs)}</Badge>
            </div>
            {content.contents.map((part, index) =>
              part.blob ? (
                <div key={index} className="code-block">
                  Binary payload ({part.mimeType ?? 'unknown'}) · {part.blob.length} base64 characters
                </div>
              ) : (
                <pre key={index} className="code-block max-h-[420px] whitespace-pre-wrap">
                  {part.text}
                </pre>
              ),
            )}
            <JsonBlock value={content.contents} maxHeight={200} />
          </div>
        )}
      </Modal>
    </div>
  );
}
