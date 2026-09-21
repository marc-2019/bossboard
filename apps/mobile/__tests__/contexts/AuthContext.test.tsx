/**
 * AuthContext test
 * Verifies logout() clears the persisted JWT from SecureStore.
 */

// ---------------------------------------------------------------------------//
// Module mocks — must use inline factories so hoisting works correctly
// ----------------------------------------------------------------------------

// Tell React (used by react-test-renderer) we're in an act() environment so
// state updates flushed via act() don't emit "not wrapped in act(...)" warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock react-native for Platform (storage util reads Platform.OS at import).
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// AuthContext imports SecureStore from '../utils/storage' (NOT expo-secure-store
// directly). Mock that module with a flat factory matching its named exports.
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

const mockDeleteItem = storage.deleteItemAsync as jest.Mock;

// The storage key AuthContext persists the access token (JWT) under.
// See TOKEN_KEY in AuthContext.tsx.
const TOKEN_KEY = 'bossboard_access_token';

// Capture the live context value so the test can call logout().
let authValue: ReturnType<typeof useAuth> | null = null;
function Capture() {
  authValue = useAuth();
  return null;
}

describe('AuthContext logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // jest.clearAllMocks() also resets .mockResolvedValue implementations.
    (storage.getItemAsync as jest.Mock).mockResolvedValue(null);
    (storage.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    mockDeleteItem.mockResolvedValue(undefined);
    authValue = null;
  });

  test('logout() deletes the persisted JWT from SecureStore', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    // Mounting runs loadStoredAuth(); await it inside act to flush effects.
    await act(async () => {
      renderer = TestRenderer.create(
        <AuthProvider>
          <Capture />
        </AuthProvider>
      );
    });

    await act(async () => {
      await authValue!.logout();
    });

    expect(mockDeleteItem).toHaveBeenCalledWith(TOKEN_KEY);

    await act(async () => {
      renderer.unmount();
    });
  });
});
