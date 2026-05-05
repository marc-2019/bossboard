import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

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

import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import * as storage from '../../src/utils/storage';
import { api, notificationsApi } from '../../src/services/api';

const mockGetItem = storage.getItemAsync as jest.Mock;
const mockDeleteItem = storage.deleteItemAsync as jest.Mock;
const mockApiGet = (api as any).get as jest.Mock;
const mockApiPost = (api as any).post as jest.Mock;
const mockRemovePushToken = (notificationsApi as any).removePushToken as jest.Mock;

const TOKEN_KEY = 'bossboard_access_token';
const REFRESH_KEY = 'bossboard_refresh_token';
const USER_KEY = 'bossboard_user';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext.logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockRemovePushToken.mockResolvedValue(undefined);
  });

  it('clears persisted JWT and refresh token from SecureStore', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetItem.mockResolvedValueOnce('refresh-xyz');
    mockApiPost.mockResolvedValueOnce({ data: { success: true } });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockDeleteItem).toHaveBeenCalledWith(TOKEN_KEY);
    expect(mockDeleteItem).toHaveBeenCalledWith(REFRESH_KEY);
    expect(mockDeleteItem).toHaveBeenCalledWith(USER_KEY);
  });
});
