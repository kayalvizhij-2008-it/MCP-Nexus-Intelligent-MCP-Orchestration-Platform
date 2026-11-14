import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncClass } from 'node:sqlite';
import { DB_PATH, NODE_ENV } from './config.js';

// Loaded via createRequire so bundlers do not attempt to resolve `node:sqlite`
// (Vite's builtin list does not include the sqlite module).
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncClass;
};

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  transport TEXT NOT NULL DEFAULT 'stdio',
  command TEXT,
  args TEXT NOT NULL DEFAULT '[]',
  cwd TEXT,
  url TEXT,
  env TEXT NOT NULL DEFAULT '',
  headers TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_start INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'stopped',
  status_message TEXT,
  last_error TEXT,
  capabilities TEXT,
  server_info TEXT,
  protocol_version TEXT,
  last_connected_at TEXT,
  last_health_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL DEFAULT '',
  input_schema TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL,
  UNIQUE(server_id, name)
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT,
  is_template INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL,
  UNIQUE(server_id, uri)
);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  arguments TEXT NOT NULL DEFAULT '[]',
  discovered_at TEXT NOT NULL,
  UNIQUE(server_id, name)
);

CREATE TABLE IF NOT EXISTS custom_prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL,
  arguments TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  server_name TEXT NOT NULL DEFAULT '',
  tool_name TEXT NOT NULL,
  arguments TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  result TEXT,
  error TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  user_id TEXT,
  user_email TEXT,
  approval_id TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_reads (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  status TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  user_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  requested_by_email TEXT,
  decided_by TEXT,
  decided_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config_versions (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  config TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  permission TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow',
  requires_approval INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_checked_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  checks TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_checks (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_logs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exec_created ON executions(created_at);
CREATE INDEX IF NOT EXISTS idx_exec_server ON executions(server_id);
CREATE INDEX IF NOT EXISTS idx_exec_tool ON executions(tool_name);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_health_server ON health_checks(server_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_logs_server ON server_logs(server_id, created_at);
CREATE INDEX IF NOT EXISTS idx_res_reads ON resource_reads(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at);
`;

db.exec(SCHEMA);

export function nowIso(): string {
  return new Date().toISOString();
}

export type Row = Record<string, any>;

export function all<T extends Row = Row>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T extends Row = Row>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Append a line to a server's captured log buffer (also mirrored in the UI). */
export function logServer(serverId: string, level: string, message: string) {
  const trimmed = message.length > 8000 ? `${message.slice(0, 8000)}…` : message;
  run(
    'INSERT INTO server_logs (id, server_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)',
    randomUUID(),
    serverId,
    level,
    trimmed,
    nowIso(),
  );
  // Keep the log buffer bounded so the DB does not grow without limit.
  run(
    `DELETE FROM server_logs WHERE server_id = ? AND id NOT IN (
       SELECT id FROM server_logs WHERE server_id = ? ORDER BY created_at DESC LIMIT 500
     )`,
    serverId,
    serverId,
  );
}

if (NODE_ENV === 'test') {
  // Tests point MCPNEXUS_DATA_DIR at a temp folder; nothing else to do here.
}
