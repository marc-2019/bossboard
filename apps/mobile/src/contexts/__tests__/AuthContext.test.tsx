/**
 * AuthContext Tests
 * Tests for authentication state management — the revenue gate for all paid features.
 *
 * Covers:
 *   - Initial state (unauthenticated, loading)
 *   - Persisted session restore (valid token, expired token → refresh, no token)
 *   - login() happy path and error path
 *   - register() and token storage
 *   - logout() — clears state and storage
 *   - verifyEmail() — updates user state
 *   - completeOnboarding() — updates user state
 *   - updateProfile() — persists changes
 *   - refreshUser() — re-fetches from API
 *   - useAuth() throws when used outside provider
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Module mocks — must use inline factories so hoisting works correctly
// ---------------------------------------------------------------------------

// In-memory store that persists within each test
const mockStore: Record<string, string> = {};

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// Mock the storage util directly — inline factory avoids hoisting issues
jest.mock('../../utils/storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../../services/api', () => {
  class NetworkError extends Error {
    code: string;
    constructor(message: string, code = 'NETWORK_ERROR') {
      super(message);
      this.name = 'NetworkError';
      this.code = code;
    }
  }
  class TimeoutError extends Error {
    constructor(message = 'Request timeout') {
      super(message);
      this.name = 'TimeoutError';
    }
  }
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code = 'API_ERROR') {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return {
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    },
    authApi: {
      login: jest.fn(),
    },
    setAuthToken: jest.fn(),
    notificationsApi: {
      removePushToken: jest.fn(),
    },
    NetworkError,
    TimeoutError,
    ApiError,
  };
});

// ---------------------------------------------------------------------------
// Import subject under test (after mocks)
// ---------------------------------------------------------------------------

import { AuthProvider, useAuth } from '../AuthContext';
import * as storage from '../../utils/storage';
import {
  api,
  authApi,
  setAuthToken,
  notificationsApi,
  NetworkError,
  ApiError,
} from '../../services/api';
import {
  invalidateActiveJobLog,
  isActiveJobLogSuppressed,
  resetActiveJobLogSuppressionsForTests,
  setActiveJobLogOwner,
} from '../../services/activeJobLog';

// Typed accessors to the mocks
const mockGetItem = storage.getItemAsync as jest.Mock;
const mockSetItem = storage.setItemAsync as jest.Mock;
const mockDeleteItem = storage.deleteItemAsync as jest.Mock;
const mockApiGet = (api as any).get as jest.Mock;
const mockApiPost = (api as any).post as jest.Mock;
const mockApiPut = (api as any).put as jest.Mock;
const mockAuthLogin = (authApi as any).login as jest.Mock;
const mockSetAuthToken = setAuthToken as jest.Mock;
const mockRemovePushToken = (notificationsApi as any).removePushToken as jest.Mock;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'bossboard_access_token';
const REFRESH_KEY = 'bossboard_refresh_token';
const USER_KEY = 'bossboard_user';

const baseUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  phone: null,
  tradeType: 'plumber',
  businessName: 'Test Plumbing Ltd',
  isVerified: true,
  onboardingCompleted: true,
  subscriptionTier: 'free' as const,
};

const baseTokens = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
};

function ok(data: unknown) {
  return { data: { success: true, data } };
}

function fail(message: string) {
  return { data: { success: false, message } };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ---------------------------------------------------------------------------
// Setup — reset mocks and restore in-memory store behaviour
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear the in-memory store
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);

  jest.clearAllMocks();
  resetActiveJobLogSuppressionsForTests();

  // Restore storage mock implementations
  mockGetItem.mockImplementation(async (key: string) => mockStore[key] ?? null);
  mockSetItem.mockImplementation(async (key: string, value: string) => {
    mockStore[key] = value;
  });
  mockDeleteItem.mockImplementation(async (key: string) => {
    delete mockStore[key];
  });

  mockRemovePushToken.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed mockStore so the provider restores a session on mount */
