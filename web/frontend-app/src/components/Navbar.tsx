import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></> },
  { to: '/test', label: 'Test', icon: <path d="M5 3l14 9-14 9V3z"/> },
  { to: '/schedules', label: 'Schedules', icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
  { to: '/monitors', label: 'Monitors', icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/> },
  { to: '/history', label: 'History', icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></> },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-amber-500/10 text-amber-500">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span className="font-semibold text-sm tracking-tight">Hive-Run</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center h-14 gap-1">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  `relative inline-flex items-center gap-1.5 h-14 px-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-foreground after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-foreground after:rounded-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {l.icon}
                </svg>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="w-24" />
        </div>
      </div>
    </header>
  );
}
