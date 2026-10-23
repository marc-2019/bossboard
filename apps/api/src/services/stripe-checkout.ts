/** Durable subscription checkout only; no client state or process-local locks.
 * Autocommit is intentional: persist request identity BEFORE calling Stripe so
 * a crash/timeout can only replay the same request. Never wrap provider calls
 * and reservation writes in a transaction that could roll the identity back.
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import type Stripe from 'stripe';
import db from './database.js';
import { createError } from '../middleware/error.js';
import type { CheckoutSessionInput, CheckoutSessionResult } from './stripe.js';

type Kind = 'customer' | 'checkout';
interface Reservation<T> {
  idempotency_key: string;
  params: T;
  created_at: Date;
  provider_id: string | null;
  expires_at: Date | null;
  state: 'pending' | 'open' | 'expired' | 'complete';
}
const unavailable = () => createError('Billing outcome needs verification. Please retry later.', 503, 'BILLING_UNAVAILABLE');
const existing = () => createError('Manage your existing subscription instead.', 409, 'EXISTING_SUBSCRIPTION');

async function locked<T>(userId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.getClient();
  // The session lock survives autocommit; connection death releases it. All
  // customer and checkout creation paths use this same per-user namespace.
  let acquired = false;
  let destroy = false;
  try {
    await client.query("SET lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_lock(hashtextextended('bb-billing:' || $1::text, 0))", [userId]);
    acquired = true;
    return await run(client);
  } finally {
    try {
      if (acquired) await client.query("SELECT pg_advisory_unlock(hashtextextended('bb-billing:' || $1::text, 0))", [userId]);
      await client.query('RESET lock_timeout');
    } catch { destroy = true; }
    client.release(destroy);
  }
}

async function read<T>(client: PoolClient, userId: string, kind: Kind): Promise<Reservation<T> | undefined> {
  return (await client.query<Reservation<T>>(
    'SELECT * FROM stripe_billing_requests WHERE user_id = $1 AND kind = $2', [userId, kind]
  )).rows[0];
}

async function reserve<T>(client: PoolClient, userId: string, kind: Kind, params: T): Promise<Reservation<T>> {
  return (await client.query<Reservation<T>>(
    `INSERT INTO stripe_billing_requests (user_id, kind, idempotency_key, params)
     VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, kind) DO UPDATE SET
       idempotency_key = EXCLUDED.idempotency_key, params = EXCLUDED.params,
       created_at = NOW(), provider_id = NULL, expires_at = NULL, state = 'pending'
     RETURNING *`, [userId, kind, randomUUID(), JSON.stringify(params)]
  )).rows[0];
}

function retryable(request: Reservation<unknown>): void {
  // Stripe may prune keys after 24h. Leave unknown outcomes blocked rather
  // than risk creating another customer/session after a key was pruned.
  if (Date.now() - request.created_at.getTime() >= 23 * 60 * 60 * 1000) throw unavailable();
}

async function customer(client: PoolClient, stripe: Stripe, userId: string, email: string, name: string | null): Promise<string> {
  const user = (await client.query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1', [userId]
  )).rows[0];
  if (!user) throw unavailable();
  if (user.stripe_customer_id) return user.stripe_customer_id;
  let request = await read<Stripe.CustomerCreateParams>(client, userId, 'customer');
  if (!request) request = await reserve(client, userId, 'customer', {
    email, ...(name === null ? {} : { name }), metadata: { bossboard_user_id: userId },
  });
  let id = request.provider_id;
  if (!id) {
    retryable(request);
    const result = await stripe.customers.create(request.params, { idempotencyKey: request.idempotency_key });
    if (!result.id) throw unavailable();
    id = result.id;
    await client.query("UPDATE stripe_billing_requests SET provider_id = $2 WHERE user_id = $1 AND kind = 'customer'", [userId, id]);
  }
  await client.query('UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1', [userId, id]);
  return id;
}

export function durableStripeCustomer(stripe: Stripe, userId: string, email: string, name: string | null): Promise<string> {
  return locked(userId, client => customer(client, stripe, userId, email, name));
}

async function assertFree(client: PoolClient, userId: string): Promise<void> {
  const user = (await client.query<{ subscription_tier: string; stripe_subscription_id: string | null }>(
    'SELECT subscription_tier, stripe_subscription_id FROM users WHERE id = $1', [userId]
  )).rows[0];
  if (!user) throw unavailable();
  if (user.subscription_tier !== 'free' || user.stripe_subscription_id) throw existing();
}

async function assertNoSubscription(stripe: Stripe, customerId: string): Promise<Stripe.Subscription[]> {
  const result = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  // Includes incomplete/past_due/paused and pending webhook activation. Unknown
  // or truncated responses cannot establish that another purchase is safe.
  if (!Array.isArray(result.data) || result.has_more !== false) throw unavailable();
  if (result.data.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) throw existing();
  return result.data;
}

async function sessionState(client: PoolClient, stripe: Stripe, userId: string, customerId: string,
  request: Reservation<Stripe.Checkout.SessionCreateParams>): Promise<Stripe.Checkout.Session> {
  let id = request.provider_id;
  if (!id) {
    retryable(request);
    const created = await stripe.checkout.sessions.create(request.params, { idempotencyKey: request.idempotency_key });
    if (!created.id) throw unavailable();
    id = created.id;
    // Persist even if Stripe returns an unusable URL/state. A cached create
    // response can be stale; retrieve current status before exposing any URL.
    await client.query("UPDATE stripe_billing_requests SET provider_id = $2 WHERE user_id = $1 AND kind = 'checkout'", [userId, id]);
  }
  const session = await stripe.checkout.sessions.retrieve(id);
  if (session.id !== id || session.mode !== 'subscription' || session.customer !== customerId ||
      session.metadata?.bossboard_user_id !== userId || session.metadata?.tier !== request.params.metadata?.tier ||
      !['open', 'expired', 'complete'].includes(session.status ?? '') || !session.expires_at) throw unavailable();
  await client.query(
    `UPDATE stripe_billing_requests SET state = $2, expires_at = to_timestamp($3)
     WHERE user_id = $1 AND kind = 'checkout'`, [userId, session.status, session.expires_at]);
  return session;
}

export function durableCheckout(stripe: Stripe, priceId: string, input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  return locked(input.userId, async client => {
    await assertFree(client, input.userId);
    const customerId = await customer(client, stripe, input.userId, input.userEmail, input.userName);
    const history = await assertNoSubscription(stripe, customerId);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription', customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: input.successUrl, cancel_url: input.cancelUrl,
      subscription_data: { metadata: { bossboard_user_id: input.userId, tier: input.tier } },
      allow_promotion_codes: true, billing_address_collection: 'auto',
      metadata: { bossboard_user_id: input.userId, tier: input.tier },
    };
    let request = await read<Stripe.Checkout.SessionCreateParams>(client, input.userId, 'checkout');
    if (request) {
      // Recover even a different-tier ambiguous create with its original key
      // and exact params. Never overwrite it based on client tier/return URLs.
      const old = await sessionState(client, stripe, input.userId, customerId, request);
      if (old.status === 'complete') {
        // A completed checkout can precede webhook activation OR belong to a
        // subscription canceled months ago. Require positive terminal evidence
        // for this exact subscription; an empty list is not cancellation proof.
        const subscriptionId = typeof old.subscription === 'string' ? old.subscription : old.subscription?.id;
        if (!subscriptionId || !history.some(sub => sub.id === subscriptionId && sub.customer === customerId &&
            ['canceled', 'incomplete_expired'].includes(sub.status))) throw existing();
      }
      if (old.status === 'open') {
        if (isDeepStrictEqual(request.params, params) && old.expires_at * 1000 > Date.now()) {
          await assertFree(client, input.userId);
          await assertNoSubscription(stripe, customerId);
          return checkoutResult(old);
        }
        // Invalidate old links before changing tier/price/return URLs. A race
        // with payment, timeout or any unknown result must not open a new one.
        const expired = await stripe.checkout.sessions.expire(old.id);
        if (expired.id !== old.id || expired.status !== 'expired') throw unavailable();
      }
      await assertFree(client, input.userId);
      await assertNoSubscription(stripe, customerId);
    }
    // Also block untracked links created before this migration or by another
    // integration. Never silently create beside an existing open checkout.
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 1 });
    if (!Array.isArray(open.data) || open.has_more !== false || open.data.length) throw unavailable();
    await assertFree(client, input.userId);
    request = await reserve(client, input.userId, 'checkout', params);
    const session = await sessionState(client, stripe, input.userId, customerId, request);
    if (session.status !== 'open' || session.expires_at * 1000 <= Date.now()) throw unavailable();
    await assertFree(client, input.userId);
    await assertNoSubscription(stripe, customerId);
    return checkoutResult(session);
  });
}

function checkoutResult(session: Stripe.Checkout.Session): CheckoutSessionResult {
  if (!session.url) throw unavailable();
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password) throw unavailable();
  return { sessionId: session.id, url: session.url };
}
