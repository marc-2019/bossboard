/**
 * Stripe Service — Unit Tests
 *
 * Full coverage of the Stripe integration layer, including:
 *  - ensureStripeCustomer  — create or retrieve a Stripe customer
 *  - createCheckoutSession — build a hosted checkout URL
 *  - createPortalSession   — build a billing-portal URL
 *  - constructWebhookEvent — signature verification
 *  - handleWebhookEvent    — event dispatch, idempotency, all four lifecycle events
 *
 * All I/O (Stripe SDK, database, email, push notifications) is mocked.
 * The Stripe client singleton is frozen after first construction, so the
 * same mock object is reused for every test — individual method mocks are
 * reset in beforeEach.
 */

// ---------------------------------------------------------------------------
// Mock: Stripe SDK
// ---------------------------------------------------------------------------
const mockCustomersCreate = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockBillingPortalSessionsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    billingPortal: { sessions: { create: mockBillingPortalSessionsCreate } },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

// ---------------------------------------------------------------------------
// Mock: config
// ---------------------------------------------------------------------------
jest.mock('../../src/config/index.js', () => ({
  __esModule: true,
  config: {
    stripe: {
      secretKey: 'sk_test_mock_key',
      webhookSecret: 'whsec_test_mock_secret',
      priceIdTradie: 'price_tradie_test',
      priceIdTeam: 'price_team_test',
      returnUrl: 'https://app.bossboard.test',
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock: database
// ---------------------------------------------------------------------------
const mockDbQuery = jest.fn();
jest.mock('../../src/services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

// ---------------------------------------------------------------------------
// Mock: subscriptions service (updateSubscriptionTier)
// ---------------------------------------------------------------------------
const mockUpdateSubscriptionTier = jest.fn();
jest.mock('../../src/services/subscriptions.js', () => ({
  updateSubscriptionTier: mockUpdateSubscriptionTier,
  getUserSubscription: jest.fn(),
  getTierUsage: jest.fn(),
  getTierLimits: jest.fn(),
  getAllTiers: jest.fn(),
  isBetaMode: jest.fn(),
  canCreateInvoice: jest.fn(),
  canCreateSwms: jest.fn(),
  canAddTeamMember: jest.fn(),
  isFeatureAvailable: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: email service
// ---------------------------------------------------------------------------
const mockIsEmailConfigured = jest.fn();
const mockSendPaymentFailedEmail = jest.fn();
jest.mock('../../src/services/email.js', () => ({
  __esModule: true,
  isEmailConfigured: mockIsEmailConfigured,
  sendPaymentFailedEmail: mockSendPaymentFailedEmail,
  default: {
    isEmailConfigured: mockIsEmailConfigured,
    sendPaymentFailedEmail: mockSendPaymentFailedEmail,
  },
}));

// ---------------------------------------------------------------------------
// Mock: notifications service
// ---------------------------------------------------------------------------
const mockGetPushToken = jest.fn();
const mockSendPushNotifications = jest.fn();
jest.mock('../../src/services/notifications.js', () => ({
  __esModule: true,
  default: {
    getPushToken: mockGetPushToken,
    sendPushNotifications: mockSendPushNotifications,
  },
}));

// ---------------------------------------------------------------------------
// Import service under test (after all mocks are in place)
// ---------------------------------------------------------------------------
import {
  ensureStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  handleWebhookEvent,
} from '../../src/services/stripe.js';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: string,
  data: object,
  id = 'evt_test_001'
): Stripe.Event {
  return {
    id,
    type,
    data: { object: data },
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

function makeSubscription(
  overrides: Partial<Record<string, unknown>> = {}
): Stripe.Subscription {
  return {
    id: 'sub_test_001',
    customer: 'cus_test_001',
    status: 'active',
    items: {
      data: [{ price: { id: 'price_tradie_test' } }],
    },
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // +30 days
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Subscription;
}

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  // Default: email not configured, no push token
  mockIsEmailConfigured.mockReturnValue(false);
  mockGetPushToken.mockResolvedValue(null);
  // Default: push send succeeds
  mockSendPushNotifications.mockResolvedValue(undefined);
  // Default: webhook events table insert succeeds (new event)
  mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

// ===========================================================================
// 1. ensureStripeCustomer
// ===========================================================================
describe('ensureStripeCustomer', () => {
  it('returns existing customer ID without calling Stripe', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ stripe_customer_id: 'cus_existing_001' }],
    });

    const result = await ensureStripeCustomer('user-001', 'tradie@example.com', 'Bob Smith');

    expect(result).toBe('cus_existing_001');
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it('creates a new Stripe customer when DB has null customer ID', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] })  // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                 // UPDATE
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new_001' });

    const result = await ensureStripeCustomer('user-001', 'tradie@example.com', 'Bob Smith');

    expect(result).toBe('cus_new_001');
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: 'tradie@example.com',
      name: 'Bob Smith',
      metadata: { bossboard_user_id: 'user-001' },
    });
  });

  it('creates a new Stripe customer when user has no row in DB', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })               // SELECT returns empty
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new_002' });

    const result = await ensureStripeCustomer('user-002', 'new@example.com', null);

    expect(result).toBe('cus_new_002');
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: undefined,  // null → undefined per stripe.ts
      metadata: { bossboard_user_id: 'user-002' },
    });
  });

  it('persists new customer ID to the users table', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_persisted_001' });

    await ensureStripeCustomer('user-001', 'tradie@example.com', 'Bob');

    const updateCall = mockDbQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users SET stripe_customer_id/);
    expect(updateCall[1]).toEqual(['cus_persisted_001', 'user-001']);
  });

  it('passes name as undefined (not null) to Stripe when name is null', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_no_name' });

    await ensureStripeCustomer('user-003', 'noname@example.com', null);

    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: undefined })
    );
  });
});

