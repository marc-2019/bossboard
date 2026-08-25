/**
 * Auth Context
 * Manages authentication state and token storage
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from '../utils/storage';
import { api, authApi, setAuthToken, notificationsApi, NetworkError, TimeoutError, ApiError } from '../services/api';
import {
  clearActiveJobLogSuppressions,
  setActiveJobLogOwner,
} from '../services/activeJobLog';
import { isDefinitiveAuthRejection } from '../utils/sessionRestore';

interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  tradeType: string | null;
  businessName: string | null;
  isVerified: boolean;
  onboardingCompleted: boolean;
  subscriptionTier: 'free' | 'tradie' | 'team';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<string>; // Returns verification code (dev only)
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<string>; // Returns new code (dev only)
  completeOnboarding: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string; tradeType?: string; businessName?: string }) => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  tradeType?: string;
  businessName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'bossboard_access_token';
const REFRESH_KEY = 'bossboard_refresh_token';
const USER_KEY = 'bossboard_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasCredential, setHasCredential] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored auth on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    setActiveJobLogOwner(user?.id ?? null);
  }, [user?.id]);

  async function readStoredKey(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Error reading stored auth key:', key, error);
      return null;
    }
  }

  async function loadStoredAuth() {
    try {
      // Isolate reads: one Keychain throw must not abort the other keys.
      const [token, storedUser, refreshToken] = await Promise.all([
        readStoredKey(TOKEN_KEY),
        readStoredKey(USER_KEY),
        readStoredKey(REFRESH_KEY),
      ]);

      // Re-write readable keys so existing WHEN_UNLOCKED items migrate
      // to AFTER_FIRST_UNLOCK before the next process-death relaunch.
      await Promise.all([
        token ? SecureStore.setItemAsync(TOKEN_KEY, token) : Promise.resolve(),
        refreshToken ? SecureStore.setItemAsync(REFRESH_KEY, refreshToken) : Promise.resolve(),
        storedUser ? SecureStore.setItemAsync(USER_KEY, storedUser) : Promise.resolve(),
      ]);

      const hasSecret = !!(token || refreshToken);
      if (hasSecret) {
        setHasCredential(true);
      }

      // Ghost login: a user blob with no tokens is not a session.
      if (storedUser && hasSecret) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (error) {
          console.error('Error parsing stored user:', error);
        }
      }
      if (token) {
        setAuthToken(token);
      }

      if (!hasSecret) {
        return;
      }

      try {
        if (token) {
          const response = await api.get('/api/v1/auth/me');
          if (response.data.success) {
            const userData = response.data.data.user;
            setUser(userData);
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
            return;
          }
        }
        await tryRefreshToken({
          clearOnFailure: false,
        });
      } catch (error) {
        await tryRefreshToken({
          clearOnFailure: isDefinitiveAuthRejection(error),
        });
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function tryRefreshToken(options?: { clearOnFailure?: boolean }) {
    const clearOnFailure = options?.clearOnFailure ?? true;
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) {
        // Missing refresh is a Keychain miss, not a logout. Keep restored keys.
        return;
      }

      const response = await api.post('/api/v1/auth/refresh', { refreshToken });
      if (!response.data.success) {
        if (clearOnFailure) {
          await clearAuth();
        }
        return;
      }

      const { tokens } = response.data.data;
      await storeTokens(tokens.accessToken, tokens.refreshToken);
      setAuthToken(tokens.accessToken);
      setHasCredential(true);

      try {
        const userResponse = await api.get('/api/v1/auth/me');
        if (userResponse.data.success) {
          const userData = userResponse.data.data.user;
          setUser(userData);
          await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
        }
      } catch {
        // Tokens refreshed; keep the stored user if /me is unreachable.
      }
    } catch (error) {
      if (clearOnFailure && isDefinitiveAuthRejection(error)) {
        await clearAuth();
      }
    }
  }

  async function storeTokens(accessToken: string, refreshToken: string) {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
    ]);
  }

  async function clearAuth() {
    clearActiveJobLogSuppressions();
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    setAuthToken(null);
    setUser(null);
    setHasCredential(false);
  }

  async function login(email: string, password: string) {
    const trimmedEmail = email.trim().toLowerCase();

    try {
      const response = await authApi.login({
        email: trimmedEmail,
        password,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Login failed');
      }

      const { user: userData, tokens } = response.data.data;

      await storeTokens(tokens.accessToken, tokens.refreshToken);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
      setAuthToken(tokens.accessToken);
      setUser(userData);
      setHasCredential(true);
    } catch (error) {
      // Surface actionable copy for App Review / users (Guideline 2.1(a))
      if (error instanceof NetworkError) {
        throw new Error(
          error.message ||
            'Cannot reach BossBoard servers. Confirm internet access and try again.'
        );
      }
      if (error instanceof TimeoutError) {
        throw new Error('Login timed out. Please try again on a stable connection.');
      }
      if (error instanceof ApiError) {
        throw new Error(error.message || 'Login failed');
      }
      throw error;
    }
  }

  async function register(data: RegisterData): Promise<string> {
    const response = await api.post('/api/v1/auth/register', data);

    if (!response.data.success) {
      throw new Error(response.data.message || 'Registration failed');
    }

    const { user: userData, tokens, verificationCode } = response.data.data;

    await storeTokens(tokens.accessToken, tokens.refreshToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
    setAuthToken(tokens.accessToken);
    setUser(userData);
    setHasCredential(true);

    return verificationCode;
  }

  async function verifyEmail(code: string) {
    const response = await api.post('/api/v1/auth/verify-email', { code });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Verification failed');
    }

    const userData = response.data.data.user;
    setUser(userData);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
  }

  async function resendVerification(): Promise<string> {
    const response = await api.post('/api/v1/auth/resend-verification');

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to resend code');
    }

    return response.data.data.verificationCode;
  }

  async function completeOnboarding() {
    const response = await api.post('/api/v1/auth/complete-onboarding');

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to complete onboarding');
    }

    const userData = response.data.data.user;
    setUser(userData);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
  }

  async function updateProfile(data: { name?: string; phone?: string; tradeType?: string; businessName?: string }) {
    const response = await api.put('/api/v1/auth/me', data);
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to update profile');
    }
    const userData = response.data.data.user;
    setUser(userData);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
  }

  async function logout() {
    try {
      // Remove push token before logging out
      await notificationsApi.removePushToken();
    } catch {
      // Ignore push token removal errors
    }
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (refreshToken) {
        await api.post('/api/v1/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout errors
    }
    await clearAuth();
  }

  async function refreshUser() {
    try {
      const response = await api.get('/api/v1/auth/me');
      if (response.data.success) {
        const userData = response.data.data.user;
        setUser(userData);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && hasCredential,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        verifyEmail,
        resendVerification,
        completeOnboarding,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

