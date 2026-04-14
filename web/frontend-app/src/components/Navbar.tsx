import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from './Toast';

export default function Navbar() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();

  const links = [
    { to: '/', label: 'Dashboard', icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></> },
    { to: '/test', label: 'Test', icon: <path d="M5 3l14 9-14 9V3z" /> },
    { to: '/schedules', label: 'Schedules', icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
    { to: '/monitors', label: 'Monitors', icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2" /> },
    { to: '/history', label: 'History', icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></> },
    ...(isAdmin ? [{ to: '/users', label: 'Users', icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></> }] : []),
  ];

  const handleLogout = async () => {
    await logout();
    toast('Signed out');
    navigate('/login', { replace: true });
  };

  const roleCls = user?.role === 'admin'
    ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
    : user?.role === 'operator'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
      : 'border-border bg-accent/40 text-muted-foreground';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-amber-500/10 text-amber-500">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <span className="block text-sm font-semibold tracking-tight">Hive-Run</span>
              {user && <span className="block text-[11px] text-muted-foreground font-mono">{user.username}</span>}
            </div>
          </div>

          <nav className="flex min-h-10 flex-wrap items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `relative inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  }`
                }
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {link.icon}
                </svg>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <div className="text-right">
                <p className="text-sm font-medium">{user.display_name}</p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] ${roleCls}`}>{user.role}</span>
                  {user.can_use_proxy && (
                    <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-300">proxy</span>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
