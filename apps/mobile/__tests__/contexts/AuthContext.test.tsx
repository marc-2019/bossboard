import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import * as storage from '../../src/utils/storage';
import { api, notificationsApi } from '../../src/services/api';

// Mock react-native
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// Mock the storage util
jest.mock('../../src/utils/storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock the API and notifications API
jest.mock('../../src/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
  notificationsApi: {
    removePushToken: jest.fn(),
  },
}));

const TOKEN_KEY = 'bossboard_access_token';

describe('AuthContext logout', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clear the persisted JWT from SecureStore', async () => {
    const mockDeleteItem = storage.deleteItemAsync as jest.Mock;
    const mockApiGet = api.get as jest.Mock;
    const mockApiPost = api.post as jest.Mock;
    const mockRemovePushToken = notificationsApi.removePushToken as jest.Mock;

    // Mock initial load (unauthenticated)
    mockApiGet.mockResolvedValue({ data: { success: false } });
    (storage.getItemAsync as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    // Wait for initial load to finish
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock successful logout API call
    mockApiPost.mockResolvedValue({ data: { success: true } });
    mockRemovePushToken.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.logout();
    });

    // Assert deleteItemAsync was called with the right key
    expect(mockDeleteItem).toHaveBeenCalledWith(TOKEN_KEY);
    
    // Also check other keys for completeness
    expect(mockDeleteItem).toHaveBeenCalledWith('bossboard_refresh_token');
    expect(mockDeleteItem).toHaveBeenCalledWith('bossboard_user');
  });
});
