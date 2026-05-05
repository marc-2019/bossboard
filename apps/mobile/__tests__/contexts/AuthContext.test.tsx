import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { useAuth } from '../../src/contexts/AuthContext';

// Mock ../utils/storage (as used in AuthContext)
jest.mock('../../src/utils/storage', () => ({
  SecureStore: {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  },
}));

// Mock ../services/api
jest.mock('../../src/services/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
  },
  notificationsApi: {
    removePushToken: jest.fn(),
  },
}));

import { SecureStore } from '../../src/utils/storage';
import { api, notificationsApi } from '../../src/services/api';

describe('AuthContext', () => {
  const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;
  const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
  const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;
  const mockApiPost = api.post as jest.Mock;
  const mockRemovePushToken = notificationsApi.removePushToken as jest.Mock;

  beforeEach(() => {
    mockDeleteItemAsync.mockClear();
    mockGetItemAsync.mockClear();
    mockSetItemAsync.mockClear();
    mockApiPost.mockClear();
    mockRemovePushToken.mockClear();
  });

  it('should clear tokens on logout', async () => {
    // Set up initial state with tokens and user in SecureStore
    mockGetItemAsync
      .mockResolvedValueOnce('test-access-token') // TOKEN_KEY
      .mockResolvedValueOnce('test-refresh-token') // REFRESH_KEY
      .mockResolvedValueOnce(JSON.stringify({ id: '1', email: 'test@example.com' })); // USER_KEY

    // Render the AuthProvider wrapper
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    // Get the auth context using useAuth hook within the provider
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Call logout
    await act(async () => {
      await result.current.logout();
    });

    // Assert that deleteItemAsync was called with the correct keys
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('bossboard_access_token');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('bossboard_refresh_token');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('bossboard_user');
  });
});