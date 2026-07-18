/**
 * F-AUTH-05 mobile onboarding UI — automated without device recordings.
 * Mirrors screens from setup Screen Recording (trade → company → bank → Get Started).
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockAlert = jest.fn();

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
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
    StyleSheet: {
      create: (s: unknown) => s,
      flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
      hairlineWidth: 1,
      absoluteFill: {},
    },
    View: passthrough('View'),
    Text: passthrough('Text'),
    TextInput: passthrough('TextInput'),
    TouchableOpacity: passthrough('TouchableOpacity'),
    ScrollView: passthrough('ScrollView'),
    KeyboardAvoidingView: passthrough('KeyboardAvoidingView'),
    ActivityIndicator: passthrough('ActivityIndicator'),
  };
});

const mockCompleteOnboarding = jest.fn();
const mockRefreshUser = jest.fn();
const mockProfileUpdate = jest.fn();
const mockApiPut = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      email: 'apple-review@instilligent.com',
      name: 'Apple App Review',
      onboardingCompleted: false,
      tradeType: null,
      businessName: null,
      phone: null,
    },
    completeOnboarding: mockCompleteOnboarding,
    refreshUser: mockRefreshUser,
  }),
}));

jest.mock('../services/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code = 'API_ERROR') {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiError,
    businessProfileApi: {
      update: (...args: unknown[]) => mockProfileUpdate(...args),
    },
    api: {
      put: (...args: unknown[]) => mockApiPut(...args),
    },
  };
});

import OnboardingScreen from '../../app/(auth)/onboarding';

describe('OnboardingScreen UI (automated, no recording)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileUpdate.mockResolvedValue({ data: { success: true }, status: 200 });
    mockApiPut.mockResolvedValue({ data: { success: true }, status: 200 });
    mockCompleteOnboarding.mockResolvedValue(undefined);
    mockRefreshUser.mockResolvedValue(undefined);
  });

  async function goToStep(screen: ReturnType<typeof render>, target: 1 | 2 | 3) {
    if (target >= 1) {
      expect(screen.getByText(/What's your trade/i)).toBeTruthy();
      expect(screen.getByText(/Step 1 of 3/i)).toBeTruthy();
    }
    if (target >= 2) {
      fireEvent.press(screen.getByText(/Builder/i));
      fireEvent.press(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText(/Company Details/i)).toBeTruthy());
      expect(screen.getByText(/Step 2 of 3/i)).toBeTruthy();
      expect(screen.getByText(/Business Email/i)).toBeTruthy();
    }
    if (target >= 3) {
      fireEvent.press(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText(/Bank Details/i)).toBeTruthy());
      expect(screen.getByText(/Step 3 of 3/i)).toBeTruthy();
      expect(screen.getByText(/Get Started/i)).toBeTruthy();
      expect(screen.getByText(/Skip setup/i)).toBeTruthy();
    }
  }

  it('walks step 1 → 2 → 3 labels matching production UI', async () => {
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    expect(screen.getByText(/Account Number/i)).toBeTruthy();
    expect(screen.getByText(/NZ format/i)).toBeTruthy();
  });

  it('happy path: Get Started saves profile, updates me, completes onboarding', async () => {
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    await act(async () => {
      fireEvent.press(screen.getByText('Get Started'));
    });
    await waitFor(() => expect(mockProfileUpdate).toHaveBeenCalled());
    expect(mockApiPut).toHaveBeenCalled();
    expect(mockCompleteOnboarding).toHaveBeenCalled();
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalledWith(
      'Setup Error',
      expect.anything(),
      expect.anything(),
    );
  });

  it('blocks invalid email on leaving company step with field error', async () => {
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 2);
    // prefilled email is valid — overwrite with garbage
    const emailInput = screen.getByPlaceholderText(/accounts@yourbusiness/i);
    fireEvent.changeText(emailInput, 'not-an-email');
    fireEvent.press(screen.getByText('Next'));
    // still on step 2
    await waitFor(() => expect(screen.getByText(/Enter a valid email/i)).toBeTruthy());
    expect(screen.queryByText(/Bank Details/i)).toBeNull();
  });

  it('blocks short bank account on Get Started', async () => {
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    const bankInput = screen.getByPlaceholderText(/00-0000/i);
    fireEvent.changeText(bankInput, '12345');
    await act(async () => {
      fireEvent.press(screen.getByText('Get Started'));
    });
    await waitFor(() => expect(mockAlert).toHaveBeenCalled());
    const [title, msg] = mockAlert.mock.calls[0];
    expect(title).toBe('Check your details');
    expect(String(msg)).toMatch(/15–16 digits|bank/i);
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it('shows Setup Error with step label when business-profile fails', async () => {
    mockProfileUpdate.mockRejectedValueOnce(
      Object.assign(new Error('Invalid email format'), {
        name: 'ApiError',
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    );
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    await act(async () => {
      fireEvent.press(screen.getByText('Get Started'));
    });
    await waitFor(() => expect(mockAlert).toHaveBeenCalled());
    const [title, message, buttons] = mockAlert.mock.calls[0];
    expect(title).toBe('Setup Error');
    expect(String(message)).toMatch(/Business profile/i);
    expect(String(message)).toMatch(/Invalid email format/i);
    expect(buttons.some((b: { text?: string }) => b.text === 'Skip for Now')).toBe(true);
    expect(buttons.some((b: { text?: string }) => b.text === 'Try Again')).toBe(true);
  });

  it('Skip for Now on Setup Error still completes onboarding', async () => {
    mockProfileUpdate.mockRejectedValueOnce(new Error('network down'));
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    await act(async () => {
      fireEvent.press(screen.getByText('Get Started'));
    });
    await waitFor(() => expect(mockAlert).toHaveBeenCalled());
    const buttons = mockAlert.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void | Promise<void>;
    }>;
    const skip = buttons.find((b) => b.text === 'Skip for Now');
    await act(async () => {
      await skip!.onPress!();
    });
    expect(mockCompleteOnboarding).toHaveBeenCalled();
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('Skip setup button finishes without profile save', async () => {
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    await act(async () => {
      fireEvent.press(screen.getByText(/Skip setup/i));
    });
    await waitFor(() => expect(mockCompleteOnboarding).toHaveBeenCalled());
    expect(mockProfileUpdate).not.toHaveBeenCalled();
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('labels trade/business errors separately when auth/me fails', async () => {
    mockApiPut.mockRejectedValueOnce(
      Object.assign(new Error('Invalid trade type'), {
        name: 'ApiError',
        status: 400,
        code: 'VALIDATION_ERROR',
      }),
    );
    const screen = render(<OnboardingScreen />);
    await goToStep(screen, 3);
    await act(async () => {
      fireEvent.press(screen.getByText('Get Started'));
    });
    await waitFor(() => expect(mockAlert).toHaveBeenCalled());
    expect(String(mockAlert.mock.calls[0][1])).toMatch(/Trade \/ business name/i);
  });
});
