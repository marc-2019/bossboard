/**
 * BackButton — always-visible escape hatch (SWMS trap regression).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const passthrough = (name: string) => {
    const C = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(name, { ...props, ref }),
    );
    C.displayName = name;
    return C;
  };
  return {
    Platform: { OS: 'ios' },
    StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s || {} },
    TouchableOpacity: passthrough('TouchableOpacity'),
    View: passthrough('View'),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: mockCanGoBack,
    back: mockBack,
    replace: mockReplace,
  }),
}));

import { BackButton } from '../components/BackButton';

describe('BackButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with accessibility label and testID', () => {
    const { getByTestId, getByLabelText } = render(<BackButton />);
    expect(getByTestId('screen-back-button')).toBeTruthy();
    expect(getByLabelText('Go back')).toBeTruthy();
  });

  it('calls router.back when history exists', () => {
    mockCanGoBack.mockReturnValue(true);
    const { getByTestId } = render(<BackButton fallback="/(tabs)" />);
    fireEvent.press(getByTestId('screen-back-button'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to fallback when canGoBack is false (SWMS trap case)', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<BackButton fallback="/(tabs)" />);
    fireEvent.press(getByTestId('screen-back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
