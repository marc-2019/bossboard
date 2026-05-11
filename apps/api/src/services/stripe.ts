/**
 * Stripe Service
 * Handles Stripe Checkout sessions, Billing Portal sessions, and webhook processing.
 *
 * Pricing (NZD, billed monthly):
 *   Tradie: $4.99/wk → $19.99/mo (STRIPE_PRICE_ID_TRADIE)
 *   Team:   $9.99/wk → $39.99/mo (STRIPE_PRICE_ID_TEAM)
 *
 * Flow:
 *   1. POST /api/v1/subscriptions/checkout → createCheckoutSession → Stripe-hosted page
 *   2. User pays → Stripe fires checkout.session.completed webhook
 *   3. Webhook handler updates user's subscription_tier + stripe fields
 *   4. POST /api/v1/subscriptions/portal → createPortalSession → Stripe-hosted management
 */

import Stripe from 'stripe';
import { config } from '../config/index.js';
import { SubscriptionTier } from '../types/index.js';
import { updateSubscriptionTier } from './subscriptions.js';
import db from './database.js';
import { sendPaymentFailedEmail, isEmailConfigured } from './email.js';
import notifications from './notifications.js';
import {
  markAsPaidFromWebhookBySession,
  attachStripePaymentLink,
  getInvoiceByIdRaw,
} from './invoices.js';

// ---------------------------------------------------------------------------
// Stripe client
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.stripe.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Price ID → tier mapping
// ---------------------------------------------------------------------------

function tierForPriceId(priceId: string): SubscriptionTier | null {
  if (priceId === config.stripe.priceIdTradie) return 'tradie';
  if (priceId === config.stripe.priceIdTeam) return 'team';
  return null;
}

// ---------------------------------------------------------------------------
// Customer helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a Stripe customer for a user.
 * Stores stripe_customer_id on the users row.
 */
export async function ensureStripeCustomer(
  userId: string,
  email: string,
  name: string | null
): Promise<string> {
  const stripe = getStripe();

  // Check if already has a customer ID
  const result = await db.query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows[0]?.stripe_customer_id) {
    return result.rows[0].stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { trademate_user_id: userId },
  });

  // Persist the customer ID
  await db.query(
    'UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
    [customer.id, userId]
  );

  return customer.id;
}

// ---------------------------------------------------------------------------
// Checkout session
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  userId: string;
  userEmail: string;
  userName: string | null;
  tier: 'tradie' | 'team';
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Create a Stripe Checkout session for subscribing to a paid tier.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput
): Promise<CheckoutSessionResult> {
  const stripe = getStripe();

  const priceId =
    input.tier === 'tradie'
      ? config.stripe.priceIdTradie
      : config.stripe.priceIdTeam;

  if (!priceId) {
    throw new Error(`STRIPE_PRICE_ID_${input.tier.toUpperCase()} is not configured`);
  }

  const customerId = await ensureStripeCustomer(
    input.userId,
    input.userEmail,
    input.userName
  );

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    subscription_data: {
      metadata: {
        trademate_user_id: input.userId,
        tier: input.tier,
      },
    },
    // Allow promo codes
    allow_promotion_codes: true,
    metadata: {
      trademate_user_id: input.userId,
      tier: input.tier,
    },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { sessionId: session.id, url: session.url };
}

// ---------------------------------------------------------------------------
// Billing portal session
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Billing Portal session so users can manage their subscription.
 */
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

// ---------------------------------------------------------------------------
// Invoice payment links (Phase 1 — public invoice "Pay Now" button)
// ---------------------------------------------------------------------------

export interface InvoicePaymentLinkInput {
  invoiceId: string;
  userId: string;
  /** Customer-facing description shown on the Stripe payment page. */
  description: string;
  /** Total amount in NZD cents (integer). */
  amountCents: number;
  /** URL Stripe redirects to after a successful payment. */
  successUrl: string;
  /** URL Stripe redirects to if the customer cancels. */
  cancelUrl: string;
  /** Optional client email — pre-fills the Stripe form. */
  customerEmail?: string;
}

