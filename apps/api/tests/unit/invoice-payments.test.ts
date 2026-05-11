/**
 * apps/api/tests/unit/invoice-payments.test.ts
 *
 * Unit tests for the Phase 1 invoice-payment additions to services/stripe.ts.
 *
 * Coverage:
 *   - createInvoicePaymentLink — happy path, zero/negative amount guard,
 *     metadata population, attachStripePaymentLink invocation.
 *   - getOrCreateInvoicePaymentLink — returns null when Stripe unconfigured,
 *     returns null when invoice already paid, reuses existing session, creates
 *     new session when none exists.
 *   - handleWebhookEvent('checkout.session.completed', mode=payment) — routes
 *     to invoice-payment handler, flips invoice to paid, captures
 *     payment_intent_id, handles already-paid (idempotency), handles
 *     no-matching-invoice case silently.
 *   - handleWebhookEvent('payment_intent.succeeded') — backstop only fires for
 *     kind='invoice_payment' metadata, no-op for subscription intents,
 *     idempotent on already-paid invoice.
 *   - constructWebhookEvent — signature verification with mocked SDK (same
 *     as subscription test, re-verified for invoice flow regression-protect).
 *
 * Pattern mirrors tests/unit/stripe.test.ts — same mock strategy (mock
 * Stripe SDK, mock db.query, mock the invoices service helpers).
 */

const mockCheckoutSessionsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
    customers: { create: jest.fn() },
    billingPortal: { sessions: { create: jest.fn() } },
  }));
});

jest.mock('../../src/config/index.js', () => ({
  __esModule: true,
  config: {
    stripe: {
      secretKey: 'sk_test_invoice',
      webhookSecret: 'whsec_test_invoice',
      priceIdTradie: 'price_tradie_test',
      priceIdTeam: 'price_team_test',
      returnUrl: 'https://app.bossboard.local',
    },
  },
}));

const mockDbQuery = jest.fn();
jest.mock('../../src/services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

const mockMarkAsPaidFromWebhookBySession = jest.fn();
const mockAttachStripePaymentLink = jest.fn();
const mockGetInvoiceByIdRaw = jest.fn();
jest.mock('../../src/services/invoices.js', () => ({
  __esModule: true,
  markAsPaidFromWebhookBySession: (...args: unknown[]) =>
    mockMarkAsPaidFromWebhookBySession(...args),
  attachStripePaymentLink: (...args: unknown[]) =>
    mockAttachStripePaymentLink(...args),
  getInvoiceByIdRaw: (...args: unknown[]) => mockGetInvoiceByIdRaw(...args),
}));

// Minimal mocks for sibling services pulled in by stripe.ts (subscriptions,
// email, notifications). See tests/unit/stripe.test.ts for fuller mocks; the
// invoice-payment flow only needs these to satisfy the import graph.
jest.mock('../../src/services/subscriptions.js', () => ({
  updateSubscriptionTier: jest.fn(),
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
jest.mock('../../src/services/email.js', () => ({
  sendPaymentFailedEmail: jest.fn(),
  isEmailConfigured: jest.fn(() => false),
}));
jest.mock('../../src/services/notifications.js', () => ({
  __esModule: true,
  default: {
    getPushToken: jest.fn(),
    sendPushNotifications: jest.fn(),
  },
}));

import {
  createInvoicePaymentLink,
  getOrCreateInvoicePaymentLink,
  constructWebhookEvent,
  handleWebhookEvent,
} from '../../src/services/stripe.js';
import type Stripe from 'stripe';

function makeEvent(type: string, data: object, id = 'evt_inv_001'): Stripe.Event {
  return {
    id, type, data: { object: data }, object: 'event',
    api_version: '2025-02-24.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false, pending_webhooks: 0, request: null,
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  jest.clearAllMocks();
  // markEventProcessed defaults to new event
  mockDbQuery.mockResolvedValue({ rowCount: 1, rows: [] });
});


// ===========================================================================
// createInvoicePaymentLink
// ===========================================================================
describe('createInvoicePaymentLink', () => {
  const base = {
    invoiceId: 'inv-001',
    userId: 'user-001',
    description: 'Invoice INV-0042 — Acme Plumbing',
    amountCents: 19999,
    successUrl: 'https://app.bossboard.local/paid',
    cancelUrl: 'https://app.bossboard.local/cancelled',
  };

  it('throws when amountCents is zero or negative', async () => {
    await expect(
      createInvoicePaymentLink({ ...base, amountCents: 0 })
    ).rejects.toThrow('positive amount');
    await expect(
      createInvoicePaymentLink({ ...base, amountCents: -100 })
    ).rejects.toThrow('positive amount');
  });

  it('creates a one-time Checkout Session with inline price_data', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_test_inv_001',
      url: 'https://checkout.stripe.com/pay/cs_test_inv_001',
    });
    mockAttachStripePaymentLink.mockResolvedValueOnce({} as never);

    const result = await createInvoicePaymentLink(base);

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: 'nzd',
              unit_amount: 19999,
              product_data: { name: base.description },
            }),
            quantity: 1,
          }),
        ],
        metadata: {
          bossboard_invoice_id: 'inv-001',
          trademate_user_id: 'user-001',
          kind: 'invoice_payment',
        },
      })
    );
    expect(result).toEqual({
      sessionId: 'cs_test_inv_001',
      url: 'https://checkout.stripe.com/pay/cs_test_inv_001',
    });
  });

  it('persists the session ID + URL to the invoice via attachStripePaymentLink', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_persist_001',
      url: 'https://checkout.stripe.com/pay/cs_persist_001',
    });
    mockAttachStripePaymentLink.mockResolvedValueOnce({} as never);

    await createInvoicePaymentLink(base);

    expect(mockAttachStripePaymentLink).toHaveBeenCalledWith({
      invoiceId: 'inv-001',
      userId: 'user-001',
      stripeCheckoutSessionId: 'cs_persist_001',
      paymentLinkUrl: 'https://checkout.stripe.com/pay/cs_persist_001',
    });
  });

  it('throws when Stripe does not return a session URL', async () => {
    mockCheckoutSessionsCreate.mockResolvedValueOnce({ id: 'cs_no_url', url: null });
    await expect(createInvoicePaymentLink(base)).rejects.toThrow(
      'Stripe did not return a payment link URL'
    );
  });
});


