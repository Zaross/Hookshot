import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import FirstRunModal from "./components/FirstRunModal";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy-loaded pages — each chunk loads only when first visited
const LoginPage            = lazy(() => import("./pages/LoginPage"));
const DashboardPage        = lazy(() => import("./pages/DashboardPage"));
const RepositoriesPage     = lazy(() => import("./pages/RepositoriesPage"));
const RepositoryDetailPage = lazy(() => import("./pages/RepositoryDetailPage"));
const UsersPage            = lazy(() => import("./pages/UsersPage"));
const SettingsPage         = lazy(() => import("./pages/SettingsPage"));
const LogsPage             = lazy(() => import("./pages/LogsPage"));
const AuditPage            = lazy(() => import("./pages/AuditPage"));
const SessionsPage         = lazy(() => import("./pages/SessionsPage"));
const QueuePage            = lazy(() => import("./pages/QueuePage"));
const NotFoundPage         = lazy(() => import("./pages/NotFoundPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppWithFirstRun({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  return (
    <>
      {children}
      {user?.must_change_password && <FirstRunModal />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          },
        }}
      />
      <AppWithFirstRun>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LazyPage><LoginPage /></LazyPage>} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"        element={<LazyPage><DashboardPage /></LazyPage>} />
              <Route path="repositories"     element={<LazyPage><RepositoriesPage /></LazyPage>} />
              <Route path="repositories/new" element={<LazyPage><RepositoryDetailPage /></LazyPage>} />
              <Route path="repositories/:id" element={<LazyPage><RepositoryDetailPage /></LazyPage>} />
              <Route path="logs"             element={<LazyPage><LogsPage /></LazyPage>} />
              <Route path="settings"         element={<LazyPage><SettingsPage /></LazyPage>} />
              <Route path="sessions"         element={<LazyPage><SessionsPage /></LazyPage>} />
              <Route
                path="users"
                element={<RequireAdmin><LazyPage><UsersPage /></LazyPage></RequireAdmin>}
              />
              <Route
                path="audit"
                element={<RequireAdmin><LazyPage><AuditPage /></LazyPage></RequireAdmin>}
              />
              <Route
                path="queue"
                element={<RequireAdmin><LazyPage><QueuePage /></LazyPage></RequireAdmin>}
              />
            </Route>
            <Route path="*" element={<LazyPage><NotFoundPage /></LazyPage>} />
          </Routes>
        </Suspense>
      </AppWithFirstRun>
    </BrowserRouter>
  );
}
