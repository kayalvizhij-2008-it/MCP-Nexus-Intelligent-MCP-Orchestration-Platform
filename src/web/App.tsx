import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Spinner, ToastProvider } from './components/ui.js';
import { api, type UserDto } from './lib/api.js';
import { DeploymentsPage } from './pages/Deployments.js';
import { IntegrationsPage } from './pages/Integrations.js';
import { LoginPage } from './pages/Login.js';
import { NotFoundPage } from './pages/NotFound.js';
import { ObservabilityPage } from './pages/Observability.js';
import { OverviewPage } from './pages/Overview.js';
import { PlaygroundPage } from './pages/Playground.js';
import { PromptsPage } from './pages/Prompts.js';
import { ResourcesPage } from './pages/Resources.js';
import { SecurityPage } from './pages/Security.js';
import { ServerDetailPage } from './pages/ServerDetail.js';
import { ServersPage } from './pages/Servers.js';
import { SettingsPage } from './pages/Settings.js';
import { ToolsPage } from './pages/Tools.js';

export type Session = { user: UserDto; permissions: string[] };

const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}>({
  session: null,
  loading: true,
  setSession: () => undefined,
  refresh: async () => undefined,
  signOut: async () => undefined,
  can: () => false,
});

export function useAuth() {
  return useContext(AuthContext);
}

function BootScreen() {
  return (
    <div className="glow flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-950">
      <div className="flex items-center gap-2 text-[13px] font-medium tracking-wide text-slate-300">
        <Spinner /> Starting control plane
      </div>
      <div className="text-[11px] text-slate-600">MCPNEXUS</div>
    </div>
  );
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ user: UserDto; permissions: string[] }>('/api/auth/me');
      setSession({ user: result.user, permissions: result.permissions });
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handler = () => setSession(null);
    window.addEventListener('nexus:unauthorised', handler);
    return () => window.removeEventListener('nexus:unauthorised', handler);
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setSession(null);
    }
  }, []);

  const can = useCallback(
    (permission: string) => Boolean(session?.permissions.includes(permission)),
    [session],
  );

  return (
    <AuthContext.Provider value={{ session, loading, setSession, refresh, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}

function Shell() {
  const { session, loading } = useAuth();
  if (loading) return <BootScreen />;
  if (!session) return <LoginPage />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/servers/:id" element={<ServerDetailPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/observability" element={<ObservabilityPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/deployments" element={<DeploymentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  );
}

