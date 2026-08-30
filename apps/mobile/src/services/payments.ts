/**
 * Multi-rail payments for subscription upgrades.
 *
 * Dual-rail (store-compliant — Guideline 3.1.1 / Play Billing):
 *  - iOS / Android: native StoreKit / Play Billing only (react-native-iap).
 *    Never open Stripe Checkout or PaymentSheet from the mobile binary —
 *    that is a guaranteed App Store / Play reject on the NZ storefront.
 *  - Web / non-store: Stripe PaymentSheet → Checkout browser.
 *
 * Entitlements are cross-honoured server-side via users.subscription_tier
 * (web Stripe webhook and POST /subscriptions/iap/verify both write the same field).
 *
 * Kill-switch: EXPO_PUBLIC_IAP_ENABLED=false disables native IAP (dev only).
 * Default is enabled on native so store builds do not require a secret flag.
 */

import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { subscriptionsApi } from './api';

export type PaidTier = 'tradie' | 'team';

const DEEP_LINK_SUCCESS = 'bossboard://subscription/success';
const DEEP_LINK_CANCEL = 'bossboard://subscription/cancel';

function isNativeStorePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** IAP is on by default on native; set EXPO_PUBLIC_IAP_ENABLED=false to force-disable. */
function isIapEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_IAP_ENABLED === 'false') return false;
  // Explicit true always on; default true on native store platforms
  if (process.env.EXPO_PUBLIC_IAP_ENABLED === 'true') return true;
  return isNativeStorePlatform();
}

/**
 * Hardcoded SKUs matching App Store Connect / Play Console.
 * GET /iap/products is preferred, but purchase start must not fail if the
 * catalog call is empty or down (Guideline 2.1(b) error at purchase start).
 */
export const FALLBACK_IAP_SKUS = {
  ios: {
    tradie: 'nz.instilligent.bossboard.tradie.weekly',
    team: 'nz.instilligent.bossboard.team.weekly',
  },
  android: {
    tradie: 'bossboard_tradie_weekly',
    team: 'bossboard_team_weekly',
  },
} as const;

export async function resolveIapProductId(tier: PaidTier): Promise<string> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const fallback = FALLBACK_IAP_SKUS[platform][tier];
  try {
    const cat = await subscriptionsApi.getIapProducts();
    const products = cat.data?.data?.products;
    const productId =
      platform === 'ios' ? products?.ios?.[tier] : products?.android?.[tier];
    if (typeof productId === 'string' && productId.length > 0) return productId;
  } catch (e) {
    console.warn('[payments] IAP catalog', e);
  }
  return fallback;
}

function knownIapSkuList(): string[] {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return [FALLBACK_IAP_SKUS[platform].tradie, FALLBACK_IAP_SKUS[platform].team];
}

/** Phase 1: open Stripe-hosted Checkout (web / non-store only). */
export async function openStripeCheckout(tier: PaidTier): Promise<'opened' | 'beta' | 'error'> {
  const res = await subscriptionsApi.createCheckoutSession({
    tier,
    successUrl: DEEP_LINK_SUCCESS,
    cancelUrl: DEEP_LINK_CANCEL,
  });
  const data = res.data?.data;
  if (data?.betaMode) return 'beta';
  if (!data?.url) return 'error';

  try {
    await WebBrowser.openAuthSessionAsync(data.url, DEEP_LINK_SUCCESS);
  } catch {
    const ok = await Linking.canOpenURL(data.url);
    if (!ok) return 'error';
    await Linking.openURL(data.url);
  }
  return 'opened';
}

/**
 * Phase 2: PaymentSheet via @stripe/stripe-react-native.
 * Dynamic import so Expo Go without native module still loads the app.
 * Used on web / non-store only — never as the primary native upgrade path.
 */
