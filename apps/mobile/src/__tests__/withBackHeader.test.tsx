/**
 * withBackHeader always supplies headerLeft BackButton (not native-only).
 */
import React from 'react';
import { render } from '@testing-library/react-native';

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

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: () => false,
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));
jest.mock('../theme/colors', () => ({
  colors: { primary: '#FF6B35' },
}));

import { withBackHeader } from '../navigation/headerOptions';

describe('withBackHeader', () => {
  it('disables native headerBackVisible and sets headerLeft', () => {
    const opts = withBackHeader('SWMS Details', { fallback: '/(tabs)' });
    expect(opts.headerShown).toBe(true);
    expect(opts.headerBackVisible).toBe(false);
    expect(opts.title).toBe('SWMS Details');
    expect(typeof opts.headerLeft).toBe('function');
  });

  it('headerLeft renders BackButton with testID', () => {
    const opts = withBackHeader('Invoice');
    const Left = opts.headerLeft as () => React.ReactElement;
    const { getByTestId } = render(Left());
    expect(getByTestId('screen-back-button')).toBeTruthy();
  });
});
