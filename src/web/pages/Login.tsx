import { ArrowRight, Lock, ServerCog, ShieldCheck, Waypoints } from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../App.js';
import { Button, Field, Input } from '../components/ui.js';
import { api, ApiError, type UserDto } from '../lib/api.js';

/** The form itself, reused by the login page and the landing auth panel. */
export function LoginCard({ onCancel }: { onCancel?: () => void }) {
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ user: UserDto; permissions: string[] }>('/api/auth/login', {
        email,
        password,
      });
      setSession({ user: result.user, permissions: result.permissions });
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-[20px] font-semibold tracking-tight text-white">Sign in</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        Use your control-plane credentials to continue.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Email">
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        {error && (
          <div className="rounded-lg border border-err/25 bg-err/10 px-3 py-2 text-[12px] text-red-200" role="alert">
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" className="w-full py-2" loading={loading}>
          Enter control plane <ArrowRight size={13} />
        </Button>
      </form>

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
          style={{ background: 'radial-gradient(circle, rgba(22,184,166,0.35), transparent 65%)' }}
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
              <circle cx="16" cy="16" r="3.2" fill="#16b8a6" />
              <defs>
                <linearGradient id="login-mark" x1="4" y1="4" x2="28" y2="28">
                  <stop stopColor="#5fe3d1" />
                  <stop offset="1" stopColor="#69d6f5" />
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
          <div className="panel panel-signal p-6 sm:p-7">
            <LoginCard />
          </div>
        </div>
      </div>
    </div>
  );
}
