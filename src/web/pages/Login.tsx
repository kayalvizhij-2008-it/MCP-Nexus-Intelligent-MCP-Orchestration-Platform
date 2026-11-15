import { ArrowRight, Eye, EyeOff, Lock, ServerCog, ShieldCheck, Waypoints } from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../App.js';
import { Button, Field, Input } from '../components/ui.js';
import { api, ApiError, type UserDto } from '../lib/api.js';
import { lazy, Suspense } from 'react';
const Combined3DAccent = lazy(() => import('../components/3d/Combined3D.js').then((m) => ({ default: m.Combined3D })));


type Mode = 'signin' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form itself, reused by the login page and the landing auth panel. */
export function LoginCard({ onCancel }: { onCancel?: () => void }) {
  const { setSession } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (mode === 'register') {
      if (password !== confirm) {
        setError('Passwords do not match');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const result = await api.post<{ user: UserDto; permissions: string[] }>('/api/auth/login', {
          email: email.trim(),
          password,
        });
        setSession({ user: result.user, permissions: result.permissions });
      } else {
        const result = await api.post<{ user: UserDto; permissions: string[] }>('/api/auth/register', {
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        });
        setSession({ user: result.user, permissions: result.permissions });
        setSuccess('Account created. Welcome to MCP Nexus.');
      }
    } catch (error) {
      setError(error instanceof ApiError ? error.message : (mode === 'signin' ? 'Sign-in failed' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin() {
    resetMessages();
    setDemoLoading(true);
    try {
      const result = await api.post<{ user: UserDto; permissions: string[] }>('/api/auth/demo', {});
      setSession({ user: result.user, permissions: result.permissions });
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Demo sign-in failed');
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-line bg-surface-900/60 p-1">
        <button
          type="button"
          onClick={() => { setMode('signin'); resetMessages(); }}
          className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
            mode === 'signin' ? 'bg-accent/15 text-accent-soft' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); resetMessages(); }}
          className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
            mode === 'register' ? 'bg-accent/15 text-accent-soft' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Create account
        </button>
      </div>

      <h2 className="text-[20px] font-semibold tracking-tight text-white">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </h2>
      <p className="mt-1 text-[12.5px] text-muted">
        {mode === 'signin'
          ? 'Use your control-plane credentials to continue.'
          : 'Register with your Gmail or any valid email address.'}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'register' && (
          <Field label="Name (optional)">
            <Input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </Field>
        )}
        <Field label="Email">
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={mode === 'register' ? 'you@gmail.com' : 'you@company.com'}
            required
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        {mode === 'register' && (
          <Field label="Confirm password">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
        )}

        {mode === 'signin' && (
          <div className="flex items-center justify-between text-[11.5px]">
            <label className="flex items-center gap-2 text-slate-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-line bg-surface-900"
              />
              Remember me
            </label>
            <span className="text-slate-500">Forgot password? Contact your administrator.</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-err/25 bg-err/10 px-3 py-2 text-[12px] text-red-200" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[12px] text-accent-soft" role="status">
            {success}
          </div>
        )}

        <Button type="submit" variant="primary" className="w-full py-2" loading={loading}>
          {mode === 'signin' ? 'Enter control plane' : 'Create account'} <ArrowRight size={13} />
        </Button>
      </form>

      <div className="mt-5">
        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1 bg-line/60" />
          <span className="text-[10px] uppercase tracking-wider text-slate-600">or</span>
          <div className="h-px flex-1 bg-line/60" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full py-2"
          loading={demoLoading}
          onClick={() => void demoLogin()}
        >
          Try demo account
        </Button>
        <p className="mt-2 text-center text-[10.5px] text-slate-500">
          Explore MCP Nexus with sample data. Demo credentials:{' '}
          <span className="mono text-slate-400">demo@mcpnexus.com</span>
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface-900 px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
          <Lock size={11} /> first-run administrator
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
          The generated password is printed to <span className="mono text-slate-400">data/initial-admin.txt</span>{' '}
          on first boot, or supplied through <span className="mono text-slate-400">MCPNEXUS_ADMIN_PASSWORD</span>.
          There is no default password.
        </p>
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 w-full text-center text-[11.5px] text-slate-500 transition-colors hover:text-slate-300"
        >
          Back to overview
        </button>
      )}
    </div>
  );
}

export function LoginPage() {
  return (
    <div className="relative grid min-h-screen overflow-hidden bg-surface-950 lg:grid-cols-[1.06fr_0.94fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line/70 p-10 lg:flex">
        <div className="aurora absolute inset-0 opacity-90" />
        <div className="grid-lines absolute inset-0 opacity-40" />
        <div
          className="pointer-events-none absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(54,199,138,0.35), transparent 65%)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
              <path
                d="M16 3.5l10.5 6.2v12.6L16 28.5 5.5 22.3V9.7z"
                stroke="url(#login-mark)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="16" r="3.2" fill="#36C78A" />
              <defs>
                <linearGradient id="login-mark" x1="4" y1="4" x2="28" y2="28">
                  <stop stopColor="#A0E6BD" />
                  <stop offset="1" stopColor="#A0E6BD" />
                </linearGradient>
              </defs>
            </svg>
            <div>
              <div className="text-[15px] font-semibold tracking-tight text-white">MCPNEXUS</div>
              <div className="text-[9px] font-medium uppercase tracking-[0.24em] text-slate-500">
                control plane
              </div>
            </div>
          </div>

          <h1 className="mt-16 max-w-md text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] text-slate-50">
            Every MCP server,
            <br />
            <span className="gradient-text">under one signal.</span>
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-slate-400">
            Connect STDIO and Streamable HTTP servers, execute real tool calls, govern access and watch
            every execution — from a single control plane.
          </p>

          <div className="mt-10 grid max-w-md gap-2.5">
            {[
              { icon: ServerCog, title: 'Live MCP sessions', copy: 'Handshake, discovery and invocation over the official SDK.' },
              { icon: ShieldCheck, title: 'Policy and approvals', copy: 'Role-based access with per-tool approval gates.' },
              { icon: Waypoints, title: 'Full observability', copy: 'Latency, failures and audit history from real traffic.' },
            ].map((item) => (
              <div
                key={item.title}
                className="group flex items-start gap-3 rounded-lg border border-line/80 bg-surface-900/50 px-3.5 py-3 backdrop-blur transition-colors hover:border-accent/25"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-accent/[0.08] text-accent-soft">
                  <item.icon size={13} />
                </span>
                <div>
                  <div className="text-[12.5px] font-medium text-slate-200">{item.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{item.copy}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-[11px] text-slate-600">
          <span className="h-1 w-1 rounded-full bg-accent/70" />
          Model Context Protocol · {new Date().getFullYear()}
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 lg:hidden">
            <div className="text-[16px] font-semibold tracking-tight text-white">MCPNEXUS</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">control plane</div>
          </div>
          <div className="mb-4 h-[120px] overflow-hidden rounded-xl border border-line/60 bg-surface-950/40">
            <Suspense fallback={null}>
              <Combined3DAccent className="h-full w-full" variant="accent" subtle />
            </Suspense>
          </div>
          <div className="panel panel-signal p-6 sm:p-7">
            <LoginCard />
          </div>
        </div>
      </div>
    </div>
  );
}