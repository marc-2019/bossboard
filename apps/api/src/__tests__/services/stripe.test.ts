/**
 * Stripe Service Tests
 *
 * Covers:
 *   - constructWebhookEvent: valid signature, invalid signature, missing webhook secret
 *   - handleWebhookEvent routing: checkout.session.completed, customer.subscription.updated,
 *     customer.subscription.deleted, invoice.payment_failed, unknown event type
 *   - Idempotency via markEventProcessed: new event, duplicate event, DB error fallback
 */

// --- Mocks (declared with 'mock' prefix so Jest hoisting allows factory access) ---

const mockConstructEvent = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockBillingPortalCreate = jest.fn();

jest.mock('stripe', () => {
  const MockStripe = jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    customers: {
      create: (...args: unknown[]) => mockCustomersCreate(...args),
    },
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockCheckoutSessionsCreate(...args),
      },
    },
    billingPortal: {
      sessions: {
        create: (...args: unknown[]) => mockBillingPortalCreate(...args),
      },
    },
  }));
  return { __esModule: true, default: MockStripe };
});

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

const mockUpdateSubscriptionTier = jest.fn();
jest.mock('../../services/subscriptions.js', () => ({
  updateSubscriptionTier: (...args: unknown[]) => mockUpdateSubscriptionTier(...args),
}));

const mockSendPaymentFailedEmail = jest.fn();
const mockIsEmailConfigured = jest.fn();
jest.mock('../../services/email.js', () => ({
  sendPaymentFailedEmail: (...args: unknown[]) => mockSendPaymentFailedEmail(...args),
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
}));

const mockGetPushToken = jest.fn();
const mockSendPushNotifications = jest.fn();
jest.mock('../../services/notifications.js', () => ({
  __esModule: true,
  default: {
    getPushToken: (...args: unknown[]) => mockGetPushToken(...args),
    sendPushNotifications: (...args: unknown[]) => mockSendPushNotifications(...args),
  },
}));

jest.mock('../../config/index.js', () => ({
  config: {
    stripe: {
      secretKey: 'sk_test_secret',
      webhookSecret: 'whsec_test',
      priceIdTradie: 'price_tradie_test',
      priceIdTeam: 'price_team_test',
    },
  },
}));

import { constructWebhookEvent, handleWebhookEvent } from '../../services/stripe.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal Stripe Event object for routing tests. */
function makeEvent(
  type: string,
  data: Record<string, unknown> = {},
  id = 'evt_test_1'
): any {
  return {
    id,
    type,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object: data },
  };
}

/**
 * Configure mockDbQuery for a brand-new event:
 *   call 1 → INSERT stripe_webhook_events (rowCount=1 means newly inserted → process it)
 *
 * The implementation uses INSERT ... ON CONFLICT DO NOTHING and checks rowCount directly.
 * Any subsequent db calls (e.g. SELECT users) must be mocked by individual tests.
 */
function setupMarkEventNew(): void {
  mockDbQuery
    .mockResolvedValueOnce({ rowCount: 1 });              // INSERT (new event)
}

/**
 * Configure mockDbQuery for a duplicate event:
 *   call 1 → INSERT (ON CONFLICT DO NOTHING — rowCount=0 means already processed, skip it)
 */
