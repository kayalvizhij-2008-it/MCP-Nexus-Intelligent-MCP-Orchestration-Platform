export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { ok: false, error: text.slice(0, 400) };
  }
  if (!response.ok || body?.ok === false) {
    const error = new ApiError(
      body?.error ?? `Request failed with status ${response.status}`,
      response.status,
      body?.details,
    );
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('nexus:unauthorised'));
    }
    throw error;
  }
  return body as T;
}

/** Fetch a same-origin endpoint and save it through the browser's download flow. */
async function download(path: string, filename: string): Promise<void> {
  const response = await fetch(path, { credentials: 'include' });
  const text = await response.text();
  if (!response.ok) {
    let message = `Download failed with status ${response.status}`;
    try {
      message = JSON.parse(text).error ?? message;
    } catch {
      /* keep the status message */
    }
    throw new ApiError(message, response.status);
  }
  const blob = new Blob([text], { type: response.headers.get('content-type') ?? 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  download,
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};


export type ServerDto = {
  id: string;
  name: string;
  slug: string;
  description: string;
  transport: 'stdio' | 'http';
  command: string | null;
  args: string[];
  cwd: string | null;
  url: string | null;
  tags: string[];
  enabled: boolean;
  autoStart: boolean;
  status: string;
  statusMessage: string | null;
  lastError: string | null;
  capabilities: Record<string, unknown>;
  serverInfo: { name?: string; version?: string };
  protocolVersion: string | null;
  lastConnectedAt: string | null;
  lastHealthAt: string | null;
  createdAt: string;
  updatedAt: string;
  connected: boolean;
  counts: { tools: number; resources: number; prompts: number };
  envKeys: string[];
  headerKeys: string[];
};

export type ToolDto = {
  id: string;
  serverId: string;
  serverName: string | null;
  name: string;
  title: string | null;
  description: string;
  inputSchema: any;
  enabled: boolean;
  requiresApproval: boolean;
  discoveredAt: string;
};

export type ResourceDto = {
  id: string;
  serverId: string;
  serverName: string;
  uri: string;
  name: string;
  description: string;
  mimeType: string | null;
  isTemplate: boolean;
  discoveredAt: string;
};

export type PromptDto = {
  id: string;
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
  discoveredAt: string;
};

export type UserDto = { id: string; email: string; name: string; role: 'admin' | 'operator' | 'viewer' };

export type ExecutionDto = {
  id: string;
  serverId: string;
  serverName: string;
  toolName: string;
  status: string;
  arguments: Record<string, unknown>;
  result: any;
  error: string | null;
  durationMs: number;
  isError: boolean;
  actor: string | null;
  createdAt: string;
  text?: string | null;
};

export type OverviewDto = {
  servers: { total: number; running: number; stopped: number; errors: number };
  tools: { total: number; enabled: number };
  resources: { total: number; reads24h: number };
  prompts: { total: number };
  requests: { last24h: number; failed24h: number; allTime: number; allTimeFailed: number; today: number };
  performance: { successRate: number | null; avgLatencyMs: number | null; slowestMs: number | null };
  pendingApprovals: number;
  recentExecutions: ExecutionDto[];
  activity: Array<{
    id: string;
    kind: string;
    subject: string;
    context: string;
    status: string;
    actor: string;
    createdAt: string;
  }>;
  serverHealth: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    transport: string;
    lastError: string | null;
    tools: number;
    lastConnectedAt: string | null;
  }>;
  generatedAt: string;
};