// ===========================================================================
// 2. createCheckoutSession
// ===========================================================================
describe('createCheckoutSession', () => {
  const baseInput = {
    userId: 'user-001',
    userEmail: 'tradie@example.com',
    userName: 'Bob Smith',
    tier: 'tradie' as const,
    successUrl: 'https://app.bossboard.test/success',
    cancelUrl: 'https://app.bossboard.test/cancel',
  };

  beforeEach(() => {
    // ensureStripeCustomer: user already has a customer ID
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ stripe_customer_id: 'cus_test_001' }],
    });
  });

  it('creates a checkout session for the tradie tier and returns sessionId + url', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_tradie_001',
      url: 'https://checkout.stripe.com/pay/cs_test_tradie_001',
    });

    const result = await createCheckoutSession(baseInput);

    expect(result).toEqual({
      sessionId: 'cs_test_tradie_001',
      url: 'https://checkout.stripe.com/pay/cs_test_tradie_001',
    });
  });

  it('uses the tradie price ID from config for tradie tier', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_002',
      url: 'https://checkout.stripe.com/pay/cs_test_002',
    });

    await createCheckoutSession(baseInput);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_tradie_test', quantity: 1 }],
      })
    );
  });

  it('uses the team price ID from config for team tier', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_team_001',
      url: 'https://checkout.stripe.com/pay/cs_test_team_001',
    });

    await createCheckoutSession({ ...baseInput, tier: 'team' });

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_team_test', quantity: 1 }],
      })
    );
  });

  it('creates session in subscription mode with promo codes enabled', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_003',
      url: 'https://checkout.stripe.com/pay/cs_test_003',
    });

    await createCheckoutSession(baseInput);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        allow_promotion_codes: true,
      })
    );
  });

  it('embeds bossboard_user_id and tier in session metadata', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_004',
      url: 'https://checkout.stripe.com/pay/cs_test_004',
    });

    await createCheckoutSession(baseInput);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
        subscription_data: expect.objectContaining({
          metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
        }),
      })
    );
  });

  it('passes success_url and cancel_url through to Stripe', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_005',
      url: 'https://checkout.stripe.com/pay/cs_test_005',
    });

    await createCheckoutSession(baseInput);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: baseInput.successUrl,
        cancel_url: baseInput.cancelUrl,
      })
    );
  });

  it('throws when Stripe does not return a checkout URL', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_no_url',
      url: null,
    });

    await expect(createCheckoutSession(baseInput)).rejects.toThrow(
      'Stripe did not return a checkout URL'
    );
  });

  it('propagates Stripe API errors', async () => {
    mockCheckoutSessionsCreate.mockRejectedValueOnce(
      new Error('Stripe API error: card declined')
    );

    await expect(createCheckoutSession(baseInput)).rejects.toThrow(
      'Stripe API error: card declined'
    );
  });

  it('calls ensureStripeCustomer and passes the customer ID to Stripe', async () => {
    // Override: user has no existing customer → create one
    mockDbQuery
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] })  // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                 // UPDATE
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_fresh_001' });
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_fresh_001',
      url: 'https://checkout.stripe.com/pay/cs_fresh_001',
    });

    await createCheckoutSession(baseInput);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_fresh_001' })
    );
  });
});

