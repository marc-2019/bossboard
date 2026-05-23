/**
 * Stripe demo helpers — F-STRIPE-01..04 (Phase 3 Agent 13)
 *
 * Provides:
 *   - signWebhookEvent()         — Compute a valid Stripe-Signature header for
 *                                  fixture event payloads (HMAC-SHA256 over
 *                                  `<timestamp>.<payload>` using the test
 *                                  webhook secret). Matches Stripe's algorithm
 *                                  documented at https://stripe.com/docs/webhooks/signatures
 *
 *   - fixture builders for the four event types we handle:
 *       checkoutSessionCompletedTradie / checkoutSessionCompletedTeam
 *       customerSubscriptionUpdated   / customerSubscriptionDeleted
 *
 *   - Stripe checkout-session mock route stub (TODO(phase5): integrate with
 *     a real intercept layer once mocking infra lands).
 *
 *   - NZ-realistic pricing constants ($4.99/wk tradie, $9.99/wk team).
 *
 * CONTRACT NOTE: All fixtures use `trademate_user_id` as the Stripe metadata
 * key (NOT `bossboard_user_id`). CLAUDE.md flags this as a contract surface
 * shared with the production Stripe customer schema and the renaming would
 * require a coordinated Stripe-metadata migration. Tests preserve it verbatim.
 *
 * MOCKING: This module deliberately does NOT call api.stripe.com. The webhook
 * tests POST locally constructed payloads at /webhooks/stripe; the checkout
 * tests mock POST /v1/checkout/sessions via Playwright's request route
 * interception (see stripe.api.spec.ts). No real Stripe charges occur in any
 * demo run.
 */
import crypto from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const API_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:29000';

/**
 * Test webhook secret — the API server must be running with this exact
 * value in STRIPE_WEBHOOK_SECRET for signature verification to succeed
 * against fixtures built here. Pick a sentinel string so collisions with
 * a real secret are impossible.
 *
 * TODO(phase5): inject via env var so CI can rotate.
 */
export const STRIPE_TEST_WEBHOOK_SECRET =
  process.env.STRIPE_TEST_WEBHOOK_SECRET ||
  'whsec_test_e2e_demo_stripe_module_2026_05_23_do_not_use_in_prod';

/**
 * NZ pricing constants — preserve realism in headed demos.
 * Source: CLAUDE.md "Business Model" section.
 */
export const NZ_PRICING = {
  tradie: { weekly: 4.99, monthly: 19.99, currency: 'NZD' as const },
  team: { weekly: 9.99, monthly: 39.99, currency: 'NZD' as const },
} as const;

// ---------------------------------------------------------------------------
// Webhook signature helper
// ---------------------------------------------------------------------------

/**
 * Compute a Stripe-Signature header value for a given payload + timestamp.
 *
 * Stripe's verification algorithm (from their docs):
 *   1. signed_payload = `${timestamp}.${rawBody}`
 *   2. expected_sig   = HMAC-SHA256(secret, signed_payload).toString('hex')
 *   3. header format  = `t=${timestamp},v1=${expected_sig}`
 *
 * Returns the header value as a string suitable for the `stripe-signature`
 * HTTP header.
 */
