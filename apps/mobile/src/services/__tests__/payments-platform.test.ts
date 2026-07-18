/**
 * Ship policy: iOS paid upgrades must not fall through to Stripe Checkout.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const mockGetIapProducts = jest.fn();
const mockVerifyIap = jest.fn();
const mockCreateCheckout = jest.fn();
const mockCreatePaymentSheet = jest.fn();

jest.mock('../api', () => ({
  subscriptionsApi: {
    getIapProducts: (...a: unknown[]) => mockGetIapProducts(...a),
    verifyIap: (...a: unknown[]) => mockVerifyIap(...a),
    createCheckoutSession: (...a: unknown[]) => mockCreateCheckout(...a),
    createPaymentSheetSession: (...a: unknown[]) => mockCreatePaymentSheet(...a),
  },
}));

// No native IAP module in Jest → purchaseWithStoreIap returns unavailable
jest.mock(
  'react-native-iap',
  () => {
    throw new Error('native module not in jest');
  },
  { virtual: true }
);

import { startPaidUpgrade, isIapEnabledForPlatform } from '../payments';

describe('iOS ship payment policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enables IAP by default on iOS', () => {
    expect(isIapEnabledForPlatform()).toBe(true);
  });

  it('does not open Stripe Checkout when IAP module is missing on iOS', async () => {
    const out = await startPaidUpgrade('tradie');
    expect(out.result).toBe('error');
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    expect(mockCreatePaymentSheet).not.toHaveBeenCalled();
    expect(out.message || '').toMatch(/App Store/i);
  });
});
