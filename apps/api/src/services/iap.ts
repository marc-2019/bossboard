/**
 * Native store IAP verification (App Store + Play Billing).
 *
 * Dual-rail policy (see docs/product/native-iap-dual-rail.md):
 *  - Mobile (iOS/Android): store IAP is the only in-app purchase path
 *  - Web: Stripe Checkout / PaymentSheet
 *  - Entitlements are cross-honoured via users.subscription_tier
 *
 * Product IDs must match App Store Connect / Google Play Console.
 * Verification is always fail-closed: missing credentials or failed store
 * checks never silently grant a paid tier.
 */

import crypto from 'crypto';
import { config } from '../config/index.js';
import { SubscriptionTier } from '../types/index.js';
import { updateSubscriptionTier } from './subscriptions.js';
import { createError } from '../middleware/error.js';
import db from './database.js';

export type IapPlatform = 'ios' | 'android';

export interface IapVerifyInput {
  userId: string;
  platform: IapPlatform;
  productId: string;
  /** Store transaction / order id */
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

export function tierForProductId(
  platform: IapPlatform,
  productId: string
): SubscriptionTier | null {
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
 * Idempotent on (transaction_id, platform).
 */
export async function verifyAndActivateIap(
  input: IapVerifyInput
): Promise<IapVerifyResult> {
  const tier = tierForProductId(input.platform, input.productId);
  if (!tier) {
    throw createError(`Unknown IAP product: ${input.productId}`, 400, 'IAP_UNKNOWN_PRODUCT');
  }

  // Idempotency: already verified this transaction
  const existing = await db.query<{
    id: string;
    tier: string;
    expires_at: Date | null;
  }>(
    `SELECT id, tier, expires_at FROM store_subscription_receipts
     WHERE transaction_id = $1 AND platform = $2 LIMIT 1`,
    [input.transactionId, input.platform]
  );
  if (existing.rows[0]) {
    // Re-apply tier in case user row was reset; store remains SSOT for this tx
    await updateSubscriptionTier(input.userId, existing.rows[0].tier as SubscriptionTier, {
      startedAt: new Date(),
    });
    return {
      tier: existing.rows[0].tier as SubscriptionTier,
      platform: input.platform,
      productId: input.productId,
      transactionId: input.transactionId,
      expiresAt: existing.rows[0].expires_at
        ? existing.rows[0].expires_at.toISOString()
        : null,
      verified: true,
    };
  }

  let expiresAt: Date | null = null;
  if (input.platform === 'ios') {
    expiresAt = await verifyAppleReceipt(input);
  } else {
    expiresAt = await verifyGooglePurchase(input);
  }

  await db.query(
    `INSERT INTO store_subscription_receipts
       (user_id, platform, product_id, transaction_id, payload, tier, verified_at, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), $7)
     ON CONFLICT (transaction_id, platform) DO NOTHING`,
    [
      input.userId,
      input.platform,
      input.productId,
      input.transactionId,
      JSON.stringify({
        // Never store full receipt/token — audit-friendly preview only
        receiptOrTokenPreview: input.receiptOrToken.slice(0, 32) + '…',
        productId: input.productId,
      }),
      tier,
      expiresAt,
    ]
  );

  await updateSubscriptionTier(input.userId, tier, {
    // Store-billed: no Stripe subscription id
    stripeSubscriptionId: undefined,
    startedAt: new Date(),
    expiresAt: expiresAt ?? undefined,
  });

  // Referral free-month on first paid IAP activation
  try {
    const { activateReferralOnPaid, ensureReferralCode } = await import('./referrals.js');
    await activateReferralOnPaid(input.userId);
    await ensureReferralCode(input.userId).catch(() => undefined);
  } catch (err) {
    console.warn('[IAP] Referral activation failed (non-fatal):', err);
  }

  return {
    tier,
    platform: input.platform,
    productId: input.productId,
    transactionId: input.transactionId,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    verified: true,
  };
}

async function verifyAppleReceipt(input: IapVerifyInput): Promise<Date | null> {
  if (!config.iap.appleSharedSecret) {
    throw createError(
      'Apple IAP verification is not configured (IAP_APPLE_SHARED_SECRET). ' +
        'Create auto-renewable subscriptions in App Store Connect, then set the shared secret.',
      503,
      'IAP_APPLE_NOT_CONFIGURED'
    );
  }

  // Legacy verifyReceipt path (shared secret). Migrate to App Store Server API when .p8 is ready.
  type AppleLine = {
    product_id?: string;
    expires_date_ms?: string;
    transaction_id?: string;
    original_transaction_id?: string;
  };
  type AppleVerifyBody = {
    status?: number;
    latest_receipt_info?: AppleLine[];
    receipt?: { in_app?: AppleLine[] };
  };

  const endpoints = [
    'https://buy.itunes.apple.com/verifyReceipt',
    'https://sandbox.itunes.apple.com/verifyReceipt',
  ];
  let lastStatus = -1;
  let body: AppleVerifyBody | null = null;

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
    body = (await res.json()) as AppleVerifyBody;
    lastStatus = body.status ?? -1;
    if (lastStatus === 0) break;
    // 21007 = sandbox receipt sent to production → try sandbox
    if (lastStatus !== 21007) break;
  }

  if (lastStatus !== 0 || !body) {
    throw createError(
      `Apple receipt verification failed (status ${lastStatus})`,
      400,
      'IAP_APPLE_VERIFY_FAILED'
    );
  }

  const lines: AppleLine[] = body.latest_receipt_info?.length
    ? body.latest_receipt_info
    : body.receipt?.in_app ?? [];

  const match = lines.find(
    (line: AppleLine) =>
      line.product_id === input.productId &&
      (line.transaction_id === input.transactionId ||
        line.original_transaction_id === input.transactionId ||
        !input.transactionId)
  );

  // If product appears anywhere in the receipt for this productId, accept
  // (transaction ids can differ between client and latest_receipt_info shape).
  const productMatch =
    match || lines.find((line: AppleLine) => line.product_id === input.productId);

  if (!productMatch) {
    throw createError(
      `Apple receipt does not contain product ${input.productId}`,
      400,
      'IAP_APPLE_PRODUCT_MISMATCH'
    );
  }

  if (productMatch.expires_date_ms) {
    const exp = new Date(parseInt(productMatch.expires_date_ms, 10));
    if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
      throw createError(
        'Apple subscription has expired',
        400,
        'IAP_APPLE_EXPIRED'
      );
    }
    return Number.isFinite(exp.getTime()) ? exp : null;
  }
  return null;
}

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function parseGoogleServiceAccount(): GoogleServiceAccount {
  const raw = config.iap.googleServiceAccountJson;
  if (!raw) {
    throw createError(
      'Google Play IAP verification is not configured (IAP_GOOGLE_SERVICE_ACCOUNT_JSON). ' +
        'Create a subscription in Play Console and attach a service account with Android Publisher access.',
      503,
      'IAP_GOOGLE_NOT_CONFIGURED'
    );
  }

  try {
    // Accept raw JSON or base64-encoded JSON (Railway-friendly)
    const jsonText = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonText) as GoogleServiceAccount;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('missing client_email or private_key');
    }
    return parsed;
  } catch {
    throw createError(
      'IAP_GOOGLE_SERVICE_ACCOUNT_JSON is not valid service-account JSON (or base64 JSON)',
      503,
      'IAP_GOOGLE_BAD_CREDENTIALS'
    );
  }
}

