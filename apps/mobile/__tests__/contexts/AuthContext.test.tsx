import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import * as SecureStore from '../../src/utils/storage';

jest.mock('../../src/utils/storage');

describe('AuthContext', () => {
  let mockDeleteItemAsync: jest.Mock;
  let mockGetItemAsync: jest.Mock;

  beforeEach(() => {
    mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;
    mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
    
    // Clear mock history
    mockDeleteItemAsync.mockClear();
    mockGetItemAsync.mockClear();
  });

  it('calls SecureStore.deleteItemAsync with the correct key when logout is called', async () => {
    // Setup mock data
    mockGetItemAsync
      .mockResolvedValueOnce('valid_refresh_token'); // refresh token exists
    
    // Mock api.post to avoid actual network call
    const mockApiPost = jest.fn().mockResolvedValue({ data: { data: { refreshToken: 'valid_refresh_token' } } });
    
    // Mock api.post for logout endpoint
    const mockLogoutApi = jest.fn().mockResolvedValue({ data: { success: true } });
    
    // Create a wrapper component with AuthProvider
    const TestWrapper = () => (
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    const TestComponent = () => {
      const { logout } = useAuth();
      
      // Mock notificationsApi.removePushToken
      const mockNotificationsApi = {
        removePushToken: jest.fn().mockResolvedValue(undefined)
      };
      
      // Mock SecureStore.getItemAsync for refresh token
      SecureStore.getItemAsync.mockImplementation((key) => {
        if (key === 'REFRESH_KEY') return Promise.resolve('valid_refresh_token');
        return Promise.resolve(null);
      });
      
      // Mock api.post
      jest.spyOn(require('../../../services/api'), 'post').mockImplementationOnce(mockLogoutApi);
      
      return (
        <div data-testid="test-component">
          <button onPress={logout}>Logout</button>
        </div>
      );
    };
    
    // Render the component and trigger logout
    const { getByTestId } = render(<TestWrapper />);
    const logoutButton = getByTestId('test-component');
    
    // Mock notificationsApi.removePushToken
    const mockNotificationsApi = {
      removePushToken: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(require('../../../services/api'), 'notificationsApi').mockReturnValue(mockNotificationsApi);
    
    // Trigger logout
    await act(async () => {
      await logout();
    });
    
    // Verify that deleteItemAsync was called with the correct key
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(USER_KEY);
    
    // Verify that the logout API was called
    expect(mockLogoutApi).toHaveBeenCalledWith('/api/v1/auth/logout', { refreshToken: 'valid_refresh_token' });
  });
});