export async function presentStripePaymentSheet(
  tier: PaidTier
): Promise<'paid' | 'canceled' | 'beta' | 'unavailable' | 'error'> {
  let initPaymentSheet: any;
  let presentPaymentSheet: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stripe = require('@stripe/stripe-react-native');
    initPaymentSheet = stripe.initPaymentSheet;
    presentPaymentSheet = stripe.presentPaymentSheet;
  } catch {
    return 'unavailable';
  }

  const res = await subscriptionsApi.createPaymentSheetSession({ tier });
  const data = res.data?.data;
  if (data?.betaMode) return 'beta';
  if (!data?.paymentIntentClientSecret || !data?.ephemeralKeySecret) {
    return 'error';
  }

  const { error: initError } = await initPaymentSheet({
    merchantDisplayName: 'BossBoard',
    customerId: data.customerId,
    customerEphemeralKeySecret: data.ephemeralKeySecret,
    paymentIntentClientSecret: data.paymentIntentClientSecret,
    allowsDelayedPaymentMethods: false,
    applePay: Platform.OS === 'ios' ? { merchantCountryCode: 'NZ' } : undefined,
    googlePay: Platform.OS === 'android'
      ? { merchantCountryCode: 'NZ', testEnv: false, currencyCode: 'NZD' }
      : undefined,
    returnURL: DEEP_LINK_SUCCESS,
  });

  if (initError) {
    console.warn('[payments] initPaymentSheet', initError.message);
    return 'error';
  }

  const { error: presentError } = await presentPaymentSheet();
  if (presentError) {
    if (presentError.code === 'Canceled') return 'canceled';
    console.warn('[payments] presentPaymentSheet', presentError.message);
    return 'error';
  }
  return 'paid';
}

type IapOutcome = 'verified' | 'beta' | 'unavailable' | 'canceled' | 'error';

function extractPurchaseFields(purchase: any): {
  transactionId: string;
  receiptOrToken: string;
  productId?: string;
} {
  const transactionId = String(
    purchase?.transactionId ||
      purchase?.id ||
      purchase?.orderId ||
      purchase?.purchaseToken ||
      ''
  );
  const receiptOrToken = String(
    purchase?.transactionReceipt || purchase?.purchaseToken || purchase?.transactionId || ''
  );
  const productId = purchase?.productId || purchase?.productIds?.[0] || purchase?.id;
  return { transactionId, receiptOrToken, productId };
}

async function verifyPurchaseWithServer(
  productId: string,
  purchase: any
): Promise<'verified' | 'beta' | 'error'> {
  const { transactionId, receiptOrToken } = extractPurchaseFields(purchase);
  if (!transactionId || !receiptOrToken) return 'error';

  const verify = await subscriptionsApi.verifyIap({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    productId,
    transactionId,
    receiptOrToken,
  });
  if (verify.data?.data?.betaMode) {
    // Native store builds must not take a beta/launch-free short-circuit (Guideline 2.2).
    return isNativeStorePlatform() ? 'error' : 'beta';
  }
  if (verify.data?.data?.verified) return 'verified';
  return 'error';
}

/**
 * Native IAP via react-native-iap + server verify.
 * Default-on for iOS/Android store builds.
 */
