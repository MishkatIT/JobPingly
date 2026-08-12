'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  userId?: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
  emailVerified?: boolean;
  emailNotificationsEnabled?: boolean;
  notificationPreference?: string;
  socials?: any;
  emailApprovalStatus?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  refreshUser: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async (retryWithRefresh = true): Promise<AuthUser | null> => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        const u = data.user ? { ...data.user, userId: data.user.id } : null;
        setUser(u);
        if (typeof window !== 'undefined' && u) {
          sessionStorage.setItem('jobpingly_user_session', JSON.stringify(u));
        }
        setError(null);
        return u;
      } else if (res.status === 401 && retryWithRefresh) {
        // Access token expired or missing, attempt session refresh via refresh_token cookie
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          return await fetchUser(false);
        }
      }
      setUser(null);
      if (typeof window !== 'undefined') sessionStorage.removeItem('jobpingly_user_session');
      return null;
    } catch (err: any) {
      setUser(null);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jobpingly_user_session');
        if (cached) {
          setUser(JSON.parse(cached));
          setLoading(false);
        }
      } catch {}
    }
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setUser(null);
    if (typeof window !== 'undefined') sessionStorage.removeItem('jobpingly_user_session');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, refreshUser: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
