import fs from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_DIR } from './config.js';
import { decryptJson, encryptJson, maskSecretMap, SECRET_PLACEHOLDER } from './crypto.js';
import { all, get, nowIso, run } from './db.js';

type FieldType = 'text' | 'password' | 'url';

export type IntegrationField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
};

export type IntegrationDefinition = {
  key: string;
  name: string;
  category: string;
  description: string;
  fields: IntegrationField[];
  capabilities: string[];
  docs?: string;
  test: (config: Record<string, string>) => Promise<{ ok: boolean; message: string; details?: unknown }>;
};

async function fetchJson(url: string, init: RequestInit, timeoutMs = 12000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { response, body, text };
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    key: 'github',
    name: 'GitHub',
    category: 'Source control',
    description: 'Repositories, issues and pull requests through the GitHub REST API.',
    docs: 'https://docs.github.com/en/rest',
    fields: [
      { key: 'token', label: 'Personal access token', type: 'password', required: true, help: 'Read scopes are enough for inspection.' },
      { key: 'owner', label: 'Default owner / organisation', type: 'text', required: false, placeholder: 'modelcontextprotocol' },
    ],
    capabilities: ['List repositories', 'Read repository metadata', 'List open issues'],
    async test(config) {
      if (!config.token) return { ok: false, message: 'A personal access token is required' };
      const { response, body } = await fetchJson('https://api.github.com/user', {
        headers: {
          authorization: `Bearer ${config.token}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'mcpnexus',
        },
      });
      if (!response.ok) {
        return { ok: false, message: `GitHub responded ${response.status}`, details: sanitize(body) };
      }
      const user = body as any;
      return {
        ok: true,
        message: `Authenticated as ${user.login}`,
        details: { login: user.login, publicRepos: user.public_repos, plan: user.plan?.name ?? null },
      };
    },
  },
  {
    key: 'filesystem',
    name: 'Filesystem',
    category: 'Local systems',
    description: 'Sandboxed workspace access via the Nexus Filesystem MCP server.',
    fields: [],
    capabilities: ['List workspace', 'Read files', 'Write files (approval required)', 'Search content'],
    async test() {
      const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
      return {
        ok: true,
        message: `Workspace reachable with ${entries.length} entries`,
        details: { root: WORKSPACE_DIR, entries: entries.map((e) => e.name) },
      };
    },
  },
  {
    key: 'database',
    name: 'Database',
    category: 'Data',
    description: 'Read-only SQL against the MCPNEXUS platform database.',
    fields: [],
    capabilities: ['List tables', 'Run read-only queries', 'Row counts'],
    async test() {
      const tables = all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      return {
        ok: true,
        message: `Platform database reachable (${tables.length} tables)`,
        details: { tables: tables.map((t) => t.name) },
      };
    },
  },
  {
    key: 'rest-api',
    name: 'REST API',
    category: 'External services',
    description: 'Call any HTTP JSON endpoint with an optional bearer token.',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.example.com/health' },
      { key: 'token', label: 'Bearer token', type: 'password', required: false },
    ],
    capabilities: ['GET requests', 'Custom headers', 'JSON responses'],
    async test(config) {
      if (!config.baseUrl) return { ok: false, message: 'A base URL is required' };
      const { response, body } = await fetchJson(config.baseUrl, {
        headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
      });
      return {
        ok: response.ok,
        message: `${response.status} ${response.statusText}`,
        details: sanitize(body),
      };
    },
  },
  {
    key: 'documents',
    name: 'Documents',
    category: 'Content',
    description: 'Extract and summarise text from files in the Nexus workspace.',
    fields: [],
    capabilities: ['Text extraction', 'Word counts', 'Document summaries'],
    async test() {
      const files: string[] = [];
      async function walk(dir: string, depth = 0) {
        if (depth > 3) return;
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full, depth + 1);
          else if (/\.(md|txt|json|ya?ml|csv|log)$/i.test(entry.name)) files.push(full);
        }
      }
      await walk(WORKSPACE_DIR);
      return {
        ok: true,
        message: `${files.length} readable documents found`,
        details: { documents: files.map((f) => path.relative(WORKSPACE_DIR, f)) },
      };
    },
  },
  {
    key: 'webhook',
    name: 'Webhook',
    category: 'Automation',
    description: 'Deliver signed JSON events to an external endpoint.',
    fields: [
      { key: 'url', label: 'Destination URL', type: 'url', required: true, placeholder: 'https://example.com/hooks/mcpnexus' },
      { key: 'secret', label: 'Signing secret', type: 'password', required: false },
    ],
    capabilities: ['Test delivery', 'JSON payloads', 'Optional shared secret'],
    async test(config) {
      if (!config.url) return { ok: false, message: 'A destination URL is required' };
      const { response } = await fetchJson(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.secret ? { 'x-nexus-secret': config.secret } : {}),
        },
        body: JSON.stringify({ event: 'nexus.test', sentAt: nowIso(), platform: 'MCPNEXUS' }),
      });
      return { ok: response.ok, message: `Destination responded ${response.status}` };
    },
  },
];

export function integrationDefinitions(): Array<
  Omit<IntegrationDefinition, 'test'> & {
    enabled: boolean;
    status: string;
    config: Record<string, string>;
    lastCheckedAt: string | null;
    lastError: string | null;
  }
> {
  return INTEGRATIONS.map((definition) => {
    const row = get<any>('SELECT * FROM integrations WHERE key = ?', definition.key);
    const config = row ? decryptJson<Record<string, string>>(row.config) : {};
    return {
      ...definition,
      test: undefined as never,
      enabled: Boolean(row?.enabled),
      status: row?.status ?? 'disconnected',
      config: maskSecretMap(config),
      lastCheckedAt: row?.last_checked_at ?? null,
      lastError: row?.last_error ?? null,
    };
  }).map(({ test, ...rest }: any) => rest);
}

export function getIntegrationRow(key: string) {
  return get<any>('SELECT * FROM integrations WHERE key = ?', key);
}

export function getDefinition(key: string) {
  return INTEGRATIONS.find((i) => i.key === key);
}

/**
 * Merge submitted fields into stored config. Secret fields that still contain
 * the masked placeholder are left untouched.
 */
export function updateIntegrationConfig(key: string, submitted: Record<string, string>) {
  const row = getIntegrationRow(key);
  if (!row) throw new Error('Integration not found');
  const current = decryptJson<Record<string, string>>(row.config);
  const next = { ...current };
  for (const [field, value] of Object.entries(submitted)) {
    if (value === SECRET_PLACEHOLDER || value === undefined) continue;
    if (value === '') {
      delete next[field];
      continue;
    }
    next[field] = value;
  }
  run(
    'UPDATE integrations SET config = ?, enabled = 1 WHERE key = ?',
    encryptJson(next),
    key,
  );
  return maskedConfig(next);
}

export function maskedConfig(config: Record<string, string>) {
  return maskSecretMap(config);
}

export async function testIntegration(key: string) {
  const definition = getDefinition(key);
  const row = getIntegrationRow(key);
  if (!definition || !row) throw new Error('Integration not found');
  const config = decryptJson<Record<string, string>>(row.config);
  try {
    const result = await definition.test(config);
    run(
      'UPDATE integrations SET status = ?, last_checked_at = ?, last_error = ? WHERE key = ?',
      result.ok ? 'connected' : 'error',
      nowIso(),
      result.ok ? null : result.message,
      key,
    );
    return result;
  } catch (error: any) {
    const message = error?.message ?? String(error);
    run(
      'UPDATE integrations SET status = ?, last_checked_at = ?, last_error = ? WHERE key = ?',
      'error',
      nowIso(),
      message,
      key,
    );
    return { ok: false, message };
  }
}

/** Read-only SQL execution for the Database integration. */
export function runReadOnlyQuery(sql: string) {
  const trimmed = sql.trim().replace(/;$/, '');
  if (!/^(select|with|pragma\s+table_info)\b/i.test(trimmed)) {
    throw new Error('Only read-only SELECT / WITH statements are allowed');
  }
  if (/;\s*\S/.test(trimmed)) throw new Error('Only one statement is allowed');
  const rows = all(trimmed).slice(0, 500);
  return { rows: rows.length, data: rows };
}

export async function extractDocument(relativePath: string) {
  const resolved = path.resolve(WORKSPACE_DIR, relativePath);
  if (!resolved.startsWith(WORKSPACE_DIR)) throw new Error('Path escapes the workspace');
  const text = await fs.readFile(resolved, 'utf8');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return {
    path: path.relative(WORKSPACE_DIR, resolved),
    characters: text.length,
    words,
    lines: text.split(/\r?\n/).length,
    preview: text.slice(0, 4000),
  };
}

function sanitize(value: unknown) {
  const text = JSON.stringify(value);
  if (!text) return null;
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : JSON.parse(text);
}

