import { createContext, startTransition, useCallback, useContext, useEffect, useState } from 'react';
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from './api';
import type { CurrentUser } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: CurrentUser | null;
  status: AuthStatus;
  isAdmin: boolean;
  canOperate: boolean;
  canUseProxy: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<CurrentUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const applyUser = useCallback((nextUser: CurrentUser | null) => {
    startTransition(() => {
      setUser(nextUser);
      setStatus(nextUser ? 'authenticated' : 'unauthenticated');
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextUser = await getCurrentUser();
      applyUser(nextUser);
      return nextUser;
    } catch {
      applyUser(null);
      return null;
    }
  }, [applyUser]);

  const login = useCallback(async (username: string, password: string) => {
    const nextUser = await loginRequest(username, password);
    applyUser(nextUser);
    return nextUser;
  }, [applyUser]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Even if the session is already invalid server-side, the client should reset locally.
    }
    localStorage.removeItem('activeJobId');
    applyUser(null);
  }, [applyUser]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const nextUser = await getCurrentUser();
        if (!mounted) {
          return;
        }
        applyUser(nextUser);
      } catch {
        if (!mounted) {
          return;
        }
        applyUser(null);
      }
    };

    const onUnauthorized = () => {
      localStorage.removeItem('activeJobId');
      applyUser(null);
    };

    bootstrap();
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => {
      mounted = false;
      window.removeEventListener('auth:unauthorized', onUnauthorized);
    };
  }, [applyUser]);

  const value: AuthContextValue = {
    user,
    status,
    isAdmin: user?.role === 'admin',
    canOperate: user?.role === 'operator' || user?.role === 'admin',
    canUseProxy: Boolean(user?.can_use_proxy),
    login,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
