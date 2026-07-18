/**
 * SWMS detail always exposes an in-content Back control (no recording needed).
 * Regression: App Review walk trapped on SWMS Details with no chevron.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockGet = jest.fn();

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
    Alert: { alert: jest.fn() },
    StyleSheet: {
      create: (s: unknown) => s,
      flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
    },
    View: passthrough('View'),
    Text: passthrough('Text'),
    ScrollView: passthrough('ScrollView'),
    TouchableOpacity: passthrough('TouchableOpacity'),
    ActivityIndicator: passthrough('ActivityIndicator'),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'swms-1' }),
  useRouter: () => ({
    canGoBack: mockCanGoBack,
    back: mockBack,
    replace: mockReplace,
  }),
  Stack: { Screen: () => null },
}));

jest.mock('../services/api', () => ({
  swmsApi: {
    get: (...a: unknown[]) => mockGet(...a),
    sign: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../components/PhotoAttachments', () => 'PhotoAttachments');

import SWMSDetailScreen from '../../app/swms/[id]';

const sampleDoc = {
  id: 'swms-1',
  title: 'SWMS - Demo residential kitchen renovation for Apple App',
  trade_type: 'builder',
  status: 'draft',
  job_description: 'Demo job',
  site_address: '1 Demo Street Auckland',
  client_name: null,
  expected_duration: null,
  hazards: [
    {
      id: 'h1',
      hazard: 'Falls from height',
      risk_level: 'medium',
      control_measures: ['Training'],
    },
  ],
  ppe_required: ['Safety boots'],
  emergency_procedures: [],
  signatures: [],
  created_at: '2026-07-18T09:00:00Z',
  updated_at: '2026-07-18T09:00:00Z',
};

describe('SWMSDetailScreen back escape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
    mockGet.mockResolvedValue({ data: { success: true, data: { document: sampleDoc } } });
  });

  it('renders in-content Back control with testID after load', async () => {
    const screen = render(<SWMSDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('swms-detail-back')).toBeTruthy());
    expect(screen.getByLabelText('Go back')).toBeTruthy();
    expect(screen.getByText(/Demo residential kitchen/i)).toBeTruthy();
  });

  it('Back uses safeGoBack fallback to tabs when no history', async () => {
    const screen = render(<SWMSDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('swms-detail-back')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('swms-detail-back'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows Back to Home when document missing after failed load', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'));
    const screen = render(<SWMSDetailScreen />);
    // load fails → safeGoBack may fire; also not-found UI
    await waitFor(() => {
      // either navigated away via replace, or not-found back button
      const missing = screen.queryByTestId('swms-detail-back-missing');
      const replaced = mockReplace.mock.calls.length > 0;
      expect(missing || replaced).toBeTruthy();
    });
  });
});
