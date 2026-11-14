import { all, db, nowIso, run } from './db.js';

type Migration = { id: string; description: string; up: () => void };

/**
 * Ordered migrations. The baseline tables are created idempotently by db.ts on
 * boot; the runner records which versions have been applied so future schema
 * changes are traceable and applied exactly once.
 */
const MIGRATIONS: Migration[] = [
  {
    id: '001-baseline',
    description: 'Baseline schema: servers, tools, resources, prompts, executions, audit',
    up: () => undefined,
  },
  {
    id: '002-execution-indexes',
    description: 'Indexes for execution timeline and per-tool analytics',
    up: () => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_exec_created ON executions(created_at);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_exec_tool ON executions(tool_name);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_exec_status ON executions(status);');
    },
  },
  {
    id: '003-approval-consumption',
    description: 'Track which approval authorised an execution',
    up: () => {
      db.exec("UPDATE approvals SET status = 'pending' WHERE status IS NULL;");
    },
  },
  {
    id: '004-health-retention',
    description: 'Bound the health check history per server',
    up: () => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_health_server ON health_checks(server_id, checked_at);');
    },
  },
];

export function runMigrations(): { applied: string[]; pending: string[] } {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  const applied = new Set(all<{ id: string }>('SELECT id FROM schema_migrations').map((r) => r.id));
  const newlyApplied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    migration.up();
    run(
      'INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)',
      migration.id,
      migration.description,
      nowIso(),
    );
    newlyApplied.push(migration.id);
  }
  return {
    applied: newlyApplied,
    pending: MIGRATIONS.filter((m) => !applied.has(m.id)).map((m) => m.id),
  };
}

export function migrationStatus() {
  return all<{ id: string; description: string; applied_at: string }>(
    'SELECT id, description, applied_at FROM schema_migrations ORDER BY id',
  );
}
