/**
 * Checkout → webhook → tier-upgrade E2E smoke test (RUNNABLE)
 *
 * This is the executable counterpart to the syntax-only
 * apps/web/e2e/demos/api/stripe.api.spec.ts. It exercises the real revenue
 * path end-to-end without any network or live Postgres:
 *
 *   1. Seed an ephemeral free-tier user into an in-memory DB fake.
 *   2. Build a checkout.session.completed event for that user and verify the
 *      signature via the SAME path the real route uses (constructWebhookEvent
 *      → stripe.webhooks.constructEvent, here mocked to return the event so no
 *      real STRIPE_WEBHOOK_SECRET / crypto is needed).
 *   3. Drive it through the real handleWebhookEvent handler.
 *   4. Assert the user's subscription_tier is upgraded in the (fake) DB —
 *      the assertion reads back the row that the real updateSubscriptionTier
 *      UPDATE mutated, so this proves the upgrade write actually ran.
 *   5. Assert the GA4 helper fired with event name 'checkout_completed' and
 *      the expected conversion params.
 *
 * What's mocked: Stripe SDK (no api.stripe.com), the DB driver (in-memory
 * user store), and the GA4 fetch (trackServerEvent is spied, no network).
 * What's REAL: constructWebhookEvent, handleWebhookEvent routing,
 * handleCheckoutCompleted, and updateSubscriptionTier's SQL→state mutation.
 */

// --- Stripe SDK mock: constructEvent returns whatever the test queues -------
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  const MockStripe = jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  }));
  return { __esModule: true, default: MockStripe };
});

// --- In-memory DB fake ------------------------------------------------------
// A tiny user store that understands the two queries this flow issues:
//   - INSERT stripe_webhook_events ... ON CONFLICT DO NOTHING  (idempotency)
//   - UPDATE users SET subscription_tier = $2, ... WHERE id = $1 ... RETURNING
// Anything else returns an empty result. This lets the REAL
// updateSubscriptionTier run and mutate seeded user state.

interface FakeUser {
  id: string;
  is_active: boolean;
  subscription_tier: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_started_at: Date | null;
  subscription_expires_at: Date | null;
}

const users = new Map<string, FakeUser>();
const processedEvents = new Set<string>();

function seedFreeUser(id: string): FakeUser {
  const user: FakeUser = {
    id,
    is_active: true,
    subscription_tier: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_started_at: null,
    subscription_expires_at: null,
  };
  users.set(id, user);
  return user;
}

const mockDbQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
  // Idempotency insert: first time for an event id → rowCount 1, else 0.
  if (sql.includes('INSERT INTO stripe_webhook_events')) {
    const eventId = params[0] as string;
    if (processedEvents.has(eventId)) return { rowCount: 0, rows: [] };
    processedEvents.add(eventId);
    return { rowCount: 1, rows: [] };
  }

  // Tier upgrade UPDATE issued by updateSubscriptionTier.
  if (sql.startsWith('UPDATE users SET') && sql.includes('subscription_tier = $2')) {
    const userId = params[0] as string;
    const tier = params[1] as string;
    const user = users.get(userId);
    if (!user || !user.is_active) return { rowCount: 0, rows: [] };

    user.subscription_tier = tier;
    // Apply the optional stripe fields in the same positional order the
    // service builds them (customer, subscription, startedAt, expiresAt).
    let i = 2;
    if (sql.includes('stripe_customer_id =')) user.stripe_customer_id = params[i++] as string;
    if (sql.includes('stripe_subscription_id =')) user.stripe_subscription_id = params[i++] as string;
    if (sql.includes('subscription_started_at =')) user.subscription_started_at = params[i++] as Date;
    if (sql.includes('subscription_expires_at =')) user.subscription_expires_at = params[i++] as Date;

    return {
      rowCount: 1,
      rows: [
        {
          subscription_tier: user.subscription_tier,
          stripe_customer_id: user.stripe_customer_id,
          stripe_subscription_id: user.stripe_subscription_id,
          subscription_started_at: user.subscription_started_at,
          subscription_expires_at: user.subscription_expires_at,
        },
      ],
    };
  }

  return { rowCount: 0, rows: [] };
});

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...(args as [string, unknown[]])) },
}));

