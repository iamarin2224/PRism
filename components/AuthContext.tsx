'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface User {
  id: string;
  githubId: string;
  githubUsername: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface Installation {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: string;
  accountAvatar: string | null;
}

interface AuthContextType {
  user: User | null;
  authenticated: boolean;
  hasInstallation: boolean;
  installations: Installation[];
  loading: boolean;
  error: string | null;
  refreshAuth: (sync?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authenticated: false,
  hasInstallation: false,
  installations: [],
  loading: true,
  error: null,
  refreshAuth: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [hasInstallation, setHasInstallation] = useState<boolean>(false);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = useCallback(async (sync = false) => {
    try {
      setLoading(true);
      const url = sync ? '/api/auth/me?sync=true' : '/api/auth/me';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setAuthenticated(data.authenticated || false);
        setHasInstallation(data.hasInstallation || false);
        setInstallations(data.installations || []);
        setError(null);
      } else {
        setUser(null);
        setAuthenticated(false);
        setHasInstallation(false);
        setInstallations([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check authentication status');
      setUser(null);
      setAuthenticated(false);
      setHasInstallation(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only runs on full page mount / browser refresh (Ctrl+R)
    refreshAuth(true);
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    } finally {
      setUser(null);
      setAuthenticated(false);
      setHasInstallation(false);
      setInstallations([]);
      window.location.href = '/';
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authenticated,
        hasInstallation,
        installations,
        loading,
        error,
        refreshAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
