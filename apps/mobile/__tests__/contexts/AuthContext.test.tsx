/**
 * AuthContext test
 * Verifies logout() clears the persisted JWT (and related keys) from SecureStore.
 */

// ---------------------------------------------------------------------------//
// Module mocks — must use inline factories so hoisting works correctly
// ----------------------------------------------------------------------------

// Tell React (used by react-test-renderer) we're in an act() environment so
// state updates flushed via act() don't emit "not wrapped in act(...)" warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock react-native for Platform (storage util reads Platform.OS at import)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// Mock the storage util directly — inline factory avoids hoisting issues.
// Reads resolve to null (no stored session); writes/deletes resolve to undefined.
jest.mock('../../src/utils/storage', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/api', () => ({
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
    removePushToken: jest.fn().mockResolvedValue(undefined),
  },
  NetworkError: class NetworkError extends Error {},
  TimeoutError: class TimeoutError extends Error {},
  ApiError: class ApiError extends Error {},
}));

// ---------------------------------------------------------------------------//
// Import subject under test (after mocks)
// ----------------------------------------------------------------------------

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import * as storage from '../../src/utils/storage';
import { setAuthToken } from '../../src/services/api';

// Typed accessors to the mocks
const mockDeleteItem = storage.deleteItemAsync as jest.Mock;
const mockSetAuthToken = setAuthToken as jest.Mock;

// The storage keys AuthContext persists under (see AuthContext.tsx).
const TOKEN_KEY = 'bossboard_access_token';
const REFRESH_KEY = 'bossboard_refresh_token';
const USER_KEY = 'bossboard_user';

// Capture the live context value so tests can call logout() and read state.
let authValue: ReturnType<typeof useAuth> | null = null;
function Capture() {
  authValue = useAuth();
  return null;
}

async function mountProvider() {
  let renderer: TestRenderer.ReactTestRenderer;
  // Mounting runs loadStoredAuth(); await it inside act to flush effects.
  await act(async () => {
    renderer = TestRenderer.create(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );
  });
  // @ts-expect-error assigned inside act callback
  return renderer;
}

describe('AuthContext logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // jest.clearAllMocks() resets implementations set via .mockResolvedValue
    (storage.getItemAsync as jest.Mock).mockResolvedValue(null);
    (storage.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    mockDeleteItem.mockResolvedValue(undefined);
    authValue = null;
  });

  test('logout() deletes the persisted JWT, refresh token, and user from SecureStore', async () => {
    const renderer = await mountProvider();

    await act(async () => {
      await authValue!.logout();
    });

    // The persisted JWT (access token) is cleared — the core assertion.
    expect(mockDeleteItem).toHaveBeenCalledWith(TOKEN_KEY);
    // Refresh token and cached user are cleared too.
    expect(mockDeleteItem).toHaveBeenCalledWith(REFRESH_KEY);
    expect(mockDeleteItem).toHaveBeenCalledWith(USER_KEY);
    // Exactly those three keys, nothing else.
    expect(mockDeleteItem).toHaveBeenCalledTimes(3);
    // In-memory auth header is also cleared.
    expect(mockSetAuthToken).toHaveBeenCalledWith(null);

    await act(async () => {
      renderer.unmount();
    });
  });

  test('logout() clears auth state after clearing SecureStore', async () => {
    const renderer = await mountProvider();

    await act(async () => {
      await authValue!.logout();
    });

    expect(authValue!.user).toBeNull();
    expect(authValue!.isAuthenticated).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});