// ===========================================================================
// 3. createPortalSession
// ===========================================================================
describe('createPortalSession', () => {
  it('returns the billing portal URL', async () => {
    mockBillingPortalSessionsCreate.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/session/bps_test_001',
    });

    const url = await createPortalSession('cus_test_001', 'https://app.bossboard.test/settings');

    expect(url).toBe('https://billing.stripe.com/session/bps_test_001');
  });

  it('passes customer ID and return URL to Stripe', async () => {
    mockBillingPortalSessionsCreate.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/session/bps_test_002',
    });

    await createPortalSession('cus_abc', 'https://return.example.com');

    expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_abc',
      return_url: 'https://return.example.com',
    });
  });

  it('propagates Stripe API errors', async () => {
    mockBillingPortalSessionsCreate.mockRejectedValueOnce(
      new Error('No such customer: cus_bad')
    );

    await expect(
      createPortalSession('cus_bad', 'https://app.bossboard.test')
    ).rejects.toThrow('No such customer: cus_bad');
  });
});

// ===========================================================================
// 4. constructWebhookEvent
// ===========================================================================
describe('constructWebhookEvent', () => {
  const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
  const signature = 'v1,t=1234,sig=abc';

  it('returns the parsed Stripe event for a valid signature', () => {
    const fakeEvent = makeEvent('checkout.session.completed', {});
    mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

    const event = constructWebhookEvent(rawBody, signature);

    expect(event.type).toBe('checkout.session.completed');
    expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
      rawBody,
      signature,
      'whsec_test_mock_secret'
    );
  });

  it('propagates Stripe signature-validation errors', () => {
    mockWebhooksConstructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    expect(() => constructWebhookEvent(rawBody, 'bad-sig')).toThrow(
      'No signatures found'
    );
  });

  it('uses the webhook secret from config', () => {
    const fakeEvent = makeEvent('ping', {});
    mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

    constructWebhookEvent(rawBody, signature);

    const [, , usedSecret] = mockWebhooksConstructEvent.mock.calls[0];
    expect(usedSecret).toBe('whsec_test_mock_secret');
  });
});

// ===========================================================================
// 5. handleWebhookEvent — idempotency
// ===========================================================================
describe('handleWebhookEvent — idempotency', () => {
  it('skips processing when the event has already been recorded', async () => {
    // markEventProcessed returns rowCount=0 → duplicate
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });

    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
      customer: 'cus_test',
      subscription: 'sub_test',
    });

    await handleWebhookEvent(event);

    // updateSubscriptionTier must NOT have been called
    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('processes the event when it is new (rowCount=1)', async () => {
    // markEventProcessed succeeds → new event
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
      customer: 'cus_test',
      subscription: 'sub_test',
    });

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalled();
  });

  it('processes the event when stripe_webhook_events table does not exist (DB throws)', async () => {
    // Table missing — markEventProcessed catches and returns true
    mockDbQuery.mockRejectedValueOnce(new Error('relation "stripe_webhook_events" does not exist'));

    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
      customer: 'cus_test',
      subscription: 'sub_test',
    });

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    // Should not throw
    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
    expect(mockUpdateSubscriptionTier).toHaveBeenCalled();
  });

  it('inserts the event ID into stripe_webhook_events', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 }); // INSERT dedup
    const event = makeEvent(
      'checkout.session.completed',
      {
        metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
        customer: 'cus_test',
        subscription: 'sub_test',
      },
      'evt_unique_id_999'
    );

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    const insertCall = mockDbQuery.mock.calls[0];
    expect(insertCall[0]).toMatch(/INSERT INTO stripe_webhook_events/);
    expect(insertCall[1]).toContain('evt_unique_id_999');
  });
});

