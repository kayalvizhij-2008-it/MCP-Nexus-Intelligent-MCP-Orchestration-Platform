#!/usr/bin/env node
/**
 * Nexus Filesystem — a sandboxed MCP server exposing a directory tree as
 * tools, resources and prompts. Every path is confined to the configured root.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const rootArg = process.argv.find((a) => a.startsWith('--root='));
const ROOT = path.resolve(rootArg ? rootArg.slice('--root='.length) : process.env.NEXUS_FS_ROOT || process.cwd());

await fs.mkdir(ROOT, { recursive: true });

/** Resolve a user-supplied relative path inside the sandbox root. */
function safePath(relative) {
  const cleaned = String(relative ?? '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(ROOT, cleaned);
  const relativeToRoot = path.relative(ROOT, resolved);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Path escapes the sandbox root: ${relative}`);
  }
  return resolved;
}

const MAX_READ_BYTES = 256 * 1024;
const text = (value) => ({ content: [{ type: 'text', text: value }] });

const server = new McpServer(
  { name: 'nexus-filesystem', version: '1.0.0' },
  {
    instructions:
      'Sandboxed file access. All paths are relative to the workspace root and cannot escape it.',
  },
);

server.registerTool(
  'list_directory',
  {
    title: 'List directory',
    description: 'List files and folders inside the sandbox root.',
    inputSchema: { path: z.string().default('').describe('Directory path relative to the root') },
    annotations: { readOnlyHint: true },
  },
  async ({ path: relative }) => {
    const target = safePath(relative);
    const entries = await fs.readdir(target, { withFileTypes: true });
    const rows = await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(target, entry.name);
        const stat = await fs.stat(full).catch(() => null);
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stat?.size ?? 0,
          modified: stat?.mtime?.toISOString() ?? null,
        };
      }),
    );
    return text(JSON.stringify({ root: ROOT, path: relative || '.', entries: rows }, null, 2));
  },
);

server.registerTool(
  'read_file',
  {
    title: 'Read file',
    description: 'Read a UTF-8 text file from the sandbox (up to 256 KiB).',
    inputSchema: { path: z.string().describe('File path relative to the root') },
    annotations: { readOnlyHint: true },
  },
  async ({ path: relative }) => {
    const target = safePath(relative);
    const stat = await fs.stat(target);
    if (stat.isDirectory()) throw new Error(`${relative} is a directory`);
    if (stat.size > MAX_READ_BYTES) {
      throw new Error(`File is too large (${stat.size} bytes, limit ${MAX_READ_BYTES})`);
    }
    const content = await fs.readFile(target, 'utf8');
    return text(content);
  },
);

server.registerTool(
  'write_file',
  {
    title: 'Write file',
    description: 'Create or overwrite a UTF-8 text file inside the sandbox.',
    inputSchema: {
      path: z.string().describe('File path relative to the root'),
      content: z.string().describe('Full file content'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ path: relative, content }) => {
    const target = safePath(relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    return text(`Wrote ${content.length} characters to ${relative}`);
  },
);

server.registerTool(
  'search_files',
  {
    title: 'Search files',
    description: 'Search file names and text content for a query inside the sandbox.',
    inputSchema: {
      query: z.string().min(1),
      path: z.string().default(''),
      maxResults: z.number().int().min(1).max(100).default(25),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, path: relative, maxResults }) => {
    const startDir = safePath(relative);
    const needle = query.toLowerCase();
    const results = [];

    async function walk(dir, depth = 0) {
      if (results.length >= maxResults || depth > 6) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
          continue;
        }
        const rel = path.relative(ROOT, full);
        if (entry.name.toLowerCase().includes(needle)) {
          results.push({ path: rel, match: 'name' });
          continue;
        }
        const stat = await fs.stat(full).catch(() => null);
        if (!stat || stat.size > 128 * 1024) continue;
        const content = await fs.readFile(full, 'utf8').catch(() => '');
        const index = content.toLowerCase().indexOf(needle);
        if (index >= 0) {
          results.push({
            path: rel,
            match: 'content',
            preview: content.slice(Math.max(0, index - 40), index + needle.length + 60),
          });
        }
      }
    }

    await walk(startDir);
    return text(JSON.stringify({ query, matches: results.length, results }, null, 2));
  },
);

server.registerTool(
  'file_info',
  {
    title: 'File info',
    description: 'Show size, type and timestamps for a sandbox path.',
    inputSchema: { path: z.string().min(1) },
    annotations: { readOnlyHint: true },
  },
  async ({ path: relative }) => {
    const target = safePath(relative);
    const stat = await fs.stat(target);
    return text(
      JSON.stringify(
        {
          path: relative,
          size: stat.size,
          directory: stat.isDirectory(),
          mode: `0${(stat.mode & 0o777).toString(8)}`,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
        },
        null,
        2,
      ),
    );
  },
);

server.registerResource(
  'sandbox-root',
  'nexus://fs/root',
  {
    title: 'Sandbox root',
    description: 'Summary of the sandboxed workspace directory.',
    mimeType: 'application/json',
  },
  async () => {
    const entries = await fs.readdir(ROOT, { withFileTypes: true });
    return {
      contents: [
        {
          uri: 'nexus://fs/root',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              root: ROOT,
              platform: os.platform(),
              entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerResource(
  'sandbox-file',
  'nexus://fs/{path}',
  {
    title: 'Sandbox file',
    description: 'Read any text file inside the sandbox by using a resource template.',
    mimeType: 'text/plain',
  },
  async (uri, variables) => {
    const target = safePath(String(variables?.path ?? ''));
    const content = await fs.readFile(target, 'utf8');
    return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: content }] };
  },
);

server.registerPrompt(
  'explain_file',
  {
    title: 'Explain a file',
    description: 'Generate a prompt that asks a model to explain a file in the sandbox.',
    argsSchema: { path: z.string() },
  },
  async ({ path: relative }) => {
    const target = safePath(relative);
    const content = await fs.readFile(target, 'utf8').catch(() => '(file could not be read)');
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Explain what this file does, then list risks and improvement ideas.\n\nFile: ${relative}\n\n${content.slice(0, 8000)}`,
          },
        },
      ],
    };
  },
);

await server.connect(new StdioServerTransport());
