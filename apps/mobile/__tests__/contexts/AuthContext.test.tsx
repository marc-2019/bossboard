/**
 * AuthContext.logout() — token-clearing test
 *
 * Focused test asserting that logout() clears the persisted JWT (and the
 * companion refresh token + cached user) from SecureStore by calling
 * deleteItemAsync with the correct storage keys.
 *
 * (A broader AuthContext suite lives at src/contexts/__tests__/AuthContext.test.tsx;
 * this file is the narrowly-scoped logout token-clearing assertion.)
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Module mocks — inline factories so jest hoisting resolves them correctly
// ---------------------------------------------------------------------------

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../../src/utils/storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../../src/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
  setAuthToken: jest.fn(),
  notificationsApi: {
    removePushToken: jest.fn(),
  },
}));

// Import subject under test after the mocks are registered
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import * as storage from '../../src/utils/storage';
import { api, notificationsApi } from '../../src/services/api';

const mockGetItem = storage.getItemAsync as jest.Mock;
const mockDeleteItem = storage.deleteItemAsync as jest.Mock;
const mockApiGet = (api as any).get as jest.Mock;
const mockApiPost = (api as any).post as jest.Mock;
const mockRemovePushToken = (notificationsApi as any).removePushToken as jest.Mock;

// Keys defined in AuthContext.tsx
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

// In-memory store so a session can be restored on mount
const mockStore: Record<string, string> = {};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  jest.clearAllMocks();

  mockGetItem.mockImplementation(async (key: string) => mockStore[key] ?? null);
  mockDeleteItem.mockImplementation(async (key: string) => {
    delete mockStore[key];
  });
  mockRemovePushToken.mockResolvedValue(undefined);
});

describe('AuthContext.logout()', () => {
  it('clears the persisted JWT from SecureStore', async () => {
    // Seed a restored session so there is a token to clear
    mockStore[TOKEN_KEY] = 'valid-access-token';
    mockStore[REFRESH_KEY] = 'valid-refresh-token';
    mockStore[USER_KEY] = JSON.stringify(baseUser);
    mockApiGet.mockResolvedValueOnce({ data: { success: true, data: { user: baseUser } } });
    mockApiPost.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    // Act
    await act(async () => {
      await result.current.logout();
    });

    // Assert — the access token (JWT) is deleted with its exact key
    expect(mockDeleteItem).toHaveBeenCalledWith(TOKEN_KEY);
    // ...along with the refresh token and cached user
    expect(mockDeleteItem).toHaveBeenCalledWith(REFRESH_KEY);
    expect(mockDeleteItem).toHaveBeenCalledWith(USER_KEY);
  });
});
