/**
 * Native IAP purchase-start robustness (App Review 2.1(b) / 2.2).
 *
 * Catalog API must not be a single point of failure at purchase start.
 * iOS / Android store builds must not take a BETA_MODE short-circuit.
 */

const mockGetIapProducts = jest.fn();
const mockVerifyIap = jest.fn();
const mockInitConnection = jest.fn();
const mockGetSubscriptions = jest.fn();
const mockRequestSubscription = jest.fn();
const mockEndConnection = jest.fn();
const mockFinishTransaction = jest.fn();
const mockGetAvailablePurchases = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}), { virtual: true });

jest.mock('../api', () => ({
  subscriptionsApi: {
    getIapProducts: (...args: unknown[]) => mockGetIapProducts(...args),
    verifyIap: (...args: unknown[]) => mockVerifyIap(...args),
    createCheckoutSession: jest.fn(),
    createPaymentSheetSession: jest.fn(),
  },
}));

jest.mock(
  'react-native-iap',
  () => ({
    initConnection: (...args: unknown[]) => mockInitConnection(...args),
    getSubscriptions: (...args: unknown[]) => mockGetSubscriptions(...args),
    requestSubscription: (...args: unknown[]) => mockRequestSubscription(...args),
    endConnection: (...args: unknown[]) => mockEndConnection(...args),
    finishTransaction: (...args: unknown[]) => mockFinishTransaction(...args),
    getAvailablePurchases: (...args: unknown[]) => mockGetAvailablePurchases(...args),
  }),
  { virtual: true }
);

import {
  FALLBACK_IAP_SKUS,
  purchaseWithStoreIap,
  resolveIapProductId,
  startPaidUpgrade,
} from '../payments';

beforeEach(() => {
  jest.clearAllMocks();
  mockInitConnection.mockResolvedValue(undefined);
  mockGetSubscriptions.mockResolvedValue([]);
  mockEndConnection.mockResolvedValue(undefined);
  mockFinishTransaction.mockResolvedValue(undefined);
  mockGetAvailablePurchases.mockResolvedValue([]);
  mockRequestSubscription.mockResolvedValue({
    transactionId: 'txn-1',
    transactionReceipt: 'receipt-1',
    productId: FALLBACK_IAP_SKUS.ios.tradie,
  });
});

describe('resolveIapProductId', () => {
  it('uses the API catalog when present', async () => {
    mockGetIapProducts.mockResolvedValue({
      data: { data: { products: { ios: { tradie: 'from.api.tradie', team: 'from.api.team' } } } },
    });
    await expect(resolveIapProductId('tradie')).resolves.toBe('from.api.tradie');
  });

  it('falls back when the catalog call throws', async () => {
    mockGetIapProducts.mockRejectedValue(new Error('network'));
    await expect(resolveIapProductId('tradie')).resolves.toBe(
      FALLBACK_IAP_SKUS.ios.tradie
    );
    await expect(resolveIapProductId('team')).resolves.toBe(
      FALLBACK_IAP_SKUS.ios.team
    );
  });

  it('falls back when the catalog is empty', async () => {
    mockGetIapProducts.mockResolvedValue({ data: { data: { products: {} } } });
    await expect(resolveIapProductId('tradie')).resolves.toBe(
      FALLBACK_IAP_SKUS.ios.tradie
    );
  });
});

describe('purchaseWithStoreIap iOS', () => {
  it('starts StoreKit with the fallback SKU if the catalog is down', async () => {
    mockGetIapProducts.mockRejectedValue(new Error('catalog down'));
    mockVerifyIap.mockResolvedValue({ data: { data: { verified: true } } });
    const result = await purchaseWithStoreIap('tradie');
    expect(mockRequestSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ sku: FALLBACK_IAP_SKUS.ios.tradie })
    );
    expect(result).toBe('verified');
  });

  it('does not return beta when verify reports betaMode (Guideline 2.2)', async () => {
    mockGetIapProducts.mockResolvedValue({
      data: {
        data: {
          products: {
            ios: {
              tradie: FALLBACK_IAP_SKUS.ios.tradie,
              team: FALLBACK_IAP_SKUS.ios.team,
            },
          },
        },
      },
    });
    mockVerifyIap.mockResolvedValue({
      data: { data: { betaMode: true, message: 'All features are free during beta!' } },
    });
    const result = await purchaseWithStoreIap('tradie');
    expect(result).toBe('error');
    expect(result).not.toBe('beta');
  });
});

describe('startPaidUpgrade iOS', () => {
  it('never reports channel beta', async () => {
    mockGetIapProducts.mockRejectedValue(new Error('catalog down'));
    mockVerifyIap.mockResolvedValue({
      data: { data: { betaMode: true } },
    });
    const out = await startPaidUpgrade('tradie');
    expect(out.channel).toBe('iap');
    expect(out.result).not.toBe('beta');
    expect(out.channel).not.toBe('beta');
  });
});