export interface InvoicePaymentLinkResult {
  sessionId: string;
  url: string;
}

/**
 * Create a one-time Stripe Checkout Session to collect payment for a single
 * invoice. Unlike the subscription flow above (mode='subscription'), this
 * uses mode='payment' and constructs an inline price_data item — no
 * pre-configured Price object required. The resulting session URL is the
 * Payment Link we hand the client via the public invoice page.
 *
 * Phase 1 keeps it simple: full-amount NZD only, no surcharge, no partial
 * payments. The discovery doc (PAYMENT_GATEWAY_PARTNERS.md §Phased Rollout)
 * defers those concerns to Phase 2.
 */
export async function createInvoicePaymentLink(
  input: InvoicePaymentLinkInput
): Promise<InvoicePaymentLinkResult> {
  if (input.amountCents <= 0) {
    throw new Error('Invoice payment link requires a positive amount');
  }

  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'nzd',
          product_data: {
            name: input.description,
          },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    // Metadata is the bridge between Stripe-land and our DB. The webhook
    // handler reads invoice_id back off session.metadata to find the row to
    // flip to 'paid'. trademate_user_id is captured for audit context.
    metadata: {
      bossboard_invoice_id: input.invoiceId,
      trademate_user_id: input.userId,
      kind: 'invoice_payment',
    },
    payment_intent_data: {
      metadata: {
        bossboard_invoice_id: input.invoiceId,
        trademate_user_id: input.userId,
        kind: 'invoice_payment',
      },
    },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a payment link URL');
  }

  // Persist the session ID + URL on the invoice so subsequent renders of
  // the public invoice page reuse the same link.
  await attachStripePaymentLink({
    invoiceId: input.invoiceId,
    userId: input.userId,
    stripeCheckoutSessionId: session.id,
    paymentLinkUrl: session.url,
  });

  return { sessionId: session.id, url: session.url };
}

/**
 * Get-or-create: returns an existing reusable Payment Link if one is already
 * attached to the invoice (Stripe Checkout Sessions remain valid for ~24h),
 * otherwise creates a fresh one.
 *
 * Returns null when Stripe is not configured (STRIPE_SECRET_KEY unset) — the
 * public invoice page renders the bank-transfer-only fallback in that case.
 */
