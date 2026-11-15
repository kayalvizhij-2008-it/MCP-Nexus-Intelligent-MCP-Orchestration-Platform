import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Spinner, ToastProvider } from './components/ui.js';
import { api, type UserDto } from './lib/api.js';

// Route-level code splitting: heavy pages (and the 3D landing chunk) load on demand.
const ApprovalsPage = lazy(() => import('./pages/Approvals.js').then((m) => ({ default: m.ApprovalsPage })));
const DeploymentsPage = lazy(() => import('./pages/Deployments.js').then((m) => ({ default: m.DeploymentsPage })));
const ExecutionsPage = lazy(() => import('./pages/Executions.js').then((m) => ({ default: m.ExecutionsPage })));
const IntegrationsPage = lazy(() => import('./pages/Integrations.js').then((m) => ({ default: m.IntegrationsPage })));
const LandingPage = lazy(() => import('./pages/Landing.js').then((m) => ({ default: m.LandingPage })));
const LoginPageLazy = lazy(() => import('./pages/Login.js').then((m) => ({ default: m.LoginPage })));
const NotFoundPage = lazy(() => import('./pages/NotFound.js').then((m) => ({ default: m.NotFoundPage })));
const ObservabilityPage = lazy(() => import('./pages/Observability.js').then((m) => ({ default: m.ObservabilityPage })));
const OverviewPage = lazy(() => import('./pages/Overview.js').then((m) => ({ default: m.OverviewPage })));
const PlaygroundPage = lazy(() => import('./pages/Playground.js').then((m) => ({ default: m.PlaygroundPage })));
const PromptsPage = lazy(() => import('./pages/Prompts.js').then((m) => ({ default: m.PromptsPage })));
const ResourcesPage = lazy(() => import('./pages/Resources.js').then((m) => ({ default: m.ResourcesPage })));
const SecurityPage = lazy(() => import('./pages/Security.js').then((m) => ({ default: m.SecurityPage })));
const ServerDetailPage = lazy(() => import('./pages/ServerDetail.js').then((m) => ({ default: m.ServerDetailPage })));
const ServersPage = lazy(() => import('./pages/Servers.js').then((m) => ({ default: m.ServersPage })));
const SettingsPage = lazy(() => import('./pages/Settings.js').then((m) => ({ default: m.SettingsPage })));
const ToolsPage = lazy(() => import('./pages/Tools.js').then((m) => ({ default: m.ToolsPage })));
const UnauthorizedPage = lazy(() => import('./pages/Unauthorized.js').then((m) => ({ default: m.UnauthorizedPage })));
const ErrorPage = lazy(() => import('./pages/ErrorBoundaryPage.js').then((m) => ({ default: m.ErrorBoundaryPage })));

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
    <div className="aurora flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-950">
      <div className="flex items-center gap-2 text-[13px] font-medium tracking-wide text-slate-300">
        <Spinner /> Starting control plane
      </div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-600">MCPNEXUS</div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('MCPNexus render error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Suspense fallback={<BootScreen />}>
          <ErrorPage message={this.state.message} onReset={() => this.setState({ hasError: false, message: '' })} />
        </Suspense>
      );
    }
    return this.props.children;
  }
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
  const location = useLocation();
  if (loading) return <BootScreen />;
  const authRoute = location.pathname === '/login' || location.pathname === '/register';
  // Signed out: auth pages render the login/register form; otherwise the landing page.
  if (!session && authRoute) {
    return (
      <Suspense fallback={<BootScreen />}>
        <LoginPageLazy />
      </Suspense>
    );
  }
  if (!session) return (
    <Suspense fallback={<BootScreen />}>
      <LandingPage />
    </Suspense>
  );
  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<BootScreen />}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/servers/:id" element={<ServerDetailPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/deployments" element={<DeploymentsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
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
