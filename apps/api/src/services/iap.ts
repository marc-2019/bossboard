/**
 * Native store IAP verification (Phase 3).
 *
 * Product IDs must match App Store Connect / Google Play Console.
 * Full production verification uses:
 *  - Apple: App Store Server API (or legacy verifyReceipt with shared secret)
 *  - Google: Android Publisher API with service account
 *
 * Until platform credentials are configured, verification records the attempt
 * and returns a clear "not configured" error — never silently grants tier.
 */

import { config } from '../config/index.js';
import { SubscriptionTier } from '../types/index.js';
import { updateSubscriptionTier } from './subscriptions.js';
import db from './database.js';

export type IapPlatform = 'ios' | 'android';

export interface IapVerifyInput {
  userId: string;
  platform: IapPlatform;
  productId: string;
  /** Store transaction / purchase token */
  transactionId: string;
  /** Full receipt (iOS base64) or purchase token (Android) */
  receiptOrToken: string;
  /** Android only — package name override */
  packageName?: string;
}

export interface IapVerifyResult {
  tier: SubscriptionTier;
  platform: IapPlatform;
  productId: string;
  transactionId: string;
  expiresAt: string | null;
  verified: boolean;
}

function tierForProductId(platform: IapPlatform, productId: string): SubscriptionTier | null {
  if (platform === 'ios') {
    if (productId === config.iap.appleTradieProductId) return 'tradie';
    if (productId === config.iap.appleTeamProductId) return 'team';
  } else {
    if (productId === config.iap.googleTradieProductId) return 'tradie';
    if (productId === config.iap.googleTeamProductId) return 'team';
  }
  return null;
}

export function listIapProductCatalog(): {
  ios: { tradie: string; team: string };
  android: { tradie: string; team: string };
} {
  return {
    ios: {
      tradie: config.iap.appleTradieProductId,
      team: config.iap.appleTeamProductId,
    },
    android: {
      tradie: config.iap.googleTradieProductId,
      team: config.iap.googleTeamProductId,
    },
  };
}

/**
 * Verify a store purchase and, on success, set subscription_tier.
 * Idempotent on transaction_id.
 */
export async function verifyAndActivateIap(
  input: IapVerifyInput
): Promise<IapVerifyResult> {
  const tier = tierForProductId(input.platform, input.productId);
  if (!tier) {
    throw Object.assign(new Error(`Unknown IAP product: ${input.productId}`), {
      statusCode: 400,
      code: 'IAP_UNKNOWN_PRODUCT',
    });
  }

  // Idempotency: already verified this transaction
  const existing = await db.query<{ id: string; tier: string }>(
    `SELECT id, tier FROM store_subscription_receipts
     WHERE transaction_id = $1 AND platform = $2 LIMIT 1`,
    [input.transactionId, input.platform]
  );
  if (existing.rows[0]) {
    return {
      tier: existing.rows[0].tier as SubscriptionTier,
      platform: input.platform,
      productId: input.productId,
      transactionId: input.transactionId,
      expiresAt: null,
      verified: true,
    };
  }

  if (input.platform === 'ios') {
    await verifyAppleReceipt(input);
  } else {
    await verifyGooglePurchase(input);
  }

  // Persist receipt + activate tier (store is billing rail; no stripe_subscription_id)
  await db.query(
    `INSERT INTO store_subscription_receipts
       (user_id, platform, product_id, transaction_id, payload, tier, verified_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
     ON CONFLICT (transaction_id, platform) DO NOTHING`,
    [
      input.userId,
      input.platform,
      input.productId,
      input.transactionId,
      JSON.stringify({
        receiptOrTokenPreview: input.receiptOrToken.slice(0, 32) + '…',
      }),
      tier,
    ]
  );

  await updateSubscriptionTier(input.userId, tier, {
    // Store-billed: no Stripe subscription id
    stripeSubscriptionId: undefined,
    startedAt: new Date(),
  });

  return {
    tier,
    platform: input.platform,
    productId: input.productId,
    transactionId: input.transactionId,
    expiresAt: null,
    verified: true,
  };
}

async function verifyAppleReceipt(input: IapVerifyInput): Promise<void> {
  // Production: call App Store Server API with IAP_APPLE_SHARED_SECRET / .p8 key.
  // Until credentials exist, refuse activation (fail closed).
  if (!config.iap.appleSharedSecret) {
    throw Object.assign(
      new Error(
        'Apple IAP verification is not configured (IAP_APPLE_SHARED_SECRET). ' +
          'Create auto-renewable subscriptions in App Store Connect, then set the shared secret.'
      ),
      { statusCode: 503, code: 'IAP_APPLE_NOT_CONFIGURED' }
    );
  }

  // Legacy verifyReceipt path (works with shared secret; migrate to Server API later)
  const endpoints = [
    'https://buy.itunes.apple.com/verifyReceipt',
    'https://sandbox.itunes.apple.com/verifyReceipt',
  ];
  let lastStatus = -1;
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': input.receiptOrToken,
        password: config.iap.appleSharedSecret,
        'exclude-old-transactions': true,
      }),
    });
    const body = (await res.json()) as { status?: number };
    lastStatus = body.status ?? -1;
    if (lastStatus === 0) return;
    // 21007 = sandbox receipt sent to production → try next
    if (lastStatus !== 21007) break;
  }
  throw Object.assign(new Error(`Apple receipt verification failed (status ${lastStatus})`), {
    statusCode: 400,
    code: 'IAP_APPLE_VERIFY_FAILED',
  });
}

async function verifyGooglePurchase(_input: IapVerifyInput): Promise<void> {
  if (!config.iap.googleServiceAccountJson) {
    throw Object.assign(
      new Error(
        'Google Play IAP verification is not configured (IAP_GOOGLE_SERVICE_ACCOUNT_JSON). ' +
          'Create a subscription in Play Console and attach a service account.'
      ),
      { statusCode: 503, code: 'IAP_GOOGLE_NOT_CONFIGURED' }
    );
  }

  // Production: use googleapis androidpublisher.purchases.subscriptionsv2.get
  // with the service account. Fail closed until wired.
  throw Object.assign(
    new Error(
      'Google Play verification client not yet wired — service account is set but ' +
        'Android Publisher API integration is pending. Contact support.'
    ),
    { statusCode: 503, code: 'IAP_GOOGLE_NOT_IMPLEMENTED' }
  );
}

export default {
  listIapProductCatalog,
  verifyAndActivateIap,
  tierForProductId,
};
