import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, status } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    const nextPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
    return <Navigate to={nextPath} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      const nextPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
      navigate(nextPath, { replace: true });
    } catch (error: any) {
      toast(error.message || 'Login failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground ring-ring focus-visible:outline-none focus-visible:ring-1 font-mono';

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border bg-card/70 p-8 backdrop-blur">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Hive-Run</p>
                <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className={inputCls}
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </section>

          <aside className="rounded-3xl border border-border bg-gradient-to-br from-amber-500/10 via-card to-sky-500/10 p-8">
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">Internal Access</p>
            <h2 className="mb-4 text-3xl font-semibold tracking-tight">Controlled testing, shared visibility, tighter guardrails.</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Every API call now runs behind a signed-in session, so dashboard data and operations stay inside your team boundary.</p>
              <p>Role-based access keeps viewers read-only, lets operators run the platform, and reserves user administration for admins.</p>
              <p>Proxy usage is separately gated, so sensitive traffic paths only stay available to the accounts that should have them.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