export function signWebhookPayload(
  rawBody: string,
  options?: { timestampSeconds?: number; secret?: string },
): string {
  const ts = options?.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const secret = options?.secret ?? STRIPE_TEST_WEBHOOK_SECRET;
  const signedPayload = `${ts}.${rawBody}`;
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${ts},v1=${sig}`;
}

/**
 * Convenience: sign an event object (JSON.stringify it once for the
 * signature AND for the body so the bytes match exactly — Stripe's verifier
 * is byte-exact).
 *
 * Returns { rawBody, signature } so the caller can POST both together.
 */
export function signWebhookEvent(
  event: Record<string, unknown>,
  options?: { timestampSeconds?: number; secret?: string },
): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(event);
  const signature = signWebhookPayload(rawBody, options);
  return { rawBody, signature };
}

// ---------------------------------------------------------------------------
// Event fixture builders
// ---------------------------------------------------------------------------

export interface CheckoutCompletedFixtureOptions {
  /** Bossboard user UUID — flows back as session.metadata.trademate_user_id. */
  userId: string;
  /** 'tradie' or 'team' — flows back as session.metadata.tier. */
  tier: 'tradie' | 'team';
  /** Optional override IDs (default: deterministic per-tier). */
  eventId?: string;
  sessionId?: string;
  customerId?: string;
  subscriptionId?: string;
  createdSeconds?: number;
}

/**
 * Build a `checkout.session.completed` event fixture for a subscription
 * flow (mode=subscription). Mirrors the production shape that Stripe sends.
 */
export function checkoutSessionCompleted(
  options: CheckoutCompletedFixtureOptions,
): Record<string, unknown> {
  const {
    userId,
    tier,
    eventId = `evt_test_checkout_${tier}_${Date.now()}`,
    sessionId = `cs_test_${tier}_${Date.now()}`,
    customerId = `cus_test_${tier}_${Date.now()}`,
    subscriptionId = `sub_test_${tier}_${Date.now()}`,
    createdSeconds = Math.floor(Date.now() / 1000),
  } = options;

  return {
    id: eventId,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: createdSeconds,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        customer: customerId,
        subscription: subscriptionId,
        amount_total: tier === 'tradie' ? 1999 : 3999, // monthly equivalent in cents
        currency: 'nzd',
        metadata: {
          // CONTRACT SURFACE — see header note.
          trademate_user_id: userId,
          tier,
        },
      },
    },
  };
}

export interface SubscriptionUpdatedFixtureOptions {
  userId: string;
  /** New tier the subscription should reflect. */
  tier: 'tradie' | 'team';
  /** Stripe price ID matching the tier — server uses this to recompute tier. */
  priceId: string;
  customerId?: string;
  subscriptionId?: string;
  eventId?: string;
  status?: 'active' | 'trialing' | 'past_due' | 'unpaid';
  currentPeriodEndSeconds?: number;
}

/**
 * Build a `customer.subscription.updated` event fixture.
 */
export function customerSubscriptionUpdated(
  options: SubscriptionUpdatedFixtureOptions,
): Record<string, unknown> {
  const {
    userId,
    tier,
    priceId,
    customerId = `cus_test_${tier}_${Date.now()}`,
    subscriptionId = `sub_test_${tier}_${Date.now()}`,
    eventId = `evt_test_sub_updated_${tier}_${Date.now()}`,
    status = 'active',
    currentPeriodEndSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  } = options;

  return {
    id: eventId,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        status,
        current_period_end: currentPeriodEndSeconds,
        items: {
          object: 'list',
          data: [
            {
              id: `si_test_${tier}`,
              object: 'subscription_item',
              price: {
                id: priceId,
                object: 'price',
                currency: 'nzd',
                product: `prod_test_${tier}`,
              },
              quantity: 1,
            },
          ],
        },
        metadata: {
          trademate_user_id: userId,
          tier,
        },
      },
    },
  };
}

export interface SubscriptionDeletedFixtureOptions {
  customerId: string;
  subscriptionId?: string;
  eventId?: string;
  userId?: string;
}

/**
 * Build a `customer.subscription.deleted` event fixture.
 *
 * Note: the server-side handler resolves the user via stripe_customer_id
 * (not metadata) for the delete path, so customerId is the primary key.
 */
export function customerSubscriptionDeleted(
  options: SubscriptionDeletedFixtureOptions,
): Record<string, unknown> {
  const {
    customerId,
    subscriptionId = `sub_test_deleted_${Date.now()}`,
    eventId = `evt_test_sub_deleted_${Date.now()}`,
    userId,
  } = options;

  return {
    id: eventId,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        status: 'canceled',
        metadata: userId ? { trademate_user_id: userId } : {},
      },
    },
  };
}

export interface InvoicePaymentFailedFixtureOptions {
  customerId: string;
  eventId?: string;
  invoiceId?: string;
  amountDueCents?: number;
}

/**
 * Build an `invoice.payment_failed` event fixture.
 */
export function invoicePaymentFailed(
  options: InvoicePaymentFailedFixtureOptions,
): Record<string, unknown> {
  const {
    customerId,
    eventId = `evt_test_inv_failed_${Date.now()}`,
    invoiceId = `in_test_failed_${Date.now()}`,
    amountDueCents = 1999,
  } = options;

  return {
    id: eventId,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        customer: customerId,
        amount_due: amountDueCents,
        currency: 'nzd',
        status: 'open',
        attempt_count: 1,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Stripe checkout-session response (for createCheckoutSession unit-level
// mocking via Playwright's request route fulfilment).
// ---------------------------------------------------------------------------

export interface MockCheckoutSessionResponse {
  id: string;
  url: string;
  customer: string;
  mode: 'subscription' | 'payment';
}

export function mockCheckoutSessionResponse(
  tier: 'tradie' | 'team',
  userId: string,
): MockCheckoutSessionResponse {
  const id = `cs_test_mock_${tier}_${userId.slice(0, 8)}_${Date.now()}`;
  return {
    id,
    // checkout.stripe.com matches the live URL shape — used by the demo
    // assertion `url matches checkout.stripe.com/c/pay/...`.
    url: `https://checkout.stripe.com/c/pay/${id}`,
    customer: `cus_test_mock_${userId.slice(0, 8)}`,
    mode: 'subscription',
  };
}

// ---------------------------------------------------------------------------
// POST helper — sign + send a webhook event in one call
// ---------------------------------------------------------------------------

export interface PostWebhookOptions {
  request: APIRequestContext;
  /** Override API base URL (default: API_BASE_URL). */
  apiUrl?: string;
  /** Override the webhook secret used to sign — useful for negative tests. */
  secret?: string;
  /** Override timestamp — useful for tolerance/skew tests. */
  timestampSeconds?: number;
  /** Skip signing entirely — used to test the missing-header 400 path. */
  skipSignature?: boolean;
  /** Send a deliberately bad signature — used for bad-sig 400 path. */
  badSignature?: string;
}

/**
 * POST a signed webhook event to /webhooks/stripe and return the response.
 * Handles the raw-body-vs-signature byte-match contract Stripe requires.
 */
export async function postSignedWebhook(
  event: Record<string, unknown>,
  options: PostWebhookOptions,
) {
  const {
    request,
    apiUrl = API_BASE_URL,
    secret,
    timestampSeconds,
    skipSignature = false,
    badSignature,
  } = options;

  const rawBody = JSON.stringify(event);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!skipSignature) {
    headers['stripe-signature'] =
      badSignature ?? signWebhookPayload(rawBody, { timestampSeconds, secret });
  }

  // Playwright's request.post serialises `data` to JSON internally — but the
  // webhook route uses express.raw(), so we MUST send the exact bytes we
  // signed. Use `data` as a string (Playwright keeps strings verbatim).
  return request.post(`${apiUrl}/webhooks/stripe`, {
    headers,
    data: rawBody,
    failOnStatusCode: false,
  });
}
