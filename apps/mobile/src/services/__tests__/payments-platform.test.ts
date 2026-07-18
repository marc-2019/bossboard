/**
 * Ship policy: native store binaries never open Stripe Checkout.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const mockCreateCheckout = jest.fn();
const mockCreatePaymentSheet = jest.fn();

jest.mock('../api', () => ({
  subscriptionsApi: {
    getIapProducts: jest.fn(),
    verifyIap: jest.fn(),
    createCheckoutSession: (...a: unknown[]) => mockCreateCheckout(...a),
    createPaymentSheetSession: (...a: unknown[]) => mockCreatePaymentSheet(...a),
  },
}));

jest.mock(
  'react-native-iap',
  () => {
    throw new Error('native module not in jest');
  },
  { virtual: true }
);

import { startPaidUpgrade } from '../payments';

describe('iOS ship payment policy', () => {
  it('does not open Stripe Checkout when IAP module is missing on iOS', async () => {
    const out = await startPaidUpgrade('tradie');
    expect(['error', 'unavailable']).toContain(out.result);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    expect(mockCreatePaymentSheet).not.toHaveBeenCalled();
    expect(out.channel).toBe('iap');
  });
});
