import { describe, it, expect, jest } from '@jest/globals';

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
}));

describe('AuthContext logout', () => {
  it('should clear the persisted JWT from SecureStore', async () => {
    // Import the actual logout function
    const { logout } = require('../../src/contexts/AuthContext');
    const { deleteItemAsync } = require('expo-secure-store');
    
    await logout();
    
    expect(deleteItemAsync).toHaveBeenCalledWith('jwt_token');
  });
});