export async function getOrCreateInvoicePaymentLink(
  invoiceId: string,
  userId: string,
  options: { successUrl: string; cancelUrl: string }
): Promise<InvoicePaymentLinkResult | null> {
  if (!config.stripe.secretKey) {
    return null;
  }

  const invoice = await getInvoiceByIdRaw(invoiceId, userId);
  if (!invoice) return null;

  // Already paid → don't generate a link (would just confuse the client).
  if (invoice.status === 'paid') return null;

  // Reuse an existing link if we've attached one previously.
  if (invoice.stripeCheckoutSessionId && invoice.paymentLinkUrl) {
    return {
      sessionId: invoice.stripeCheckoutSessionId,
      url: invoice.paymentLinkUrl,
    };
  }

  const description = `Invoice ${invoice.invoiceNumber} — ${invoice.clientName}`;

  return createInvoicePaymentLink({
    invoiceId: invoice.id,
    userId,
    description,
    amountCents: invoice.total,
    successUrl: options.successUrl,
    cancelUrl: options.cancelUrl,
    customerEmail: invoice.clientEmail ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

/**
 * Verify and parse a Stripe webhook payload.
 * Stripe requires the raw body (Buffer) to validate the signature.
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  if (!config.stripe.webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

/**
 * Check if a Stripe event has already been processed (idempotency guard).
 * Returns true if the event was newly inserted (i.e. should be processed).
 */
async function markEventProcessed(eventId: string): Promise<boolean> {
  try {
    const result = await db.query(
      `INSERT INTO stripe_webhook_events (event_id, processed_at)
       VALUES ($1, NOW())
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId]
    );
    // rowCount = 1 means we inserted (new event), 0 means already existed (duplicate)
    return (result.rowCount ?? 0) > 0;
  } catch {
    // Table might not exist yet in dev — allow processing but log warning
    console.warn('[Stripe] stripe_webhook_events table not found, skipping dedup check');
    return true;
  }
}

/**
 * Handle a verified Stripe webhook event.
 * Updates the user's subscription tier based on payment lifecycle events.
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  const isNew = await markEventProcessed(event.id);
  if (!isNew) {
    console.log(`[Stripe] Skipping duplicate webhook event: ${event.id}`);
    return;
  }

  console.log(`[Stripe] Processing webhook event: ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Two flavours hit this event type: subscription checkouts (existing
      // billing flow) and one-time invoice payments (Phase 1). Disambiguate
      // via session.mode + metadata.kind so each routes to the right handler.
      if (session.mode === 'payment' || session.metadata?.kind === 'invoice_payment') {
        await handleInvoicePaymentCompleted(session);
      } else {
        await handleCheckoutCompleted(session);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      // Belt-and-braces for one-time invoice payments. checkout.session.completed
      // is the primary signal; payment_intent.succeeded covers the rare case
      // where the session event is delayed/lost but the intent still completed.
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    }

    case 'customer.subscription.updated': {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    }

    case 'invoice.payment_failed': {
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    }

    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.trademate_user_id;
  const tier = session.metadata?.tier as SubscriptionTier | undefined;

  if (!userId || !tier) {
    console.error('[Stripe] checkout.session.completed missing metadata', session.metadata);
    return;
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  await updateSubscriptionTier(userId, tier, {
    stripeCustomerId: customerId ?? undefined,
    stripeSubscriptionId: subscriptionId ?? undefined,
    startedAt: new Date(),
  });

  console.log(`[Stripe] User ${userId} upgraded to ${tier} tier`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.trademate_user_id;
  if (!userId) {
    // Look up via stripe_customer_id
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;
    if (!customerId) return;

    const result = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );
    if (result.rows.length === 0) return;

    await handleSubscriptionUpdatedForUser(result.rows[0].id, subscription);
    return;
  }

  await handleSubscriptionUpdatedForUser(userId, subscription);
}

async function handleSubscriptionUpdatedForUser(
  userId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    // Determine tier from the price ID on the subscription
    const priceId = subscription.items.data[0]?.price?.id;
    const tier = priceId ? tierForPriceId(priceId) : null;

    if (tier) {
      const periodEnd = subscription.current_period_end;
      await updateSubscriptionTier(userId, tier, {
        stripeSubscriptionId: subscription.id,
        expiresAt: periodEnd ? new Date(periodEnd * 1000) : undefined,
      });
      console.log(`[Stripe] User ${userId} subscription updated to ${tier}`);
    }
  } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    console.warn(`[Stripe] User ${userId} subscription is ${subscription.status}`);
    // Don't downgrade immediately — give user time to update payment method via portal
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  const result = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (result.rows.length === 0) return;

  const userId = result.rows[0].id;

  // Downgrade to free tier
  await updateSubscriptionTier(userId, 'free', {
    stripeSubscriptionId: undefined,
    expiresAt: new Date(),
  });

  console.log(`[Stripe] User ${userId} downgraded to free (subscription deleted)`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!customerId) return;

  const result = await db.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (result.rows.length === 0) return;

  const { id: userId, email } = result.rows[0];
  console.warn(`[Stripe] Payment failed for user ${userId} (${email})`);

  // Notify the user via push notification (if they have a token) and email.
  // Both channels are attempted independently so one failure doesn't silence the other.

  // Push notification
  try {
    const pushToken = await notifications.getPushToken(userId);
    if (pushToken) {
      await notifications.sendPushNotifications([{
        to: pushToken,
        title: '⚠️ Payment failed',
        body: 'We couldn\'t process your subscription payment. Tap to update your payment method.',
        data: { type: 'payment_failed' },
        sound: 'default',
      }]);
      console.log(`[Stripe] Push notification sent to user ${userId}`);
    }
  } catch (err) {
    console.error(`[Stripe] Failed to send push notification to user ${userId}:`, err);
  }

  // Email
  try {
    if (isEmailConfigured()) {
      await sendPaymentFailedEmail(email);
      console.log(`[Stripe] Payment-failed email sent to ${email}`);
    } else {
      console.warn('[Stripe] Email not configured — skipping payment-failed email');
    }
  } catch (err) {
    console.error(`[Stripe] Failed to send payment-failed email to ${email}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Invoice payment webhook handlers (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Handle a completed Checkout Session for a one-time invoice payment.
 *
 * The session metadata carries bossboard_invoice_id (set by
 * createInvoicePaymentLink). We look up the invoice by stripe_checkout_session_id
 * — that's the column the get-or-create path persisted when handing the link
 * to the client — and flip it to paid via the idempotent service helper.
 *
 * A missing match is logged but not treated as an error: Stripe also fires
 * checkout.session.completed for subscription checkouts, which this branch
 * shouldn't be touching (the switch above already routed those elsewhere),
 * AND legacy/foreign sessions could plausibly fire too.
 */
async function handleInvoicePaymentCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const invoiceId = session.metadata?.bossboard_invoice_id;
  if (!invoiceId) {
    console.warn(
      `[Stripe] Invoice payment webhook missing bossboard_invoice_id metadata (session ${session.id}) — skipping`
    );
    return;
  }

  // Resolve the payment_intent ID. Stripe returns it as string when not
  // expanded, or as an expanded PaymentIntent object when expansion is on.
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const reference = paymentIntentId ?? session.id;

  const invoice = await markAsPaidFromWebhookBySession({
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId,
    paymentReference: reference,
  });

  if (!invoice) {
    console.warn(
      `[Stripe] Invoice payment webhook fired for session ${session.id} (invoice metadata ${invoiceId}) but no matching invoice row — skipping`
    );
    return;
  }

  console.log(
    `[Stripe] Invoice ${invoice.invoiceNumber} (${invoice.id}) marked paid via session ${session.id} (intent ${paymentIntentId ?? 'n/a'})`
  );
}

/**
 * Backstop handler for payment_intent.succeeded on one-time invoice payments.
 * Only acts when the payment_intent metadata carries our kind/invoice_id —
 * otherwise this is a subscription invoice payment and the subscription
 * handlers above cover it.
 */
async function handlePaymentIntentSucceeded(
  intent: Stripe.PaymentIntent
): Promise<void> {
  const kind = intent.metadata?.kind;
  const invoiceId = intent.metadata?.bossboard_invoice_id;
  if (kind !== 'invoice_payment' || !invoiceId) {
    // Not one of our invoice payments — let the subscription handlers handle
    // their own lifecycle events.
    return;
  }

  const result = await db.query<Record<string, unknown>>(
    `UPDATE invoices
        SET status = 'paid',
            paid_at = COALESCE(paid_at, NOW()),
            payment_provider = COALESCE(payment_provider, 'stripe'),
            payment_reference = COALESCE(payment_reference, $1),
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $1),
            updated_at = NOW()
      WHERE id = $2
        AND status IN ('draft', 'sent', 'overdue')
      RETURNING id, invoice_number`,
    [intent.id, invoiceId]
  );

  if ((result.rowCount ?? 0) === 0) {
    console.log(
      `[Stripe] payment_intent.succeeded backstop: invoice ${invoiceId} already paid or not found — no-op`
    );
    return;
  }

  console.log(
    `[Stripe] Invoice ${invoiceId} marked paid via payment_intent.succeeded backstop (intent ${intent.id})`
  );
}

export default {
  ensureStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  createInvoicePaymentLink,
  getOrCreateInvoicePaymentLink,
  constructWebhookEvent,
  handleWebhookEvent,
};