export async function purchaseWithStoreIap(tier: PaidTier): Promise<IapOutcome> {
  if (!isIapEnabled()) {
    return 'unavailable';
  }

  let RNIap: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RNIap = require('react-native-iap');
  } catch {
    return 'unavailable';
  }

  try {
    const productId = await resolveIapProductId(tier);

    await RNIap.initConnection();

    // Ensure product is known to the store before requesting
    try {
      if (typeof RNIap.getSubscriptions === 'function') {
        await RNIap.getSubscriptions({ skus: [productId] });
      } else if (typeof RNIap.fetchProducts === 'function') {
        await RNIap.fetchProducts({ skus: [productId], type: 'subs' });
      }
    } catch (e) {
      console.warn('[payments] IAP product fetch', e);
    }

    let purchase: any;
    try {
      purchase = await RNIap.requestSubscription({
        sku: productId,
        // Android Play Billing Library 5+ may need offer tokens from getSubscriptions;
        // when present on the SKU response, RNIap attaches them. sku-only works for
        // single-base-plan subscriptions configured in Play Console.
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    } catch (e: any) {
      const code = e?.code || e?.message || '';
      if (
        String(code).includes('E_USER_CANCELLED') ||
        String(code).toLowerCase().includes('cancel')
      ) {
        return 'canceled';
      }
      throw e;
    }

    // requestSubscription can return an array on some Android paths
    const purchaseObj = Array.isArray(purchase) ? purchase[0] : purchase;
    if (!purchaseObj) return 'error';

    const result = await verifyPurchaseWithServer(productId, purchaseObj);
    if (result === 'verified') {
      try {
        await RNIap.finishTransaction({ purchase: purchaseObj, isConsumable: false });
      } catch {
        /* ignore finish errors — server already activated */
      }
    }
    return result;
  } catch (e) {
    console.warn('[payments] IAP', e);
    return 'error';
  } finally {
    try {
      await RNIap?.endConnection?.();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Restore previous store purchases (App Store / Play requirement).
 * Verifies each available purchase with the API and activates the best tier.
 */
export async function restoreStorePurchases(): Promise<
  'restored' | 'none' | 'beta' | 'unavailable' | 'error'
> {
  if (!isIapEnabled() || !isNativeStorePlatform()) {
    return 'unavailable';
  }

  let RNIap: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RNIap = require('react-native-iap');
  } catch {
    return 'unavailable';
  }

  try {
    const known = new Set<string>(knownIapSkuList());
    try {
      const cat = await subscriptionsApi.getIapProducts();
      const products = cat.data?.data?.products;
      const extra = Platform.OS === 'ios'
        ? [products?.ios?.tradie, products?.ios?.team]
        : [products?.android?.tradie, products?.android?.team];
      for (const sku of extra) {
        if (typeof sku === 'string' && sku.length > 0) known.add(sku);
      }
    } catch (e) {
      console.warn('[payments] IAP catalog (restore)', e);
    }

    await RNIap.initConnection();
    const available: any[] =
      (await RNIap.getAvailablePurchases?.()) ||
      (await RNIap.getPurchaseHistory?.()) ||
      [];

    let anyVerified = false;
    for (const purchase of available) {
      const productId =
        purchase?.productId || purchase?.productIds?.[0] || purchase?.id;
      if (!productId || !known.has(productId)) continue;
      const result = await verifyPurchaseWithServer(String(productId), purchase);
      if (result === 'beta') {
        if (isNativeStorePlatform()) continue;
        return 'beta';
      }
      if (result === 'verified') {
        anyVerified = true;
        try {
          await RNIap.finishTransaction?.({ purchase, isConsumable: false });
        } catch {
          /* ignore */
        }
      }
    }
    return anyVerified ? 'restored' : 'none';
  } catch (e) {
    console.warn('[payments] restore', e);
    return 'error';
  } finally {
    try {
      await RNIap?.endConnection?.();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Start paid upgrade using the store-compliant rail for this platform.
 *
 * Native → IAP only (no Stripe fallback).
 * Web → PaymentSheet then Checkout.
 */
export async function startPaidUpgrade(tier: PaidTier): Promise<{
  channel: 'payment_sheet' | 'iap' | 'checkout' | 'beta' | 'none';
  result: string;
}> {
  // ── App Store / Play: IAP only ──────────────────────────────────────────
  if (isNativeStorePlatform()) {
    const iap = await purchaseWithStoreIap(tier);
    if (iap === 'beta') {
      // Native IAP must not surface a beta channel (Guideline 2.2).
      return { channel: 'iap', result: 'error' };
    }
    if (iap === 'verified') return { channel: 'iap', result: 'verified' };
    if (iap === 'canceled') return { channel: 'iap', result: 'canceled' };
    // Do not open Stripe from the binary — 3.1.1 / Play Billing policy.
    return {
      channel: 'iap',
      result: iap === 'unavailable' ? 'unavailable' : 'error',
    };
  }

  // ── Web / other: Stripe rails ───────────────────────────────────────────
  const sheet = await presentStripePaymentSheet(tier);
  if (sheet === 'beta') return { channel: 'beta', result: 'beta' };
  if (sheet === 'paid') return { channel: 'payment_sheet', result: 'paid' };
  if (sheet === 'canceled') return { channel: 'payment_sheet', result: 'canceled' };

  const co = await openStripeCheckout(tier);
  if (co === 'beta') return { channel: 'beta', result: 'beta' };
  if (co === 'opened') return { channel: 'checkout', result: 'opened' };

  return { channel: 'none', result: 'error' };
}

export default {
  openStripeCheckout,
  presentStripePaymentSheet,
  purchaseWithStoreIap,
  restoreStorePurchases,
  startPaidUpgrade,
};
