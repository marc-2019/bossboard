'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@bossboard/shared';
import { authClient } from '@/lib/api-client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name?: string;
    referralCode?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (data: { email: string; code: string; newPassword: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authClient.me();
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    // Prefer user from login response so a slow/failed /me cannot hang or wipe session.
    const data = await authClient.login(email, password);
    if (data?.user) {
      setUser(data.user);
    } else {
      await refreshUser();
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    name?: string;
    referralCode?: string;
  }) => {
    const result = await authClient.register(data);
    if (result?.user) {
      setUser(result.user);
    } else {
      await refreshUser();
    }
  };

  const logout = async () => {
    await authClient.logout();
    setUser(null);
  };

  const forgotPassword = async (email: string) => {
    await authClient.forgotPassword(email);
  };

  const resetPassword = async (data: { email: string; code: string; newPassword: string }) => {
    await authClient.resetPassword(data);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, forgotPassword, resetPassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
