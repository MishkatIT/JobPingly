'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ClientUser } from '@/lib/auth/server';
import { api } from '@/lib/client/api';

interface SessionContextValue {
  user: ClientUser;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * The signed-in user, resolved on the server by the dashboard and admin
 * layouts and handed down here, so pages never render a logged-out flash
 * or bounce through the login page.
 */
export function SessionProvider({ initialUser, children }: { initialUser: ClientUser; children: ReactNode }) {
  const [user, setUser] = useState(initialUser);

  const refresh = useCallback(async () => {
    const data = await api<{ user: ClientUser }>('/api/me');
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
    } finally {
      window.location.assign('/login');
    }
  }, []);

  const can = useCallback((permission: string) => user.permissions.includes(permission), [user.permissions]);

  return <SessionContext.Provider value={{ user, can, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}
