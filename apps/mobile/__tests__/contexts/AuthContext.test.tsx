import React from 'react';
import { render, act } from '@testing-library/react-native';
import { AuthContext, useAuth } from '../../src/contexts/AuthContext';
import * as SecureStore from '../../src/utils/storage';

jest.mock('../../src/utils/storage');

describe('AuthContext', () => {
  it('clears tokens from SecureStore on logout', async () => {
    // Arrange
    const mockDeleteItemAsync = jest.fn();
    SecureStore.deleteItemAsync.mockReturnValue(Promise.resolve());
    
    const { getByTestId } = render(
      <AuthContext.Provider>
        <AuthContext.Consumer>
          {({ logout }) => (
            <button onPress={logout} testID="logout-button">
              Logout
            </button>
          )}
        </AuthContext.Consumer>
      </AuthContext.Provider>
    );

    const logoutButton = getByTestId('logout-button');

    // Act
    await act(async () => {
      await logoutButton.props.onPress();
    });

    // Assert
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      expect.stringContaining('TOKEN_KEY'),
      expect.stringContaining('REFRESH_KEY'),
      expect.stringContaining('USER_KEY')
    );
  });
});