#!/usr/bin/env node
/**
 * Nexus Toolbox — a first-party MCP server built on the official
 * @modelcontextprotocol/sdk. Used by MCPNEXUS as a live, real MCP target.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import os from 'node:os';
import { createHash } from 'node:crypto';

const server = new McpServer(
  { name: 'nexus-toolbox', version: '1.0.0' },
  {
    instructions:
      'Utility toolbox for MCPNEXUS: computation, hashing, text analysis, runtime introspection and guarded outbound HTTP.',
  },
);

const startedAt = Date.now();

/* ------------------------------- safe math ------------------------------- */
function tokenize(expression) {
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expression.length && /[0-9.]/.test(expression[i])) num += expression[i++];
      if (Number.isNaN(Number(num))) throw new Error(`Invalid number: ${num}`);
      tokens.push({ type: 'number', value: Number(num) });
      continue;
    }
    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Unsupported character: ${ch}`);
  }
  return tokens;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

function evaluate(expression) {
  const tokens = tokenize(expression);
  const output = [];
  const ops = [];
  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token.value);
    } else if (token.value === '(') {
      ops.push(token.value);
    } else if (token.value === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop());
      if (!ops.length) throw new Error('Unbalanced parentheses');
      ops.pop();
    } else {
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[token.value] &&
        token.value !== '^'
      ) {
        output.push(ops.pop());
      }
      ops.push(token.value);
    }
  }
  while (ops.length) {
    const op = ops.pop();
    if (op === '(') throw new Error('Unbalanced parentheses');
    output.push(op);
  }
  const stack = [];
  for (const item of output) {
    if (typeof item === 'number') {
      stack.push(item);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) throw new Error('Malformed expression');
    switch (item) {
      case '+': stack.push(a + b); break;
      case '-': stack.push(a - b); break;
      case '*': stack.push(a * b); break;
      case '/':
        if (b === 0) throw new Error('Division by zero');
        stack.push(a / b);
        break;
      case '%':
        if (b === 0) throw new Error('Division by zero');
        stack.push(a % b);
        break;
      case '^': stack.push(a ** b); break;
      default: throw new Error(`Unknown operator ${item}`);
    }
  }
  if (stack.length !== 1) throw new Error('Malformed expression');
  return stack[0];
}

const text = (value) => ({ content: [{ type: 'text', text: value }] });

server.registerTool(
  'echo',
  {
    title: 'Echo',
    description: 'Return the supplied message unchanged. Useful for connectivity checks.',
    inputSchema: { message: z.string().describe('Text to echo back') },
  },
  async ({ message }) => text(message),
);

server.registerTool(
  'calculate',
  {
    title: 'Calculate',
    description: 'Evaluate an arithmetic expression (+, -, *, /, %, ^ and parentheses).',
    inputSchema: { expression: z.string().describe('Arithmetic expression, e.g. (12+4)*3.5') },
  },
  async ({ expression }) => {
    try {
      return text(`${expression} = ${evaluate(expression)}`);
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  },
);

server.registerTool(
  'system_info',
  {
    title: 'System info',
    description: 'Report the runtime host: platform, CPU, memory, node version and process uptime.',
    inputSchema: {},
  },
  async () =>
    text(
      JSON.stringify(
        {
          platform: process.platform,
          arch: process.arch,
          release: os.release(),
          node: process.version,
          cpus: os.cpus().length,
          totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
          freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
          loadAverage: os.loadavg(),
          serverUptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          pid: process.pid,
        },
        null,
        2,
      ),
    ),
);

server.registerTool(
  'hash_text',
  {
    title: 'Hash text',
    description: 'Compute a digest of the supplied text using sha256, sha1 or md5.',
    inputSchema: {
      text: z.string().min(1),
      algorithm: z.enum(['sha256', 'sha1', 'md5']).default('sha256'),
    },
  },
  async ({ text: value, algorithm }) =>
    text(createHash(algorithm ?? 'sha256').update(value).digest('hex')),
);

server.registerTool(
  'text_stats',
  {
    title: 'Text statistics',
    description: 'Count characters, words, lines and reading time for a block of text.',
    inputSchema: { text: z.string() },
  },
  async ({ text: value }) => {
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    return text(
      JSON.stringify(
        {
          characters: value.length,
          charactersNoSpaces: value.replace(/\s/g, '').length,
          words,
          lines: value.split(/\r?\n/).length,
          readingTimeMinutes: Math.max(1, Math.round(words / 220)),
        },
        null,
        2,
      ),
    );
  },
);

server.registerTool(
  'http_fetch',
  {
    title: 'HTTP fetch',
    description:
      'Perform a guarded outbound HTTP GET request to an http(s) URL and return the status, headers and a truncated body.',
    inputSchema: {
      url: z.string().url().describe('Absolute http(s) URL'),
      maxBytes: z.number().int().min(256).max(20000).default(4000),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ url, maxBytes }) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { content: [{ type: 'text', text: 'Only http(s) URLs are allowed' }], isError: true };
    }
    try {
      const response = await fetch(parsed, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: { 'user-agent': 'mcpnexus-toolbox/1.0' },
      });
      const body = await response.text();
      const truncated = body.length > maxBytes;
      return text(
        JSON.stringify(
          {
            status: response.status,
            ok: response.ok,
            url: response.url,
            contentType: response.headers.get('content-type'),
            bytes: body.length,
            truncated,
            body: truncated ? body.slice(0, maxBytes) : body,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return { content: [{ type: 'text', text: `Request failed: ${error.message}` }], isError: true };
    }
  },
);

/* ------------------------------- resources ------------------------------- */

server.registerResource(
  'toolbox-about',
  'nexus://toolbox/about',
  {
    title: 'About the Nexus Toolbox',
    description: 'Metadata about this MCP server implementation.',
    mimeType: 'application/json',
  },
  async () => ({
    contents: [
      {
        uri: 'nexus://toolbox/about',
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            name: 'nexus-toolbox',
            version: '1.0.0',
            sdk: '@modelcontextprotocol/sdk',
            transport: 'stdio',
            tools: ['echo', 'calculate', 'system_info', 'hash_text', 'text_stats', 'http_fetch'],
            prompts: ['summarize', 'code_review', 'incident_report'],
          },
          null,
          2,
        ),
      },
    ],
  }),
);

server.registerResource(
  'toolbox-runtime',
  'nexus://toolbox/runtime',
  {
    title: 'Runtime snapshot',
    description: 'Live process metrics for the toolbox server.',
    mimeType: 'application/json',
  },
  async () => ({
    contents: [
      {
        uri: 'nexus://toolbox/runtime',
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            pid: process.pid,
            uptimeSeconds: Math.round(process.uptime()),
            memory: process.memoryUsage(),
            node: process.version,
          },
          null,
          2,
        ),
      },
    ],
  }),
);

const DOCS = {
  'getting-started': 'Register a server, open the Tool Explorer and execute any tool with its JSON schema.',
  security: 'Tool inputs are validated against their JSON schema before an MCP call is sent.',
  transports: 'MCPNEXUS speaks STDIO for local processes and Streamable HTTP for remote servers.',
  observability: 'Every MCP call is persisted with latency, status and payload metadata.',
};

server.registerResource(
  'toolbox-docs',
  'nexus://docs/{topic}',
  {
    title: 'Toolbox documentation',
    description: 'Short reference topics served through a resource template.',
    mimeType: 'text/markdown',
  },
  async (uri, variables) => {
    const topic = String(variables?.topic ?? 'getting-started');
    const body = DOCS[topic];
    if (!body) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: `Unknown topic "${topic}". Available: ${Object.keys(DOCS).join(', ')}`,
          },
        ],
      };
    }
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `# ${topic}\n\n${body}` }] };
  },
);

