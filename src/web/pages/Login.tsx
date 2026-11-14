import { ArrowRight, Lock, ServerCog, ShieldCheck, Waypoints } from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../App.js';
import { Button, Field, Input } from '../components/ui.js';
import { api, ApiError, type UserDto } from '../lib/api.js';

export function LoginPage() {
  const { setSession } = useAuth();
  const [email, setEmail] = useState('admin@mcpnexus.local');
  const [password, setPassword] = useState('nexus-admin-2026');
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
    <div className="grid min-h-screen bg-surface-950 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-10 lg:flex">
        <div className="absolute inset-0 glow" />
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #151a26 1px, transparent 1px), linear-gradient(to bottom, #151a26 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(60% 60% at 30% 30%, black, transparent)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
              <path
                d="M16 3.5l10.5 6.2v12.6L16 28.5 5.5 22.3V9.7z"
                stroke="#7ea0ff"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="16" r="3.2" fill="#8b5cf6" />
            </svg>
            <div>
              <div className="text-[15px] font-semibold tracking-tight text-white">MCPNEXUS</div>
              <div className="text-[9px] font-medium uppercase tracking-[0.24em] text-slate-500">
                control plane
              </div>
            </div>
          </div>

          <h1 className="mt-16 max-w-md text-[34px] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
            Every MCP server,
            <br />
            under one roof.
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
                className="flex items-start gap-3 rounded-lg border border-line bg-surface-900/60 px-3.5 py-3 backdrop-blur"
              >
                <item.icon size={15} className="mt-0.5 text-accent-soft" />
                <div>
                  <div className="text-[12.5px] font-medium text-slate-200">{item.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{item.copy}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-[11px] text-slate-600">
          Model Context Protocol · {new Date().getFullYear()}
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[368px]">
          <div className="mb-7 lg:hidden">
            <div className="text-[16px] font-semibold tracking-tight text-white">MCPNEXUS</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">control plane</div>
          </div>
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
              <div className="rounded-lg border border-err/25 bg-err/10 px-3 py-2 text-[12px] text-red-200">
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
            <div className="mt-1.5 font-mono text-[11.5px] text-slate-400">admin@mcpnexus.local</div>
            <div className="font-mono text-[11.5px] text-slate-400">nexus-admin-2026</div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">
              Override with MCPNEXUS_ADMIN_EMAIL / MCPNEXUS_ADMIN_PASSWORD before first boot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