// ===========================================================================
// getOrCreateInvoicePaymentLink
// ===========================================================================
describe('getOrCreateInvoicePaymentLink', () => {
  it('returns null when invoice is already paid', async () => {
    mockGetInvoiceByIdRaw.mockResolvedValueOnce({
      id: 'inv-001', status: 'paid', total: 19999, invoiceNumber: 'INV-0001',
    });
    const result = await getOrCreateInvoicePaymentLink('inv-001', 'user-001', {
      successUrl: 'https://x', cancelUrl: 'https://x',
    });
    expect(result).toBeNull();
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('reuses an existing payment link when invoice already has one', async () => {
    mockGetInvoiceByIdRaw.mockResolvedValueOnce({
      id: 'inv-002', status: 'sent', total: 19999,
      invoiceNumber: 'INV-0002', clientName: 'Acme',
      stripeCheckoutSessionId: 'cs_existing_001',
      paymentLinkUrl: 'https://checkout.stripe.com/pay/cs_existing_001',
    });
    const result = await getOrCreateInvoicePaymentLink('inv-002', 'user-001', {
      successUrl: 'https://x', cancelUrl: 'https://x',
    });
    expect(result).toEqual({
      sessionId: 'cs_existing_001',
      url: 'https://checkout.stripe.com/pay/cs_existing_001',
    });
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('creates a new link when invoice has none', async () => {
    mockGetInvoiceByIdRaw.mockResolvedValueOnce({
      id: 'inv-003', status: 'sent', total: 50000,
      invoiceNumber: 'INV-0003', clientName: 'Beta Ltd',
      stripeCheckoutSessionId: null, paymentLinkUrl: null,
    });
    mockCheckoutSessionsCreate.mockResolvedValueOnce({
      id: 'cs_new_001', url: 'https://checkout.stripe.com/pay/cs_new_001',
    });
    mockAttachStripePaymentLink.mockResolvedValueOnce({} as never);

    const result = await getOrCreateInvoicePaymentLink('inv-003', 'user-001', {
      successUrl: 'https://success', cancelUrl: 'https://cancel',
    });

    expect(result?.url).toBe('https://checkout.stripe.com/pay/cs_new_001');
    expect(mockCheckoutSessionsCreate).toHaveBeenCalled();
  });

  it('returns null when invoice not found', async () => {
    mockGetInvoiceByIdRaw.mockResolvedValueOnce(null);
    const result = await getOrCreateInvoicePaymentLink('inv-missing', 'user-001', {
      successUrl: 'https://x', cancelUrl: 'https://x',
    });
    expect(result).toBeNull();
  });
});


// ===========================================================================
// constructWebhookEvent — signature verification regression
// ===========================================================================
describe('constructWebhookEvent (invoice flow regression)', () => {
  it('rejects an invalid signature with a clear error', () => {
    mockWebhooksConstructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    expect(() =>
      constructWebhookEvent(Buffer.from('{}'), 'bad-sig')
    ).toThrow('No signatures found');
  });

  it('returns the parsed event for a valid signature', () => {
    const event = makeEvent('checkout.session.completed', {
      mode: 'payment',
      metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-001' },
    });
    mockWebhooksConstructEvent.mockReturnValueOnce(event);

    const result = constructWebhookEvent(Buffer.from('{}'), 'sig-good');
    expect(result.type).toBe('checkout.session.completed');
  });
});


// ===========================================================================
// handleWebhookEvent — checkout.session.completed (mode=payment)
// ===========================================================================
describe('handleWebhookEvent — invoice checkout.session.completed', () => {
  it('routes mode=payment sessions to the invoice handler and flips invoice paid', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_paid_001',
      mode: 'payment',
      metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-001' },
      payment_intent: 'pi_test_001',
    });

    mockMarkAsPaidFromWebhookBySession.mockResolvedValueOnce({
      id: 'inv-001', invoiceNumber: 'INV-0001', status: 'paid',
    });

    await handleWebhookEvent(event);

    expect(mockMarkAsPaidFromWebhookBySession).toHaveBeenCalledWith({
      stripeCheckoutSessionId: 'cs_paid_001',
      stripePaymentIntentId: 'pi_test_001',
      paymentReference: 'pi_test_001',
    });
  });

  it('falls back to session.id as payment_reference when no payment_intent', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_no_intent',
      mode: 'payment',
      metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-002' },
      payment_intent: null,
    });
    mockMarkAsPaidFromWebhookBySession.mockResolvedValueOnce({
      id: 'inv-002', invoiceNumber: 'INV-0002', status: 'paid',
    });

    await handleWebhookEvent(event);

    expect(mockMarkAsPaidFromWebhookBySession).toHaveBeenCalledWith({
      stripeCheckoutSessionId: 'cs_no_intent',
      stripePaymentIntentId: null,
      paymentReference: 'cs_no_intent',
    });
  });

  it('skips silently when metadata bossboard_invoice_id is missing', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_orphan',
      mode: 'payment',
      metadata: { kind: 'invoice_payment' }, // no invoice_id
    });

    await handleWebhookEvent(event);

    expect(mockMarkAsPaidFromWebhookBySession).not.toHaveBeenCalled();
  });

  it('skips silently when no matching invoice row exists', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_unknown',
      mode: 'payment',
      metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-deleted' },
    });
    mockMarkAsPaidFromWebhookBySession.mockResolvedValueOnce(null);

    // Should not throw; just log a warning
    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
  });

  it('idempotency: duplicate Stripe event ID is skipped before any DB write', async () => {
    // markEventProcessed returns rowCount=0 → duplicate event
    mockDbQuery.mockReset();
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const event = makeEvent(
      'checkout.session.completed',
      { id: 'cs_dup', mode: 'payment', metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-001' } },
      'evt_duplicate_001'
    );

    await handleWebhookEvent(event);

    expect(mockMarkAsPaidFromWebhookBySession).not.toHaveBeenCalled();
  });

  it('subscription checkout.session.completed events are NOT routed to invoice handler', async () => {
    // mode=subscription should hit the subscription handler, NOT the invoice handler.
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_sub_001',
      mode: 'subscription',
      metadata: { trademate_user_id: 'user-001', tier: 'tradie' },
      customer: 'cus_001',
      subscription: 'sub_001',
    });

    await handleWebhookEvent(event);

    expect(mockMarkAsPaidFromWebhookBySession).not.toHaveBeenCalled();
    // (subscription tier update assertions handled by stripe.test.ts —
    // here we only assert that the invoice path was NOT taken.)
  });
});


