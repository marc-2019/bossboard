import type { SubscriptionInfo } from '@bossboard/shared';

// A new checkout always creates a subscription. Fail closed for unknown or paid state.
export function canStartCheckout(s: SubscriptionInfo | null | undefined): boolean {
  return s?.tier === 'free' && s.stripeSubscriptionId === null;
}

export function safeStripeUrl(value: unknown, kind: 'checkout' | 'portal'): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = kind === 'checkout' ? 'checkout.stripe.com' : 'billing.stripe.com';
    return url.protocol === 'https:' && url.hostname === host && !url.port &&
      !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
