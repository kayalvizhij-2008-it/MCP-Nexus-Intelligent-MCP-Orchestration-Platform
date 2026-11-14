import type { NextFunction, Request, Response } from 'express';
import { randomToken, sha256, verifyPassword } from './crypto.js';
import { SESSION_TTL_MS } from './config.js';
import { all, get, nowIso, run } from './db.js';

export type Role = 'admin' | 'operator' | 'viewer';

export type Permission =
  | 'server:read'
  | 'server:manage'
  | 'tool:read'
  | 'tool:execute'
  | 'resource:read'
  | 'prompt:read'
  | 'prompt:manage'
  | 'integration:read'
  | 'integration:manage'
  | 'security:read'
  | 'security:manage'
  | 'observability:read'
  | 'deployment:read'
  | 'deployment:manage'
  | 'audit:read'
  | 'user:manage';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'server:read',
    'server:manage',
    'tool:read',
    'tool:execute',
    'resource:read',
    'prompt:read',
    'prompt:manage',
    'integration:read',
    'integration:manage',
    'security:read',
    'security:manage',
    'observability:read',
    'deployment:read',
    'deployment:manage',
    'audit:read',
    'user:manage',
  ],
  operator: [
    'server:read',
    'server:manage',
    'tool:read',
    'tool:execute',
    'resource:read',
    'prompt:read',
    'prompt:manage',
    'integration:read',
    'integration:manage',
    'security:read',
    'observability:read',
    'deployment:read',
    'deployment:manage',
    'audit:read',
  ],
  viewer: [
    'server:read',
    'tool:read',
    'resource:read',
    'prompt:read',
    'integration:read',
    'security:read',
    'observability:read',
    'deployment:read',
  ],
};

export const ROLE_MATRIX = ROLE_PERMISSIONS;

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(user: SessionUser | undefined, permission: Permission): boolean {
  if (!user) return false;
  return permissionsFor(user.role).includes(permission);
}

export const SESSION_COOKIE = 'nexus_session';

export type LoginResult =
  | { ok: true; token: string; user: SessionUser; expiresAt: string }
  | { ok: false; error: string };

export function login(
  email: string,
  password: string,
  meta: { ip?: string; userAgent?: string },
): LoginResult {
  const row = get('SELECT * FROM users WHERE lower(email) = lower(?)', email.trim());
  if (!row) return { ok: false, error: 'Invalid email or password' };
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'Invalid email or password' };
  }
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run(
    'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    sha256(token + ':' + expiresAt),
    row.id,
    sha256(token),
    nowIso(),
    expiresAt,
    meta.ip ?? null,
    meta.userAgent ?? null,
  );
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), row.id);
  return {
    ok: true,
    token,
    expiresAt,
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
  };
}

export function userFromToken(token: string | undefined): SessionUser | undefined {
  if (!token) return undefined;
  const row = get(
    `SELECT u.*, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
    return undefined;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function logout(token: string | undefined) {
  if (!token) return;
  run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function activeSessions(userId?: string) {
  return all(
    `SELECT s.id, s.created_at, s.expires_at, s.ip, s.user_agent, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
      ${userId ? 'WHERE s.user_id = ?' : ''}
      ORDER BY s.created_at DESC LIMIT 100`,
    ...(userId ? [userId] : []),
  );
}

/** Express middleware: resolves the session cookie into req.user. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = (req as any).cookies?.[SESSION_COOKIE] as string | undefined;
  (req as any).user = userFromToken(token);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as SessionUser | undefined;
  if (!user) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as SessionUser | undefined;
    if (!user) {
      res.status(401).json({ ok: false, error: 'Authentication required' });
      return;
    }
    if (!can(user, permission)) {
      res.status(403).json({ ok: false, error: `Missing permission: ${permission}` });
      return;
    }
    next();
  };
}

export type PolicyDecision = { allowed: boolean; requiresApproval: boolean; reason?: string };

/**
 * Evaluate stored permission policies for a (user, permission, context) tuple.
 * Explicit denies win; an allow policy may require manual approval.
 */
export function evaluatePolicies(
  user: SessionUser,
  permission: Permission,
  ctx: { serverId?: string; toolName?: string; serverTags?: string[] } = {},
): PolicyDecision {
  const decision: PolicyDecision = { allowed: true, requiresApproval: false };
  const policies = all(
    'SELECT * FROM policies WHERE permission = ? ORDER BY effect ASC',
    permission,
  );
  for (const policy of policies) {
    const matches =
      (policy.scope === 'global') ||
      (policy.scope === 'role' && policy.subject === user.role) ||
      (policy.scope === 'user' && policy.subject === user.email) ||
      (policy.scope === 'server' && ctx.serverId && policy.subject === ctx.serverId) ||
      (policy.scope === 'tool' && ctx.toolName && policy.subject === ctx.toolName) ||
      (policy.scope === 'tag' && (ctx.serverTags ?? []).includes(policy.subject));
    if (!matches) continue;
    if (policy.effect === 'deny') {
      return { allowed: false, requiresApproval: false, reason: policy.note || 'Denied by policy' };
    }
    if (policy.requires_approval) decision.requiresApproval = true;
  }
  return decision;
}

export function audit(
  req: Request | undefined,
  action: string,
  targetType: string | null,
  targetId: string | null,
  detail: Record<string, unknown> = {},
) {
  const user = req ? ((req as any).user as SessionUser | undefined) : undefined;
  run(
    `INSERT INTO audit_log (id, actor_id, actor_email, action, target_type, target_id, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    user?.id ?? null,
    user?.email ?? 'system',
    action,
    targetType,
    targetId,
    JSON.stringify(detail),
    req?.ip ?? null,
    nowIso(),
  );
}
