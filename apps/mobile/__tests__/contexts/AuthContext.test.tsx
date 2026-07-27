import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

// Mock SecureStore
jest.mock('../src/utils/storage', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock API services
jest.mock('../src/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
  notificationsApi: {
    removePushToken: jest.fn(),
  },
}));

describe('AuthContext', () => {
  let mockUser;
  let mockTokens;
  let mockAccessToken;
  let mockRefreshToken;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock user data
    mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      phone: null,
      tradeType: null,
      businessName: null,
      isVerified: true,
      onboardingCompleted: true,
      subscriptionTier: 'tradie',
    };
    
    // Mock tokens
    mockAccessToken = 'access_token';
    mockRefreshToken = 'refresh_token';
    
    // Mock API responses
    (require('../src/services/api').api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          user: mockUser,
        },
      },
    });
    
    (require('../src/services/api').api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          tokens: {
            accessToken: mockAccessToken,
            refreshToken: mockRefreshToken,
          },
        },
      },
    });
    
    // Mock SecureStore
    (require('../src/utils/storage').getItemAsync)
      .mockResolvedValue(mockAccessToken)
      .mockResolvedValue(mockRefreshToken)
      .mockResolvedValue(JSON.stringify(mockUser));
    
    (require('../src/utils/storage').setItemAsync)
      .mockResolvedValue(undefined);
    
    (require('../src/utils/storage').deleteItemAsync)
      .mockResolvedValue(undefined);
  });

  it('calls SecureStore.deleteItemAsync with the correct token key on logout', async () => {
    // Render the component
    const { result } = render(
      <AuthProvider>
        <View />
      </AuthProvider>
    );

    // Get the logout function
    const { logout } = useAuth();

    // Call logout
    await logout();

    // Verify that SecureStore.deleteItemAsync was called with the correct key
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('bossboard_access_token');
  });
});