function setupMarkEventDuplicate(): void {
  mockDbQuery
    .mockResolvedValueOnce({ rowCount: 0 });              // INSERT no-op (duplicate)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Stripe Service', () => {
  // -------------------------------------------------------------------------
  describe('constructWebhookEvent', () => {
    it('calls stripe.webhooks.constructEvent with raw body, signature, and webhook secret', () => {
      const rawBody = Buffer.from('{"id":"evt_1"}');
      const signature = 't=123,v1=abc';
      const mockEvent = makeEvent('checkout.session.completed');
      mockConstructEvent.mockReturnValue(mockEvent);

      const result = constructWebhookEvent(rawBody, signature);

      expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, signature, 'whsec_test');
      expect(result).toBe(mockEvent);
    });

    it('propagates error thrown by Stripe SDK on invalid signature', () => {
      const rawBody = Buffer.from('{}');
      mockConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      expect(() => constructWebhookEvent(rawBody, 'bad_sig')).toThrow(
        'No signatures found matching the expected signature for payload'
      );
    });

    it('throws when STRIPE_WEBHOOK_SECRET is not configured', () => {
      // Temporarily clear the webhook secret via the live mock object
      const configMock = jest.requireMock('../../config/index.js') as any;
      const original = configMock.config.stripe.webhookSecret;
      configMock.config.stripe.webhookSecret = '';

      try {
        expect(() => constructWebhookEvent(Buffer.from('{}'), 'sig')).toThrow(
          'STRIPE_WEBHOOK_SECRET is not configured'
        );
      } finally {
        configMock.config.stripe.webhookSecret = original;
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('handleWebhookEvent — idempotency (markEventProcessed)', () => {
    it('skips processing when the event has already been handled', async () => {
      setupMarkEventDuplicate();

      const event = makeEvent('checkout.session.completed', {
        metadata: { bossboard_user_id: 'user-1', tier: 'tradie' },
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
    });

    it('processes the event when it is brand new', async () => {
      setupMarkEventNew();
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);

      const event = makeEvent('checkout.session.completed', {
        metadata: { bossboard_user_id: 'user-1', tier: 'tradie' },
        customer: 'cus_1',
        subscription: 'sub_1',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledTimes(1);
    });

    it('allows processing and logs a warning when the dedup table does not exist', async () => {
      mockDbQuery.mockRejectedValueOnce(
        new Error('relation "stripe_webhook_events" does not exist')
      );
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const event = makeEvent('checkout.session.completed', {
        metadata: { bossboard_user_id: 'user-1', tier: 'tradie' },
        customer: 'cus_1',
        subscription: 'sub_1',
      });

      await handleWebhookEvent(event);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stripe_webhook_events'));
      expect(mockUpdateSubscriptionTier).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  describe('handleWebhookEvent — checkout.session.completed', () => {
    it('activates subscription with tier and IDs from session metadata', async () => {
      setupMarkEventNew();
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);

      const event = makeEvent('checkout.session.completed', {
        metadata: { bossboard_user_id: 'user-1', tier: 'tradie' },
        customer: 'cus_123',
        subscription: 'sub_123',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
        'user-1',
        'tradie',
        expect.objectContaining({
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
          startedAt: expect.any(Date),
        })
      );
    });

    it('resolves the user from legacy trademate_user_id when bossboard_user_id is absent (migration fallback)', async () => {
      setupMarkEventNew();
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);

      // A Stripe object created before the 2026-06 metadata rename carries only
      // the old key. The dual-read fallback in handleCheckoutCompleted must
      // still resolve it; do not remove the fallback while legacy subs exist.
      const event = makeEvent('checkout.session.completed', {
        metadata: { trademate_user_id: 'legacy-user', tier: 'tradie' },
        customer: 'cus_legacy',
        subscription: 'sub_legacy',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
        'legacy-user',
        'tradie',
        expect.objectContaining({
          stripeCustomerId: 'cus_legacy',
          stripeSubscriptionId: 'sub_legacy',
        })
      );
    });

    it('does nothing when session metadata is missing userId', async () => {
      setupMarkEventNew();

      const event = makeEvent('checkout.session.completed', {
        metadata: {},
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
    });

    it('does nothing when session metadata is missing tier', async () => {
      setupMarkEventNew();

      const event = makeEvent('checkout.session.completed', {
        metadata: { bossboard_user_id: 'user-1' },
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('handleWebhookEvent — customer.subscription.updated', () => {
    it('updates tier when userId is present in subscription metadata', async () => {
      setupMarkEventNew();
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);

      const event = makeEvent('customer.subscription.updated', {
        id: 'sub_123',
        metadata: { bossboard_user_id: 'user-1' },
        status: 'active',
        items: { data: [{ price: { id: 'price_tradie_test' } }] },
        current_period_end: 1800000000,
        customer: 'cus_1',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
        'user-1',
        'tradie',
        expect.objectContaining({ stripeSubscriptionId: 'sub_123' })
      );
    });

    it('looks up userId by stripe_customer_id when metadata is absent', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-2' }] }); // SELECT users
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);

      const event = makeEvent('customer.subscription.updated', {
        id: 'sub_456',
        metadata: {},
        status: 'active',
        items: { data: [{ price: { id: 'price_team_test' } }] },
        current_period_end: 1800000000,
        customer: 'cus_456',
      });

      await handleWebhookEvent(event);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM users WHERE stripe_customer_id'),
        ['cus_456']
      );
      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
        'user-2',
        'team',
        expect.any(Object)
      );
    });

    it('does not downgrade when subscription status is past_due', async () => {
      setupMarkEventNew();

      const event = makeEvent('customer.subscription.updated', {
        id: 'sub_123',
        metadata: { bossboard_user_id: 'user-1' },
        status: 'past_due',
        items: { data: [{ price: { id: 'price_tradie_test' } }] },
        customer: 'cus_1',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
    });

    it('does nothing when customer has no matching user in the database', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // user not found

      const event = makeEvent('customer.subscription.updated', {
        id: 'sub_999',
        metadata: {},
        status: 'active',
        items: { data: [{ price: { id: 'price_tradie_test' } }] },
        customer: 'cus_unknown',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('handleWebhookEvent — customer.subscription.deleted', () => {
    it('downgrades user to free tier when subscription is deleted', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] }); // SELECT users
      mockUpdateSubscriptionTier.mockResolvedValue(undefined);

      const event = makeEvent('customer.subscription.deleted', {
        customer: 'cus_123',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).toHaveBeenCalledWith(
        'user-1',
        'free',
        expect.objectContaining({
          stripeSubscriptionId: undefined,
          expiresAt: expect.any(Date),
        })
      );
    });

    it('does nothing when no user found for the deleted subscription customer', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // user not found

      const event = makeEvent('customer.subscription.deleted', {
        customer: 'cus_unknown',
      });

      await handleWebhookEvent(event);

      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('handleWebhookEvent — invoice.payment_failed', () => {
    it('sends push notification and email when payment fails', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com' }],
      });
      mockGetPushToken.mockResolvedValue('ExponentPushToken[abc123]');
      mockSendPushNotifications.mockResolvedValue(undefined);
      mockIsEmailConfigured.mockReturnValue(true);
      mockSendPaymentFailedEmail.mockResolvedValue(undefined);

      const event = makeEvent('invoice.payment_failed', { customer: 'cus_123' });

      await handleWebhookEvent(event);

      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            to: 'ExponentPushToken[abc123]',
            title: expect.stringContaining('Payment'),
            data: { type: 'payment_failed' },
          }),
        ])
      );
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('skips push notification when user has no push token', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com' }],
      });
      mockGetPushToken.mockResolvedValue(null);
      mockIsEmailConfigured.mockReturnValue(true);
      mockSendPaymentFailedEmail.mockResolvedValue(undefined);

      const event = makeEvent('invoice.payment_failed', { customer: 'cus_123' });

      await handleWebhookEvent(event);

      expect(mockSendPushNotifications).not.toHaveBeenCalled();
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('skips email when email service is not configured', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com' }],
      });
      mockGetPushToken.mockResolvedValue(null);
      mockIsEmailConfigured.mockReturnValue(false);

      const event = makeEvent('invoice.payment_failed', { customer: 'cus_123' });

      await handleWebhookEvent(event);

      expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    });

    it('continues to send email even if push notification throws', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com' }],
      });
      mockGetPushToken.mockResolvedValue('ExponentPushToken[abc]');
      mockSendPushNotifications.mockRejectedValue(new Error('Push service unavailable'));
      mockIsEmailConfigured.mockReturnValue(true);
      mockSendPaymentFailedEmail.mockResolvedValue(undefined);

      const event = makeEvent('invoice.payment_failed', { customer: 'cus_123' });

      await expect(handleWebhookEvent(event)).resolves.not.toThrow();
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('does nothing when no user found for the failed-payment customer', async () => {
      setupMarkEventNew();
      mockDbQuery.mockResolvedValueOnce({ rows: [] }); // user not found

      const event = makeEvent('invoice.payment_failed', { customer: 'cus_unknown' });

      await handleWebhookEvent(event);

      expect(mockGetPushToken).not.toHaveBeenCalled();
      expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('handleWebhookEvent — unknown event types', () => {
    it('logs and does not throw for unhandled event types', async () => {
      setupMarkEventNew();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const event = makeEvent('payment_intent.created', {});

      await expect(handleWebhookEvent(event)).resolves.not.toThrow();
      expect(mockUpdateSubscriptionTier).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