/* -------------------------------- prompts -------------------------------- */

server.registerPrompt(
  'summarize',
  {
    title: 'Summarize text',
    description: 'Produce a summary brief with a selected tone.',
    argsSchema: {
      text: z.string().describe('Content to summarise'),
      style: z.enum(['bullets', 'executive', 'technical']).optional(),
    },
  },
  ({ text: content, style }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Summarise the following content in a ${style ?? 'bullets'} style.\n\n---\n${content}`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'code_review',
  {
    title: 'Code review',
    description: 'Review a code snippet for correctness, security and clarity.',
    argsSchema: {
      language: z.string(),
      code: z.string(),
      focus: z.string().optional(),
    },
  },
  ({ language, code, focus }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Review this ${language} code${focus ? ` with a focus on ${focus}` : ''}. Report defects first, then improvements.\n\n\`\`\`${language}\n${code}\n\`\`\``,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'incident_report',
  {
    title: 'Incident report',
    description: 'Draft a structured incident report for a service.',
    argsSchema: {
      service: z.string(),
      symptoms: z.string(),
      severity: z.enum(['sev1', 'sev2', 'sev3']).optional(),
    },
  },
  ({ service, symptoms, severity }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write an incident report for ${service} at ${severity ?? 'sev2'}.\nSymptoms: ${symptoms}\nInclude impact, timeline, root cause, mitigation and follow-ups.`,
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
