import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/Toast';
import DashboardPage from './pages/DashboardPage';
import TestPage from './pages/TestPage';
import SchedulesPage from './pages/SchedulesPage';
import MonitorsPage from './pages/MonitorsPage';
import HistoryPage from './pages/HistoryPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import { AuthProvider, useAuth } from './lib/auth';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground">
        Loading session...
      </div>
    </div>
  );
}

function ProtectedLayout() {
  return (
    <div className="h-full flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-screen-xl mx-auto px-6 py-8 w-full">
        <Outlet />
      </main>
    </div>
  );
}

function RequireAuth() {
  const location = useLocation();
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <ProtectedLayout />;
}

function RequireAdmin() {
  const { status, isAdmin } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <LoginPage />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicOnly />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/monitors" element={<MonitorsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
