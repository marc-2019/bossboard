/**
 * Multi-rail payments for subscription upgrades.
 *
 * Phase 1 — Stripe Checkout (browser) + wallets when Dashboard-enabled
 * Phase 2 — Stripe PaymentSheet (in-app Apple Pay / Google Pay / card)
 * Phase 3 — StoreKit / Play Billing (IAP) when platform credentials exist
 *
 * Prefer native sheet when publishable key + PaymentSheet init succeeds;
 * fall back to Checkout URL; IAP is opt-in via EXPO_PUBLIC_IAP_ENABLED=true.
 */

import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { subscriptionsApi } from './api';

export type PaidTier = 'tradie' | 'team';

const DEEP_LINK_SUCCESS = 'bossboard://subscription/success';
const DEEP_LINK_CANCEL = 'bossboard://subscription/cancel';

/** Phase 1: open Stripe-hosted Checkout (Apple/Google Pay may appear on page). */
export async function openStripeCheckout(tier: PaidTier): Promise<'opened' | 'beta' | 'error'> {
  const res = await subscriptionsApi.createCheckoutSession({
    tier,
    successUrl: DEEP_LINK_SUCCESS,
    cancelUrl: DEEP_LINK_CANCEL,
  });
  const data = res.data?.data;
  if (data?.betaMode) return 'beta';
  if (!data?.url) return 'error';

  // Prefer auth session so return deep links can bounce back into the app
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
    // Apple Pay / Google Pay — merchant IDs configured via app.json + Stripe Dashboard
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

/**
 * Phase 3: native IAP. Requires react-native-iap + store products + server verify.
 * Returns unavailable until native module + EXPO_PUBLIC_IAP_ENABLED.
 */
export async function purchaseWithStoreIap(
  tier: PaidTier
): Promise<'verified' | 'beta' | 'unavailable' | 'error'> {
  if (process.env.EXPO_PUBLIC_IAP_ENABLED !== 'true') {
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
    const cat = await subscriptionsApi.getIapProducts();
    const products = cat.data?.data?.products;
    const productId =
      Platform.OS === 'ios'
        ? products?.ios?.[tier]
        : products?.android?.[tier];
    if (!productId) return 'error';

    await RNIap.initConnection();
    const purchase = await RNIap.requestSubscription({ sku: productId });
    const transactionId =
      purchase?.transactionId || purchase?.purchaseToken || purchase?.transactionReceipt;
    const receiptOrToken =
      purchase?.transactionReceipt || purchase?.purchaseToken || '';

    if (!transactionId || !receiptOrToken) {
      return 'error';
    }

    const verify = await subscriptionsApi.verifyIap({
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      productId,
      transactionId: String(transactionId),
      receiptOrToken: String(receiptOrToken),
    });
    if (verify.data?.data?.betaMode) return 'beta';
    if (verify.data?.data?.verified) {
      try {
        await RNIap.finishTransaction({ purchase, isConsumable: false });
      } catch {
        /* ignore finish errors */
      }
      return 'verified';
    }
    return 'error';
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
 * Prefer native PaymentSheet, then IAP if enabled, else Checkout browser.
 */
export async function startPaidUpgrade(tier: PaidTier): Promise<{
  channel: 'payment_sheet' | 'iap' | 'checkout' | 'beta' | 'none';
  result: string;
}> {
  // Try PaymentSheet first (best in-app friction when publishable key is set)
  const sheet = await presentStripePaymentSheet(tier);
  if (sheet === 'beta') return { channel: 'beta', result: 'beta' };
  if (sheet === 'paid') return { channel: 'payment_sheet', result: 'paid' };
  if (sheet === 'canceled') return { channel: 'payment_sheet', result: 'canceled' };

  // Optional store IAP (App Store / Play) when explicitly enabled
  const iap = await purchaseWithStoreIap(tier);
  if (iap === 'beta') return { channel: 'beta', result: 'beta' };
  if (iap === 'verified') return { channel: 'iap', result: 'verified' };

  // Fallback: Stripe Checkout in browser (wallets if Dashboard-enabled)
  const co = await openStripeCheckout(tier);
  if (co === 'beta') return { channel: 'beta', result: 'beta' };
  if (co === 'opened') return { channel: 'checkout', result: 'opened' };

  return { channel: 'none', result: 'error' };
}

export default {
  openStripeCheckout,
  presentStripePaymentSheet,
  purchaseWithStoreIap,
  startPaidUpgrade,
};
