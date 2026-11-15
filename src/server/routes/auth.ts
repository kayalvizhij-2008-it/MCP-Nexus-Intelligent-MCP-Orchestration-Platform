import { Router } from 'express';
import {
  SESSION_COOKIE,
  audit,
  login,
  logout,
  permissionsFor,
  requireAuth,
  type SessionUser,
} from '../auth.js';
import { hashPassword, newId, randomToken, sha256, verifyPassword } from '../crypto.js';
import { get, nowIso, run } from '../db.js';
import { ApiError, asyncRoute, rateLimit } from '../http.js';
import { SESSION_TTL_MS } from '../config.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 10, message: 'Too many sign-in attempts — try again shortly' }),
  (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw new ApiError(400, 'Email and password are required');
      }
      const result = login(email, password, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      if (!result.ok) throw new ApiError(401, result.error);
      res.cookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.MCPNEXUS_COOKIE_SECURE === 'true',
        expires: new Date(result.expiresAt),
        path: '/',
      });
      (req as any).user = result.user;
      audit(req, 'auth.login', 'user', result.user.id, { email: result.user.email });
      res.json({
        ok: true,
        user: result.user,
        permissions: permissionsFor(result.user.role),
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post('/logout', (req, res) => {
  const token = (req as any).cookies?.[SESSION_COOKIE];
  logout(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post(
  '/register',
  rateLimit({ windowMs: 60_000, max: 8, message: 'Too many registration attempts — try again shortly' }),
  asyncRoute(async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new ApiError(400, 'Email and password are required');
    }
    const emailTrim = email.trim();
    if (!EMAIL_RE.test(emailTrim)) {
      throw new ApiError(400, 'Enter a valid email address');
    }
    if (password.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }
    const existing = get('SELECT id FROM users WHERE lower(email) = lower(?)', emailTrim);
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    const id = newId();
    const displayName =
      typeof name === 'string' && name.trim() ? name.trim() : emailTrim.split('@')[0];
    run(
      'INSERT INTO users (id, email, name, password_hash, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      emailTrim,
      displayName,
      hashPassword(password),
      'viewer',
      nowIso(),
      null,
    );
    // Auto sign-in after registration.
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    run(
      'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      sha256(token + ':' + expiresAt),
      id,
      sha256(token),
      nowIso(),
      expiresAt,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
    run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), id);
    const user: SessionUser = { id, email: emailTrim, name: displayName, role: 'viewer' };
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.MCPNEXUS_COOKIE_SECURE === 'true',
      expires: new Date(expiresAt),
      path: '/',
    });
    audit(req, 'auth.register', 'user', id, { email: emailTrim });
    res.status(201).json({
      ok: true,
      user,
      permissions: permissionsFor('viewer'),
      expiresAt,
    });
  }),
);

authRouter.post(
  '/demo',
  rateLimit({ windowMs: 60_000, max: 20, message: 'Too many demo attempts — try again shortly' }),
  asyncRoute(async (req, res) => {
    const demoEmail = 'demo@mcpnexus.com';
    const demoPassword = 'MCPNexus@Demo2026';
    let row = get<any>('SELECT * FROM users WHERE lower(email) = lower(?)', demoEmail);
    if (!row) {
      const id = newId();
      run(
        'INSERT INTO users (id, email, name, password_hash, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id,
        demoEmail,
        'Demo User',
        hashPassword(demoPassword),
        'viewer',
        nowIso(),
        null,
      );
      row = get<any>('SELECT * FROM users WHERE lower(email) = lower(?)', demoEmail);
    }
    const result = login(demoEmail, demoPassword, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!result.ok) throw new ApiError(401, result.error);
    res.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.MCPNEXUS_COOKIE_SECURE === 'true',
      expires: new Date(result.expiresAt),
      path: '/',
    });
    (req as any).user = result.user;
    audit(req, 'auth.demo', 'user', result.user.id, { email: result.user.email });
    res.json({
      ok: true,
      user: result.user,
      permissions: permissionsFor(result.user.role),
      expiresAt: result.expiresAt,
    });
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  const user = (req as any).user as SessionUser;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, user, permissions: permissionsFor(user.role) });
});

authRouter.post(
  '/password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = (req as any).user as SessionUser;
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters');
    }
    const row = get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!row || !verifyPassword(String(currentPassword ?? ''), row.password_hash)) {
      throw new ApiError(400, 'Current password is incorrect');
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), user.id);
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    audit(req, 'auth.password_changed', 'user', user.id);
    res.json({ ok: true, message: 'Password updated. Sign in again.' });
  }),
);