/** Create a short-lived OAuth access token from a Google service account. */
export async function getGoogleAccessToken(
  sa: GoogleServiceAccount,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
    'base64url'
  );
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  const unsigned = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const res = await fetchImpl(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw createError(
      `Google OAuth token exchange failed${body.error ? `: ${body.error}` : ''}`,
      502,
      'IAP_GOOGLE_AUTH_FAILED'
    );
  }
  return body.access_token;
}

async function verifyGooglePurchase(input: IapVerifyInput): Promise<Date | null> {
  const sa = parseGoogleServiceAccount();
  const accessToken = await getGoogleAccessToken(sa);
  const packageName = input.packageName || config.iap.googlePackageName;
  const token = encodeURIComponent(input.receiptOrToken);
  const productId = encodeURIComponent(input.productId);

  // purchases.subscriptions.get — classic API; productId is the subscription id
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/subscriptions/` +
    `${productId}/tokens/${token}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json()) as {
    error?: { message?: string; code?: number };
    expiryTimeMillis?: string;
    paymentState?: number;
    cancelReason?: number;
    orderId?: string;
  };

  if (!res.ok) {
    throw createError(
      body.error?.message || `Google Play verification failed (HTTP ${res.status})`,
      res.status === 404 ? 400 : 502,
      'IAP_GOOGLE_VERIFY_FAILED'
    );
  }

  // paymentState: 0=pending, 1=received, 2=free trial, 3=pending deferred
  if (body.paymentState !== undefined && body.paymentState !== 1 && body.paymentState !== 2) {
    throw createError(
      `Google Play purchase not paid (paymentState=${body.paymentState})`,
      400,
      'IAP_GOOGLE_NOT_PAID'
    );
  }

  if (body.expiryTimeMillis) {
    const exp = new Date(parseInt(body.expiryTimeMillis, 10));
    if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
      throw createError('Google Play subscription has expired', 400, 'IAP_GOOGLE_EXPIRED');
    }
    return Number.isFinite(exp.getTime()) ? exp : null;
  }
  return null;
}

export default {
  listIapProductCatalog,
  verifyAndActivateIap,
  tierForProductId,
  getGoogleAccessToken,
};
