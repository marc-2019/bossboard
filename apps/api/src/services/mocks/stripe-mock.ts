/**
 * Stripe Mock — Phase 6a (2026-05-23)
 *
 * Monkey-patches a real `Stripe` SDK client so calls that would normally hit
 * api.stripe.com return canned, realistic-looking JSON instead. Only mounted
 * when `MOCK_EXTERNAL_SERVICES === 'true'` (see services/stripe.ts).
 *
 * Methods mocked:
 *   - stripe.customers.create
 *   - stripe.checkout.sessions.create
 *   - stripe.billingPortal.sessions.create
 *   - stripe.webhooks.constructEvent
 *
 * Design notes:
 *   - We deliberately keep the real Stripe SDK as the carrier so the rest of
 *     the codebase keeps the `Stripe.Checkout.Session` / `Stripe.Event` types
 *     unchanged. Only the network-bound methods are swapped.
 *   - Mock IDs use Stripe's documented formats so log-grep / dashboard
 *     copy-paste in demo recordings looks authentic:
 *       cs_test_mock_<rand>   — checkout session
 *       cus_test_mock_<rand>  — customer
 *       sub_test_mock_<rand>  — subscription
 *       bps_test_mock_<rand>  — billing portal session
 *   - Webhook signature verification is bypassed (mocks trust the caller).
 *     E2E demos still exercise the real signing path against the real SDK
 *     via apps/web/e2e/demos/helpers/stripe.ts — that flow does NOT route
 *     through this mock (it POSTs raw bodies to /webhooks/stripe).
 */

import type Stripe from 'stripe';

function randSuffix(len = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * Install mock implementations on a Stripe SDK client instance.
 *
 * Mutates the client in-place. Returns the same client for chaining
 * convenience; caller can ignore the return value.
 */
export function installStripeMock(stripe: Stripe): Stripe {
  // ------------------------------------------------------------------
  // customers.create — return a synthetic customer record
  // ------------------------------------------------------------------
  const originalCustomersCreate = stripe.customers.create.bind(stripe.customers);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stripe.customers as any).create = async (
    params?: Stripe.CustomerCreateParams
  ): Promise<Stripe.Customer> => {
    const id = `cus_test_mock_${randSuffix(14)}`;
    const customer = {
      id,
      object: 'customer',
      email: params?.email ?? null,
      name: params?.name ?? null,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      metadata: params?.metadata ?? {},
      description: params?.description ?? null,
      // Cast through unknown so we don't have to enumerate every Stripe.Customer field
    } as unknown as Stripe.Customer;
    return customer;
  };
  // Keep a no-op reference so eslint doesn't flag the unused binding
  void originalCustomersCreate;

  // ------------------------------------------------------------------
  // checkout.sessions.create — return a synthetic session w/ checkout URL
  // ------------------------------------------------------------------
  const originalCheckoutCreate = stripe.checkout.sessions.create.bind(
    stripe.checkout.sessions
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stripe.checkout.sessions as any).create = async (
    params: Stripe.Checkout.SessionCreateParams
  ): Promise<Stripe.Checkout.Session> => {
    const id = `cs_test_mock_${randSuffix(20)}`;
    const url = `https://checkout.stripe.com/c/pay/${id}`;
    const customerId =
      typeof params.customer === 'string'
        ? params.customer
        : `cus_test_mock_${randSuffix(14)}`;

    const session = {
      id,
      object: 'checkout.session',
      url,
      mode: params.mode ?? 'subscription',
      status: 'open',
      payment_status: params.mode === 'payment' ? 'unpaid' : 'no_payment_required',
      customer: customerId,
      customer_email: params.customer_email ?? null,
      success_url: params.success_url ?? null,
      cancel_url: params.cancel_url ?? null,
      metadata: params.metadata ?? {},
      currency: 'nzd',
      // For mode='payment' (one-time invoice), echo a synthetic payment_intent
      payment_intent:
        params.mode === 'payment'
          ? `pi_test_mock_${randSuffix(20)}`
          : null,
      // Subscription mode echoes a subscription id
      subscription:
        params.mode === 'subscription' || params.mode === undefined
          ? `sub_test_mock_${randSuffix(20)}`
          : null,
      created: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      livemode: false,
    } as unknown as Stripe.Checkout.Session;
    return session;
  };
  void originalCheckoutCreate;

  // ------------------------------------------------------------------
  // billingPortal.sessions.create — return a portal URL
  // ------------------------------------------------------------------
  const originalPortalCreate = stripe.billingPortal.sessions.create.bind(
    stripe.billingPortal.sessions
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stripe.billingPortal.sessions as any).create = async (
    params: Stripe.BillingPortal.SessionCreateParams
  ): Promise<Stripe.BillingPortal.Session> => {
    const id = `bps_test_mock_${randSuffix(14)}`;
    return {
      id,
      object: 'billing_portal.session',
      url: `https://billing.stripe.com/p/session/test_mock_${randSuffix(20)}`,
      customer: params.customer,
      return_url: params.return_url ?? null,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
    } as unknown as Stripe.BillingPortal.Session;
  };
  void originalPortalCreate;

  // ------------------------------------------------------------------
  // webhooks.constructEvent — bypass signature verification, parse JSON
  // ------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stripe.webhooks as any).constructEvent = (
    payload: string | Buffer,
    _signature: string | string[],
    _secret: string,
    _tolerance?: number
  ): Stripe.Event => {
    const body = typeof payload === 'string' ? payload : payload.toString('utf-8');
    return JSON.parse(body) as Stripe.Event;
  };

  return stripe;
}

export default { installStripeMock };