function seedSession(user = baseUser, access = baseTokens.accessToken, refresh = baseTokens.refreshToken) {
  mockStore[TOKEN_KEY] = access;
  mockStore[REFRESH_KEY] = refresh;
  mockStore[USER_KEY] = JSON.stringify(user);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContext', () => {
  // -------------------------------------------------------------------------
  // Initial state — no persisted session
  // -------------------------------------------------------------------------

  describe('initial state with no persisted session', () => {
    it('starts loading, then settles to unauthenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Session restore
  // -------------------------------------------------------------------------

  describe('session restore', () => {
    it('restores session when stored token is valid', async () => {
      seedSession();
      mockApiGet.mockResolvedValueOnce(ok({ user: baseUser }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe(baseUser.email);
      expect(mockSetAuthToken).toHaveBeenCalledWith(baseTokens.accessToken);
    });

    it('refreshes tokens when stored token is expired', async () => {
      seedSession(baseUser, 'expired-token');

      mockApiGet
        .mockRejectedValueOnce(new Error('401'))
        .mockResolvedValueOnce(ok({ user: baseUser }));
      mockApiPost.mockResolvedValueOnce(
        ok({ tokens: { accessToken: 'new-access', refreshToken: 'new-refresh' } })
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);
      expect(mockStore[TOKEN_KEY]).toBe('new-access');
      expect(mockStore[REFRESH_KEY]).toBe('new-refresh');
    });

    it('clears auth when no refresh token is stored', async () => {
      mockStore[TOKEN_KEY] = 'expired-token';
      mockStore[USER_KEY] = JSON.stringify(baseUser);
      // No REFRESH_KEY

      mockApiGet.mockRejectedValueOnce(new ApiError('Token expired', 401, 'TOKEN_EXPIRED'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStore[TOKEN_KEY]).toBeUndefined();
    });

    it('clears auth when refresh is definitively rejected (401)', async () => {
      seedSession(baseUser, 'expired-token');

      mockApiGet.mockRejectedValueOnce(new ApiError('Token expired', 401, 'TOKEN_EXPIRED'));
      mockApiPost.mockRejectedValueOnce(
        new ApiError('Invalid refresh token', 401, 'INVALID_TOKEN')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStore[TOKEN_KEY]).toBeUndefined();
    });

    it('keeps stored session when /auth/me is unreachable on cold start', async () => {
      seedSession();
      mockApiGet.mockRejectedValue(
        new NetworkError('Cannot reach BossBoard servers', 'NETWORK_ERROR')
      );
      mockApiPost.mockRejectedValue(
        new NetworkError('Cannot reach BossBoard servers', 'NETWORK_ERROR')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe(baseUser.email);
      expect(mockStore[TOKEN_KEY]).toBe(baseTokens.accessToken);
      expect(mockStore[REFRESH_KEY]).toBe(baseTokens.refreshToken);
    });

    it('restores stored session after process-death remount without a live login', async () => {
      seedSession();
      mockApiGet.mockRejectedValue(
        new NetworkError('Cannot reach BossBoard servers', 'NETWORK_ERROR')
      );
      mockApiPost.mockRejectedValue(
        new NetworkError('Cannot reach BossBoard servers', 'NETWORK_ERROR')
      );

      const first = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(first.result.current.isLoading).toBe(false));
      expect(first.result.current.isAuthenticated).toBe(true);

      first.unmount();

      const second = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(second.result.current.isLoading).toBe(false));

      expect(second.result.current.isAuthenticated).toBe(true);
      expect(second.result.current.user?.email).toBe(baseUser.email);
      expect(mockSetAuthToken).toHaveBeenCalledWith(baseTokens.accessToken);
      expect(mockStore[TOKEN_KEY]).toBe(baseTokens.accessToken);
    });
  });

  // -------------------------------------------------------------------------
  // login()
  // -------------------------------------------------------------------------

  describe('login()', () => {
    it('sets user and stores tokens on success', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockAuthLogin.mockResolvedValueOnce(ok({ user: baseUser, tokens: baseTokens }));

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe(baseUser.email);
      expect(mockStore[TOKEN_KEY]).toBe(baseTokens.accessToken);
      expect(mockStore[REFRESH_KEY]).toBe(baseTokens.refreshToken);
      expect(mockSetAuthToken).toHaveBeenCalledWith(baseTokens.accessToken);
      expect(mockAuthLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('throws on API success: false response', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockAuthLogin.mockResolvedValueOnce(fail('Invalid credentials'));

      await expect(
        act(async () => result.current.login('bad@example.com', 'wrong'))
      ).rejects.toThrow('Invalid credentials');

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('propagates network errors', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockAuthLogin.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        act(async () => result.current.login('test@example.com', 'pass'))
      ).rejects.toThrow('Network error');
    });
  });

  // -------------------------------------------------------------------------
  // register()
  // -------------------------------------------------------------------------

  describe('register()', () => {
    it('stores tokens, sets user, and returns verification code', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(
        ok({
          user: { ...baseUser, isVerified: false },
          tokens: baseTokens,
          verificationCode: '123456',
        })
      );

      let code!: string;
      await act(async () => {
        code = await result.current.register({ email: 'new@example.com', password: 'pass123' });
      });

      expect(code).toBe('123456');
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockStore[TOKEN_KEY]).toBe(baseTokens.accessToken);
    });

    it('throws when registration fails', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(fail('Email already exists'));

      await expect(
        act(async () =>
          result.current.register({ email: 'dup@example.com', password: 'pass' })
        )
      ).rejects.toThrow('Email already exists');
    });
  });

  // -------------------------------------------------------------------------
  // logout()
  // -------------------------------------------------------------------------

  describe('logout()', () => {
    it('clears user, tokens, and calls logout API', async () => {
      seedSession();
      mockApiGet.mockResolvedValueOnce(ok({ user: baseUser }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      mockApiPost.mockResolvedValueOnce({ data: { success: true } });

      setActiveJobLogOwner(baseUser.id);
      invalidateActiveJobLog('job-prior-session');
      expect(isActiveJobLogSuppressed('job-prior-session')).toBe(true);

      await act(async () => result.current.logout());

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(mockStore[TOKEN_KEY]).toBeUndefined();
      expect(mockSetAuthToken).toHaveBeenLastCalledWith(null);
      expect(isActiveJobLogSuppressed('job-prior-session')).toBe(false);
    });

    it('clears local state even when logout API fails', async () => {
      seedSession();
      mockApiGet.mockResolvedValueOnce(ok({ user: baseUser }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      mockApiPost.mockRejectedValueOnce(new Error('Server error'));

      await act(async () => result.current.logout());

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // verifyEmail()
  // -------------------------------------------------------------------------

  describe('verifyEmail()', () => {
    it('updates user to verified', async () => {
      seedSession({ ...baseUser, isVerified: false });
      mockApiGet.mockResolvedValueOnce(ok({ user: { ...baseUser, isVerified: false } }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(ok({ user: { ...baseUser, isVerified: true } }));

      await act(async () => result.current.verifyEmail('654321'));

      expect(result.current.user?.isVerified).toBe(true);
      expect(JSON.parse(mockStore[USER_KEY]).isVerified).toBe(true);
    });

    it('throws on invalid code', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(fail('Invalid code'));

      await expect(
        act(async () => result.current.verifyEmail('000000'))
      ).rejects.toThrow('Invalid code');
    });
  });

  // -------------------------------------------------------------------------
  // completeOnboarding()
  // -------------------------------------------------------------------------

  describe('completeOnboarding()', () => {
    it('marks onboarding complete', async () => {
      seedSession({ ...baseUser, onboardingCompleted: false });
      mockApiGet.mockResolvedValueOnce(ok({ user: { ...baseUser, onboardingCompleted: false } }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(ok({ user: { ...baseUser, onboardingCompleted: true } }));

      await act(async () => result.current.completeOnboarding());

      expect(result.current.user?.onboardingCompleted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // updateProfile()
  // -------------------------------------------------------------------------

  describe('updateProfile()', () => {
    it('updates fields and persists to storage', async () => {
      seedSession();
      mockApiGet.mockResolvedValueOnce(ok({ user: baseUser }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      const updated = { ...baseUser, name: 'Updated Name', phone: '021000000' };
      mockApiPut.mockResolvedValueOnce(ok({ user: updated }));

      await act(async () =>
        result.current.updateProfile({ name: 'Updated Name', phone: '021000000' })
      );

      expect(result.current.user?.name).toBe('Updated Name');
      expect(result.current.user?.phone).toBe('021000000');
      expect(JSON.parse(mockStore[USER_KEY]).name).toBe('Updated Name');
    });

    it('throws on validation error', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPut.mockResolvedValueOnce(fail('Validation error'));

      await expect(
        act(async () => result.current.updateProfile({ name: '' }))
      ).rejects.toThrow('Validation error');
    });
  });

  // -------------------------------------------------------------------------
  // refreshUser()
  // -------------------------------------------------------------------------

  describe('refreshUser()', () => {
    it('fetches updated user and persists to storage', async () => {
      seedSession();
      mockApiGet.mockResolvedValueOnce(ok({ user: baseUser }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      const upgraded = { ...baseUser, subscriptionTier: 'tradie' as const };
      mockApiGet.mockResolvedValueOnce(ok({ user: upgraded }));

      await act(async () => result.current.refreshUser());

      expect(result.current.user?.subscriptionTier).toBe('tradie');
    });

    it('does not throw when refresh API call fails', async () => {
      seedSession();
      mockApiGet
        .mockResolvedValueOnce(ok({ user: baseUser }))
        .mockRejectedValueOnce(new Error('Server error'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await expect(act(async () => result.current.refreshUser())).resolves.not.toThrow();
      expect(result.current.user?.email).toBe(baseUser.email);
    });
  });

  // -------------------------------------------------------------------------
  // useAuth() guard
  // -------------------------------------------------------------------------

  describe('useAuth() guard', () => {
    it('throws when used outside AuthProvider', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within an AuthProvider'
      );
      spy.mockRestore();
    });
  });
});
