import { renderHook, act } from '@testing-library/react-native';
import { AuthContext } from '../../src/contexts/AuthContext';
import { SecureStore } from 'expo-secure-store';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  SecureStore: {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  },
}));

describe('AuthContext', () => {
  const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

  beforeEach(() => {
    mockDeleteItemAsync.mockClear();
  });

  it('should clear tokens on logout', () => {
    const { result } = renderHook(() => React.useContext(AuthContext), {
      wrapper: ({ children }) => (
        <AuthContext.Provider value={{ 
          authToken: 'test-token', 
          user: { id: 1, email: 'test@example.com' },
          login: jest.fn(),
          logout: jest.fn(),
          clearAuth: jest.fn()
        }}>
          {children}
        </AuthContext.Provider>
      ),
    });

    // Mock the clearAuth function to test it directly
    const mockClearAuth = jest.fn();
    const { result: result2 } = renderHook(() => ({
      ...React.useContext(AuthContext),
      clearAuth: mockClearAuth
    }));

    // Call clearAuth
    act(() => {
      result2.current.clearAuth();
    });

    // Assert that deleteItemAsync was called with the correct keys
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('bossboard_access_token');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('bossboard_refresh_token');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('bossboard_user');
  });
});