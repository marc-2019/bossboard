/**
 * Multi-rail payments for subscription upgrades.
 *
 * App Store / Play ship policy (digital feature unlock):
 *  - iOS: StoreKit IAP is the primary (and only) paid rail inside the app.
 *  - Android: Play Billing when enabled; otherwise Stripe.
 *  - Web / Stripe Checkout: not used as the iOS primary path (Guideline 3.1.1).
 *
 * Rails:
 *  Phase 3 — StoreKit / Play Billing (IAP)
 *  Phase 2 — Stripe PaymentSheet (Android / non-store fallback)
 *  Phase 1 — Stripe Checkout browser (explicit non-iOS fallback only)
 *
 * IAP: enabled on iOS by default; set EXPO_PUBLIC_IAP_ENABLED=false to disable.
 * Android IAP: set EXPO_PUBLIC_IAP_ENABLED=true when Play products are live.
 */

import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { subscriptionsApi } from './api';

export type PaidTier = 'tradie' | 'team';

const DEEP_LINK_SUCCESS = 'bossboard://subscription/success';
const DEEP_LINK_CANCEL = 'bossboard://subscription/cancel';

export function isIapEnabledForPlatform(): boolean {
  const flag = process.env.EXPO_PUBLIC_IAP_ENABLED;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  // Ship default: iOS uses App Store billing; Android opt-in via flag
  return Platform.OS === 'ios';
}

/** Phase 1: open Stripe-hosted Checkout (not used as iOS primary). */
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
 * Used on Android / when store IAP is unavailable — not the iOS App Store path.
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
  const data = res.data?.data as
    | {
        betaMode?: boolean;
        paymentIntentClientSecret?: string;
        customerId?: string;
        ephemeralKeySecret?: string;
      }
    | undefined;
  if (data?.betaMode) return 'beta';
  if (!data?.paymentIntentClientSecret || !data?.customerId || !data?.ephemeralKeySecret) {
    return 'unavailable';
  }

  const { error: initError } = await initPaymentSheet({
    merchantDisplayName: 'BossBoard',
    customerId: data.customerId,
    customerEphemeralKeySecret: data.ephemeralKeySecret,
    paymentIntentClientSecret: data.paymentIntentClientSecret,
    allowsDelayedPaymentMethods: false,
    applePay: Platform.OS === 'ios' ? { merchantCountryCode: 'NZ' } : undefined,
    googlePay:
      Platform.OS === 'android'
        ? { merchantCountryCode: 'NZ', testEnv: __DEV__ }
        : undefined,
    returnURL: DEEP_LINK_SUCCESS,
  });
  if (initError) {
    console.warn('[payments] initPaymentSheet', initError.message);
    return 'unavailable';
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
 * Phase 3: native IAP (StoreKit / Play).
 * Requires react-native-iap, store products, and server verify (IAP_APPLE_SHARED_SECRET on API).
 */
export async function purchaseWithStoreIap(
  tier: PaidTier
): Promise<'verified' | 'beta' | 'unavailable' | 'error'> {
  if (!isIapEnabledForPlatform()) {
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
      Platform.OS === 'ios' ? products?.ios?.[tier] : products?.android?.[tier];
    if (!productId) return 'error';

    await RNIap.initConnection();

    // Ensure product is known to the store before purchase
    try {
      if (RNIap.getSubscriptions) {
        await RNIap.getSubscriptions({ skus: [productId] });
      } else if (RNIap.getProducts) {
        await RNIap.getProducts({ skus: [productId] });
      }
    } catch (e) {
      console.warn('[payments] IAP product fetch', e);
    }

    const purchase = await RNIap.requestSubscription({
      sku: productId,
      ...(Platform.OS === 'android' ? { subscriptionOffers: undefined } : {}),
    });

    const purchaseObj = Array.isArray(purchase) ? purchase[0] : purchase;
    const transactionId =
      purchaseObj?.transactionId ||
      purchaseObj?.purchaseToken ||
      purchaseObj?.transactionReceipt;
    const receiptOrToken =
      purchaseObj?.transactionReceipt || purchaseObj?.purchaseToken || '';

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
        await RNIap.finishTransaction({ purchase: purchaseObj, isConsumable: false });
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
 * Platform-aware upgrade entry.
 * iOS → IAP only (App Store). Android → IAP if enabled, else Stripe.
 */
export async function startPaidUpgrade(tier: PaidTier): Promise<{
  channel: 'payment_sheet' | 'iap' | 'checkout' | 'beta' | 'none';
  result: string;
  message?: string;
}> {
  // --- iOS: App Store IAP is the production path for digital subscriptions ---
  if (Platform.OS === 'ios') {
    const iap = await purchaseWithStoreIap(tier);
    if (iap === 'beta') return { channel: 'beta', result: 'beta' };
    if (iap === 'verified') return { channel: 'iap', result: 'verified' };
    if (iap === 'unavailable') {
      return {
        channel: 'none',
        result: 'error',
        message:
          'App Store subscriptions are not available on this build yet. ' +
          'Install a store build with In-App Purchases configured, or try again later.',
      };
    }
    return {
      channel: 'iap',
      result: 'error',
      message:
        'Could not complete App Store purchase. Check you are signed into the App Store, ' +
        'that subscription products are available, and try again.',
    };
  }

  // --- Android / other: prefer Play IAP when enabled, else Stripe ---
  const iap = await purchaseWithStoreIap(tier);
  if (iap === 'beta') return { channel: 'beta', result: 'beta' };
  if (iap === 'verified') return { channel: 'iap', result: 'verified' };

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
  startPaidUpgrade,
  isIapEnabledForPlatform,
};
