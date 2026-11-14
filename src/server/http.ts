import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Sliding-window in-memory rate limiter. */
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as any).user?.id ?? req.ip ?? 'anonymous';
    const now = Date.now();
    const windowStart = now - options.windowMs;
    const recent = (hits.get(key) ?? []).filter((at) => at > windowStart);
    if (recent.length >= options.max) {
      const retryAfter = Math.ceil((recent[0]! + options.windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      res.status(429).json({
        ok: false,
        error: options.message ?? 'Too many requests — slow down',
        details: { limit: options.max, windowSeconds: options.windowMs / 1000 },
      });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [entryKey, values] of hits) {
        if (!values.some((at) => at > windowStart)) hits.delete(entryKey);
      }
    }
    next();
  };
}

/** Keys whose values are never echoed back to a client, in logs or CSV exports. */
const SECRET_KEY_PATTERN =
  /(pass(word|phrase)?|secret|token|api[-_]?key|apikey|authorization|auth|cookie|credential|private[-_]?key|session|signature)/i;

/**
 * Recursively replace values stored under secret-looking keys. Persisted
 * execution records keep their real arguments (they are needed to audit an
 * approval); everything that leaves the API is masked first.
 */
export function maskSecretValues(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => maskSecretValues(entry, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? '••••••' : maskSecretValues(entry, depth + 1);
  }
  return out;
}

/** Minimal RFC4180 CSV serialiser. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (input: unknown) => {
    const text = input === null || input === undefined ? '' : String(input);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((row) => columns.map((column) => escape(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function intParam(value: unknown, fallback: number, max = 500): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} is required`);
  }
  return value.trim();
}

/** Parse "KEY=value" lines into a map. */
export function parseEnvText(text: string | undefined | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!text) return map;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) map[key] = value;
  }
  return map;
}

/** Parse "Header: value" lines into a header map. */
export function parseHeaderText(text: string | undefined | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!text) return map;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf(':');
    if (index <= 0) continue;
    map[trimmed.slice(0, index).trim().toLowerCase()] = trimmed.slice(index + 1).trim();
  }
  return map;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'server'
  );
}
