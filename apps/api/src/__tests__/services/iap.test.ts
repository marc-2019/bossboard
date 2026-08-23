/**
 * IAP verification service — fail-closed, catalog, Google JWT helper.
 */

const mockQuery = jest.fn();
const mockUpdateSubscriptionTier = jest.fn();

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

jest.mock('../../services/subscriptions.js', () => ({
  updateSubscriptionTier: (...args: unknown[]) => mockUpdateSubscriptionTier(...args),
}));

const iapConfig = {
  appleTradieProductId: 'nz.instilligent.bossboard.tradie.weekly',
  appleTeamProductId: 'nz.instilligent.bossboard.team.weekly',
  googleTradieProductId: 'bossboard_tradie_weekly',
  googleTeamProductId: 'bossboard_team_weekly',
  appleSharedSecret: '',
  googleServiceAccountJson: '',
  googlePackageName: 'nz.instilligent.bossboard',
};

jest.mock('../../config/index.js', () => ({
  config: { iap: iapConfig },
}));

import {
  listIapProductCatalog,
  tierForProductId,
  verifyAndActivateIap,
  getGoogleAccessToken,
} from '../../services/iap.js';

describe('tierForProductId', () => {
  it('maps iOS product ids', () => {
    expect(tierForProductId('ios', 'nz.instilligent.bossboard.tradie.weekly')).toBe('tradie');
    expect(tierForProductId('ios', 'nz.instilligent.bossboard.team.weekly')).toBe('team');
    expect(tierForProductId('ios', 'unknown')).toBeNull();
  });

  it('maps Android product ids', () => {
    expect(tierForProductId('android', 'bossboard_tradie_weekly')).toBe('tradie');
    expect(tierForProductId('android', 'bossboard_team_weekly')).toBe('team');
  });
});

describe('listIapProductCatalog', () => {
  it('returns configured product ids', () => {
    const c = listIapProductCatalog();
    expect(c.ios.tradie).toContain('tradie');
    expect(c.android.team).toContain('team');
  });
});

describe('verifyAndActivateIap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    iapConfig.appleSharedSecret = '';
    iapConfig.googleServiceAccountJson = '';
    mockQuery.mockResolvedValue({ rows: [] });
    mockUpdateSubscriptionTier.mockResolvedValue({ tier: 'tradie' });
  });

  it('rejects unknown products with 400', async () => {
    await expect(
      verifyAndActivateIap({
        userId: 'u1',
        platform: 'ios',
        productId: 'not.a.product',
        transactionId: 'tx1',
        receiptOrToken: 'receipt',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'IAP_UNKNOWN_PRODUCT' });
  });

  it('fail-closed when Apple secret missing', async () => {
    await expect(
      verifyAndActivateIap({
        userId: 'u1',
        platform: 'ios',
        productId: 'nz.instilligent.bossboard.tradie.weekly',
        transactionId: 'tx1',
        receiptOrToken: 'receipt-data',
      })
    ).rejects.toMatchObject({ statusCode: 503, code: 'IAP_APPLE_NOT_CONFIGURED' });
  });

  it('fail-closed when Google service account missing', async () => {
    await expect(
      verifyAndActivateIap({
        userId: 'u1',
        platform: 'android',
        productId: 'bossboard_tradie_weekly',
        transactionId: 'tx1',
        receiptOrToken: 'purchase-token',
      })
    ).rejects.toMatchObject({ statusCode: 503, code: 'IAP_GOOGLE_NOT_CONFIGURED' });
  });

  it('restores an active weekly period without treating it as a one-time unlock', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'r1', tier: 'tradie', expires_at: future }],
    });

    const result = await verifyAndActivateIap({
      userId: 'u1',
      platform: 'ios',
      productId: 'nz.instilligent.bossboard.tradie.weekly',
      transactionId: 'tx-existing',
      receiptOrToken: 'receipt',
    });

    expect(result.verified).toBe(true);
    expect(result.tier).toBe('tradie');
    expect(result.expiresAt).toBe(future.toISOString());
    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'u1',
      'tradie',
      expect.objectContaining({ startedAt: expect.any(Date), expiresAt: future })
    );
  });

  it('does not re-grant a lapsed weekly subscription from a stored row', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'r1', tier: 'tradie', expires_at: past }],
    });
    iapConfig.appleSharedSecret = '';

    await expect(
      verifyAndActivateIap({
        userId: 'u1',
        platform: 'ios',
        productId: 'nz.instilligent.bossboard.tradie.weekly',
        transactionId: 'tx-lapsed',
        receiptOrToken: 'receipt',
      })
    ).rejects.toMatchObject({ statusCode: 503, code: 'IAP_APPLE_NOT_CONFIGURED' });
    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('verifies Apple receipt when secret set and product matches', async () => {
    iapConfig.appleSharedSecret = 'test-shared-secret';
    const futureMs = String(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 0,
        latest_receipt_info: [
          {
            product_id: 'nz.instilligent.bossboard.tradie.weekly',
            transaction_id: 'tx-apple-1',
            expires_date_ms: futureMs,
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // idempotency select
      .mockResolvedValueOnce({ rows: [] }); // insert

    const result = await verifyAndActivateIap({
      userId: 'u1',
      platform: 'ios',
      productId: 'nz.instilligent.bossboard.tradie.weekly',
      transactionId: 'tx-apple-1',
      receiptOrToken: 'base64-receipt',
    });

    expect(result.verified).toBe(true);
    expect(result.tier).toBe('tradie');
    expect(mockUpdateSubscriptionTier).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('verifies Google purchase via Android Publisher when SA set', async () => {
    // Minimal RSA key for unit test JWT signing
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    iapConfig.googleServiceAccountJson = JSON.stringify({
      client_email: 'iap@test.iam.gserviceaccount.com',
      private_key: pem,
      token_uri: 'https://oauth2.googleapis.com/token',
    });

    const futureMs = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const fetchMock = jest
      .fn()
      // token exchange
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'ya29.test-token' }),
      })
      // purchases.subscriptions.get
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          paymentState: 1,
          expiryTimeMillis: futureMs,
          orderId: 'GPA.1234',
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await verifyAndActivateIap({
      userId: 'u1',
      platform: 'android',
      productId: 'bossboard_tradie_weekly',
      transactionId: 'GPA.1234',
      receiptOrToken: 'purchase-token-xyz',
    });

    expect(result.verified).toBe(true);
    expect(result.tier).toBe('tradie');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const publisherUrl = String(fetchMock.mock.calls[1][0]);
    expect(publisherUrl).toContain('androidpublisher.googleapis.com');
    expect(publisherUrl).toContain('bossboard_tradie_weekly');
  });
});

describe('getGoogleAccessToken', () => {
  it('POSTs a JWT assertion and returns access_token', async () => {
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-abc' }),
    });

    const token = await getGoogleAccessToken(
      {
        client_email: 'sa@test.iam.gserviceaccount.com',
        private_key: pem,
      },
      fetchImpl as unknown as typeof fetch
    );

    expect(token).toBe('token-abc');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