// Config: provide stripe + ga4 so constructWebhookEvent and the GA4 value
// mapping resolve. ga4.mpApiSecret is non-empty so trackServerEvent would
// attempt a send — but we spy on it (below) so no real fetch occurs.
jest.mock('../../config/index.js', () => ({
  __esModule: true,
  config: {
    isDevelopment: false,
    stripe: {
      secretKey: 'sk_test_secret',
      webhookSecret: 'whsec_test',
      priceIdTradie: 'price_tradie_test',
      priceIdTeam: 'price_team_test',
    },
    ga4: {
      measurementId: 'G-83NPHN0QP5',
      mpApiSecret: 'test_mp_secret',
    },
  },
}));

// Spy on the GA4 helper so we assert invocation without hitting the network.
const mockTrackServerEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/ga4.js', () => ({
  __esModule: true,
  trackServerEvent: (...args: unknown[]) => mockTrackServerEvent(...args),
  default: { trackServerEvent: (...args: unknown[]) => mockTrackServerEvent(...args) },
}));

import { constructWebhookEvent, handleWebhookEvent } from '../../services/stripe.js';

// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  users.clear();
  processedEvents.clear();
});

describe('checkout → webhook → tier upgrade (E2E smoke)', () => {
  it('upgrades a free-tier user to tradie and fires the GA4 checkout_completed conversion', async () => {
    // 1. Seed ephemeral free-tier user.
    const userId = 'user-smoke-1';
    seedFreeUser(userId);
    expect(users.get(userId)?.subscription_tier).toBe('free');

    // 2. Build the checkout.session.completed event and run it through the
    //    real signature-verification entrypoint (constructEvent mocked).
    const rawBody = Buffer.from(
      JSON.stringify({ id: 'evt_smoke_1', type: 'checkout.session.completed' })
    );
    const signature = 't=1,v1=test';

    const event = {
      id: 'evt_smoke_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_smoke_1',
          mode: 'subscription',
          customer: 'cus_smoke_1',
          subscription: 'sub_smoke_1',
          metadata: { bossboard_user_id: userId, tier: 'tradie' },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);

    const verified = constructWebhookEvent(rawBody, signature);
    expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, signature, 'whsec_test');

    // 3. Drive the verified event through the real handler.
    await handleWebhookEvent(verified as never);

    // 4. Assert the tier is upgraded in the (fake) DB.
    const upgraded = users.get(userId);
    expect(upgraded?.subscription_tier).toBe('tradie');
    expect(upgraded?.stripe_customer_id).toBe('cus_smoke_1');
    expect(upgraded?.stripe_subscription_id).toBe('sub_smoke_1');

    // 5. Assert the GA4 conversion event fired with the right name + params.
    expect(mockTrackServerEvent).toHaveBeenCalledTimes(1);
    const [eventName, params, clientId] = mockTrackServerEvent.mock.calls[0];
    expect(eventName).toBe('checkout_completed');
    expect(params).toEqual(
      expect.objectContaining({
        tier: 'tradie',
        value: 19.99,
        currency: 'nzd',
        transaction_id: 'cs_test_smoke_1',
        user_id: userId,
      })
    );
    // Stable client_id falls back to the Stripe customer id.
    expect(clientId).toBe('cus_smoke_1');
  });

  it('is idempotent: a duplicate event neither re-upgrades nor double-fires GA4', async () => {
    const userId = 'user-smoke-2';
    seedFreeUser(userId);

    const event = {
      id: 'evt_smoke_dup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_smoke_2',
          mode: 'subscription',
          customer: 'cus_smoke_2',
          subscription: 'sub_smoke_2',
          metadata: { bossboard_user_id: userId, tier: 'team' },
        },
      },
    };

    await handleWebhookEvent(event as never);
    expect(users.get(userId)?.subscription_tier).toBe('team');
    expect(mockTrackServerEvent).toHaveBeenCalledTimes(1);

    // Same event id again → dedup guard short-circuits before any work.
    await handleWebhookEvent(event as never);
    expect(mockTrackServerEvent).toHaveBeenCalledTimes(1);
  });

  it('does not upgrade or fire GA4 when session metadata is missing the tier', async () => {
    const userId = 'user-smoke-3';
    seedFreeUser(userId);

    const event = {
      id: 'evt_smoke_no_tier',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_smoke_3',
          mode: 'subscription',
          customer: 'cus_smoke_3',
          metadata: { bossboard_user_id: userId },
        },
      },
    };

    await handleWebhookEvent(event as never);

    expect(users.get(userId)?.subscription_tier).toBe('free');
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });
});