// ===========================================================================
// 6. handleWebhookEvent — checkout.session.completed
// ===========================================================================
describe('handleWebhookEvent — checkout.session.completed', () => {
  beforeEach(() => {
    // markEventProcessed: new event
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
  });

  it('upgrades user to the tier from session metadata', async () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-001', tier: 'tradie' },
      customer: 'cus_test_001',
      subscription: 'sub_test_001',
    });

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-001',
      'tradie',
      expect.objectContaining({
        stripeCustomerId: 'cus_test_001',
        stripeSubscriptionId: 'sub_test_001',
        startedAt: expect.any(Date),
      })
    );
  });

  it('upgrades user to team tier from session metadata', async () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-007', tier: 'team' },
      customer: 'cus_team_001',
      subscription: 'sub_team_001',
    });

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-007',
      'team',
      expect.objectContaining({
        stripeCustomerId: 'cus_team_001',
        stripeSubscriptionId: 'sub_team_001',
      })
    );
  });

  it('handles customer as an object (expanded Stripe response)', async () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-002', tier: 'tradie' },
      customer: { id: 'cus_expanded_001', object: 'customer' },
      subscription: { id: 'sub_expanded_001', object: 'subscription' },
    });

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-002',
      'tradie',
      expect.objectContaining({
        stripeCustomerId: 'cus_expanded_001',
        stripeSubscriptionId: 'sub_expanded_001',
      })
    );
  });

  it('skips update when metadata is missing bossboard_user_id', async () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { tier: 'tradie' },  // missing bossboard_user_id
      customer: 'cus_test',
      subscription: 'sub_test',
    });

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('skips update when metadata is missing tier', async () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { bossboard_user_id: 'user-001' },  // missing tier
      customer: 'cus_test',
      subscription: 'sub_test',
    });

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('skips update when metadata is null', async () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: null,
      customer: 'cus_test',
      subscription: 'sub_test',
    });

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. handleWebhookEvent — customer.subscription.updated
// ===========================================================================
describe('handleWebhookEvent — customer.subscription.updated', () => {
  beforeEach(() => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 }); // dedup INSERT
  });

  it('updates tier to tradie when subscription is active and price matches', async () => {
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-001' },
      status: 'active',
      items: { data: [{ price: { id: 'price_tradie_test' } }] },
      current_period_end: 1800000000,
    });

    const event = makeEvent('customer.subscription.updated', subscription);
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-001',
      'tradie',
      expect.objectContaining({ stripeSubscriptionId: 'sub_test_001' })
    );
  });

  it('updates tier to team when subscription price is the team price ID', async () => {
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-005' },
      status: 'active',
      items: { data: [{ price: { id: 'price_team_test' } }] },
    });

    const event = makeEvent('customer.subscription.updated', subscription);
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-005',
      'team',
      expect.any(Object)
    );
  });

  it('updates tier when subscription status is trialing', async () => {
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-002' },
      status: 'trialing',
      items: { data: [{ price: { id: 'price_tradie_test' } }] },
    });

    const event = makeEvent('customer.subscription.updated', subscription);
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith('user-002', 'tradie', expect.any(Object));
  });

  it('does NOT downgrade user when status is past_due', async () => {
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-003' },
      status: 'past_due',
    });

    const event = makeEvent('customer.subscription.updated', subscription);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('does NOT downgrade user when status is unpaid', async () => {
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-004' },
      status: 'unpaid',
    });

    const event = makeEvent('customer.subscription.updated', subscription);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('looks up user by stripe_customer_id when metadata has no bossboard_user_id', async () => {
    const subscription = makeSubscription({
      metadata: {},  // no bossboard_user_id
      customer: 'cus_lookup_001',
      status: 'active',
      items: { data: [{ price: { id: 'price_tradie_test' } }] },
    });

    // DB lookup: find user by customer ID
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-from-lookup' }] });
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    const event = makeEvent('customer.subscription.updated', subscription);
    await handleWebhookEvent(event);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM users WHERE stripe_customer_id'),
      ['cus_lookup_001']
    );
    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-from-lookup',
      'tradie',
      expect.any(Object)
    );
  });

  it('skips update when customer lookup by ID returns no rows', async () => {
    const subscription = makeSubscription({
      metadata: {},
      customer: 'cus_unknown',
      status: 'active',
    });

    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no user found

    const event = makeEvent('customer.subscription.updated', subscription);
    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('skips update when customer is null and no metadata userId', async () => {
    const subscription = makeSubscription({
      metadata: {},
      customer: null,
    });

    const event = makeEvent('customer.subscription.updated', subscription);
    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('does not update tier when price ID is not recognized', async () => {
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-006' },
      status: 'active',
      items: { data: [{ price: { id: 'price_unknown_product' } }] },
    });

    const event = makeEvent('customer.subscription.updated', subscription);
    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('sets expiresAt from current_period_end', async () => {
    const periodEnd = 1900000000;
    const subscription = makeSubscription({
      metadata: { bossboard_user_id: 'user-001' },
      status: 'active',
      items: { data: [{ price: { id: 'price_tradie_test' } }] },
      current_period_end: periodEnd,
    });

    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    const event = makeEvent('customer.subscription.updated', subscription);
    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-001',
      'tradie',
      expect.objectContaining({
        expiresAt: new Date(periodEnd * 1000),
      })
    );
  });
});

// ===========================================================================
// 8. handleWebhookEvent — customer.subscription.deleted
// ===========================================================================
describe('handleWebhookEvent — customer.subscription.deleted', () => {
  beforeEach(() => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 }); // dedup INSERT
  });

  it('downgrades user to free tier when subscription is deleted', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-001' }] }); // lookup by customer ID
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    const subscription = makeSubscription({ customer: 'cus_deleted_001' });
    const event = makeEvent('customer.subscription.deleted', subscription);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
      'user-001',
      'free',
      expect.objectContaining({
        stripeSubscriptionId: undefined,
        expiresAt: expect.any(Date),
      })
    );
  });

  it('handles customer as an expanded object', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-002' }] });
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    const subscription = makeSubscription({
      customer: { id: 'cus_expanded_del_001', object: 'customer' },
    });
    const event = makeEvent('customer.subscription.deleted', subscription);

    await handleWebhookEvent(event);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM users WHERE stripe_customer_id'),
      ['cus_expanded_del_001']
    );
    expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith('user-002', 'free', expect.any(Object));
  });

  it('skips downgrade when no user is found for that customer ID', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no user

    const subscription = makeSubscription({ customer: 'cus_nobody' });
    const event = makeEvent('customer.subscription.deleted', subscription);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('skips downgrade when customer is null', async () => {
    const subscription = makeSubscription({ customer: null });
    const event = makeEvent('customer.subscription.deleted', subscription);

    await handleWebhookEvent(event);

    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('sets expiresAt to the current time (immediate expiry)', async () => {
    const before = new Date();
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-003' }] });
    mockUpdateSubscriptionTier.mockResolvedValueOnce(undefined);

    const subscription = makeSubscription({ customer: 'cus_expire_now' });
    const event = makeEvent('customer.subscription.deleted', subscription);

    await handleWebhookEvent(event);

    const after = new Date();
    const [, , { expiresAt }] = mockUpdateSubscriptionTier.mock.calls[0];
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ===========================================================================
// 9. handleWebhookEvent — invoice.payment_failed
// ===========================================================================
describe('handleWebhookEvent — invoice.payment_failed', () => {
  const invoice = {
    customer: 'cus_failed_001',
    amount_due: 1999,
    currency: 'nzd',
  };

  beforeEach(() => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 }); // dedup INSERT
  });

  it('sends push notification and email when both are configured', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-001', email: 'tradie@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce('ExponentPushToken[abc123]');
    mockSendPushNotifications.mockResolvedValueOnce(undefined);
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPaymentFailedEmail.mockResolvedValueOnce(undefined);

    const event = makeEvent('invoice.payment_failed', invoice);
    await handleWebhookEvent(event);

    expect(mockGetPushToken).toHaveBeenCalledWith('user-001');
    expect(mockSendPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExponentPushToken[abc123]',
        title: expect.stringContaining('Payment'),
        data: { type: 'payment_failed' },
      }),
    ]);
    expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith('tradie@example.com');
  });

  it('skips push notification when user has no push token', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-001', email: 'tradie@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce(null); // no token
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPaymentFailedEmail.mockResolvedValueOnce(undefined);

    const event = makeEvent('invoice.payment_failed', invoice);
    await handleWebhookEvent(event);

    expect(mockSendPushNotifications).not.toHaveBeenCalled();
    expect(mockSendPaymentFailedEmail).toHaveBeenCalled();
  });

  it('skips email when email is not configured', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-001', email: 'tradie@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce('ExponentPushToken[xyz]');
    mockSendPushNotifications.mockResolvedValueOnce(undefined);
    mockIsEmailConfigured.mockReturnValue(false); // email off

    const event = makeEvent('invoice.payment_failed', invoice);
    await handleWebhookEvent(event);

    expect(mockSendPushNotifications).toHaveBeenCalled();
    expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('still sends email even when push notification throws', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-001', email: 'tradie@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce('ExponentPushToken[abc]');
    mockSendPushNotifications.mockRejectedValueOnce(new Error('Expo push failed'));
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPaymentFailedEmail.mockResolvedValueOnce(undefined);

    const event = makeEvent('invoice.payment_failed', invoice);

    // Must not throw — push failure is caught independently
    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
    expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith('tradie@example.com');
  });

  it('still sends push notification even when email throws', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-001', email: 'tradie@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce('ExponentPushToken[abc]');
    mockSendPushNotifications.mockResolvedValueOnce(undefined);
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPaymentFailedEmail.mockRejectedValueOnce(new Error('SMTP timeout'));

    const event = makeEvent('invoice.payment_failed', invoice);

    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
    expect(mockSendPushNotifications).toHaveBeenCalled();
  });

  it('skips notifications when no user is found for the customer', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // no user

    const event = makeEvent('invoice.payment_failed', invoice);
    await handleWebhookEvent(event);

    expect(mockGetPushToken).not.toHaveBeenCalled();
    expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('skips notifications when invoice has no customer', async () => {
    const event = makeEvent('invoice.payment_failed', {
      customer: null,
      amount_due: 1999,
    });

    await handleWebhookEvent(event);

    expect(mockGetPushToken).not.toHaveBeenCalled();
    expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('handles customer as an expanded object', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-002', email: 'expanded@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce(null);
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPaymentFailedEmail.mockResolvedValueOnce(undefined);

    const event = makeEvent('invoice.payment_failed', {
      customer: { id: 'cus_expanded_002', object: 'customer' },
    });

    await handleWebhookEvent(event);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, email FROM users WHERE stripe_customer_id'),
      ['cus_expanded_002']
    );
    expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith('expanded@example.com');
  });

  it('includes payment_failed data type in push payload', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'user-001', email: 'tradie@example.com' }],
    });
    mockGetPushToken.mockResolvedValueOnce('ExponentPushToken[data_type_test]');
    mockSendPushNotifications.mockResolvedValueOnce(undefined);
    mockIsEmailConfigured.mockReturnValue(false);

    const event = makeEvent('invoice.payment_failed', invoice);
    await handleWebhookEvent(event);

    const [notifications] = mockSendPushNotifications.mock.calls[0];
    expect(notifications[0].data).toEqual({ type: 'payment_failed' });
    expect(notifications[0].sound).toBe('default');
  });
});

// ===========================================================================
// 10. handleWebhookEvent — unknown event types
// ===========================================================================
describe('handleWebhookEvent — unknown event types', () => {
  it('handles unknown event types without throwing', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 }); // dedup

    const event = makeEvent('payment_intent.created', { id: 'pi_test' });

    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
    expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('handles customer.created event without throwing', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent('customer.created', { id: 'cus_new' });
    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
  });

  it('handles invoice.payment_succeeded event without throwing', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent('invoice.payment_succeeded', { customer: 'cus_paid' });
    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
  });
});