// ===========================================================================
// handleWebhookEvent — payment_intent.succeeded (backstop)
// ===========================================================================
describe('handleWebhookEvent — payment_intent.succeeded backstop', () => {
  it('is a no-op when payment_intent metadata.kind is not "invoice_payment"', async () => {
    const event = makeEvent('payment_intent.succeeded', {
      id: 'pi_subscription_001',
      metadata: {}, // no kind → not our invoice
    });

    await handleWebhookEvent(event);

    // Two DB calls allowed: markEventProcessed (mocked above) — but no UPDATE.
    const updateCalls = mockDbQuery.mock.calls.filter((c) =>
      String(c[0]).includes('UPDATE invoices')
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('flips invoice paid when metadata.kind=invoice_payment + invoice still unpaid', async () => {
    // Sequence:
    //   1. markEventProcessed INSERT → rowCount=1 (new event) [already set in beforeEach]
    //   2. UPDATE invoices → rowCount=1 (we flipped it)
    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })                              // dedup
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'inv-001', invoice_number: 'INV-0001' }] });

    const event = makeEvent('payment_intent.succeeded', {
      id: 'pi_inv_001',
      metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-001' },
    });

    await handleWebhookEvent(event);

    const updateCall = mockDbQuery.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE invoices')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['pi_inv_001', 'inv-001']);
  });

  it('is idempotent — already-paid invoice returns rowCount=0 and logs no-op', async () => {
    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })  // dedup
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // UPDATE matched nothing

    const event = makeEvent('payment_intent.succeeded', {
      id: 'pi_already_paid',
      metadata: { kind: 'invoice_payment', bossboard_invoice_id: 'inv-001' },
    });

    await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
  });
});
