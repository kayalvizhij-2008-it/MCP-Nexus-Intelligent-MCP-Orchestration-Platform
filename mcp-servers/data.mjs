#!/usr/bin/env node
/**
 * Nexus Data — an MCP server that exposes a real SQLite database.
 * Demonstrates MCP "database connectivity" without any mock layer.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';

const dbDir = process.argv.find((a) => a.startsWith('--dir='))?.slice('--dir='.length) || path.resolve('data');
fs.mkdirSync(dbDir, { recursive: true });
const db = new DatabaseSync(path.join(dbDir, 'analytics.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL,
  region TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, amount REAL NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
`);

const seeded = db.prepare('SELECT COUNT(*) AS count FROM customers').get().count === 0;
if (seeded) {
  const customers = db.prepare('INSERT INTO customers (name, plan, region, created_at) VALUES (?, ?, ?, ?)');
  const plans = ['starter', 'growth', 'scale', 'enterprise'];
  const regions = ['eu-west', 'us-east', 'ap-south', 'us-west'];
  for (let i = 1; i <= 40; i++) {
    customers.run(
      `Customer ${String(i).padStart(2, '0')}`,
      plans[i % plans.length],
      regions[i % regions.length],
      new Date(Date.UTC(2026, i % 12, (i % 27) + 1)).toISOString(),
    );
  }
  const orders = db.prepare('INSERT INTO orders (customer_id, amount, status, created_at) VALUES (?, ?, ?, ?)');
  const statuses = ['paid', 'paid', 'paid', 'refunded', 'pending'];
  for (let i = 1; i <= 160; i++) {
    orders.run(
      (i % 40) + 1,
      Math.round((80 + ((i * 37) % 900)) * 100) / 100,
      statuses[i % statuses.length],
      new Date(Date.UTC(2026, i % 12, (i % 27) + 1)).toISOString(),
    );
  }
}

const READ_ONLY = /^\s*(select|with|pragma\s+table_info)\b/i;
const server = new McpServer(
  { name: 'nexus-data', version: '1.0.0' },
  { instructions: 'Read-only SQL access to a sample analytics SQLite database (customers, orders).' },
);

const text = (value) => ({ content: [{ type: 'text', text: value }] });

server.registerTool(
  'list_tables',
  {
    title: 'List tables',
    description: 'List every table in the analytics database with its row count.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    const rows = tables.map((t) => ({
      table: t.name,
      rows: db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c,
    }));
    return text(JSON.stringify(rows, null, 2));
  },
);

server.registerTool(
  'describe_table',
  {
    title: 'Describe table',
    description: 'Show column definitions for a table.',
    inputSchema: { table: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ table }) => {
    const info = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '')}")`).all();
    if (!info.length) {
      return { content: [{ type: 'text', text: `Unknown table: ${table}` }], isError: true };
    }
    return text(JSON.stringify(info, null, 2));
  },
);

server.registerTool(
  'sql_query',
  {
    title: 'Run read-only SQL',
    description: 'Execute a single SELECT/WITH statement and return the rows as JSON (max 200 rows).',
    inputSchema: { sql: z.string().min(1).describe('A read-only SQL statement') },
    annotations: { readOnlyHint: true },
  },
  async ({ sql }) => {
    if (!READ_ONLY.test(sql)) {
      return {
        content: [{ type: 'text', text: 'Only SELECT / WITH statements are permitted' }],
        isError: true,
      };
    }
    if (/;\s*\S/.test(sql.trim())) {
      return { content: [{ type: 'text', text: 'Only a single statement is permitted' }], isError: true };
    }
    try {
      const rows = db.prepare(sql.trim().replace(/;$/, '')).all().slice(0, 200);
      return text(JSON.stringify({ rows: rows.length, data: rows }, null, 2));
    } catch (error) {
      return { content: [{ type: 'text', text: `SQL error: ${error.message}` }], isError: true };
    }
  },
);

server.registerTool(
  'revenue_by_plan',
  {
    title: 'Revenue by plan',
    description: 'Aggregate paid order revenue per customer plan.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const rows = db
      .prepare(
        `SELECT c.plan, COUNT(o.id) AS orders, ROUND(SUM(o.amount), 2) AS revenue
           FROM orders o JOIN customers c ON c.id = o.customer_id
          WHERE o.status = 'paid'
          GROUP BY c.plan ORDER BY revenue DESC`,
      )
      .all();
    return text(JSON.stringify(rows, null, 2));
  },
);

server.registerResource(
  'data-schema',
  'nexus://data/schema',
  {
    title: 'Database schema',
    description: 'Full SQLite schema for the analytics database.',
    mimeType: 'application/json',
  },
  async () => {
    const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all();
    return {
      contents: [
        {
          uri: 'nexus://data/schema',
          mimeType: 'application/json',
          text: JSON.stringify(rows, null, 2),
        },
      ],
    };
  },
);

server.registerResource(
  'data-table',
  'nexus://data/table/{name}',
  {
    title: 'Table preview',
    description: 'Preview the first 20 rows of a table.',
    mimeType: 'application/json',
  },
  async (uri, variables) => {
    const name = String(variables?.name ?? '').replace(/[^a-zA-Z0-9_]/g, '');
    const rows = db.prepare(`SELECT * FROM "${name}" LIMIT 20`).all();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(rows, null, 2),
        },
      ],
    };
  },
);

server.registerPrompt(
  'analyze_revenue',
  {
    title: 'Analyze revenue',
    description: 'Ask a model to interpret revenue data returned by this server.',
    argsSchema: {
      period: z.string().optional(),
      question: z.string().optional(),
    },
  },
  ({ period, question }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Using the nexus-data MCP tools, analyse revenue for ${period ?? 'the current year'}.\nQuestion: ${question ?? 'Which plan drives the most revenue and why?'}\nReturn a short written analysis with the numbers you used.`,
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
