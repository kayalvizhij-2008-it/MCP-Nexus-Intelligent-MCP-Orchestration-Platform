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
import { hashPassword, verifyPassword } from '../crypto.js';
import { get, run } from '../db.js';
import { ApiError, asyncRoute, rateLimit } from '../http.js';

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

