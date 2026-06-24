/**
 * Stripe Mock Tests
 *
 * Exercises installStripeMock() against a fake Stripe-shaped client and asserts
 * the synthetic responses for every mocked method, covering both sides of each
 * conditional (mode=payment vs subscription vs undefined, customer as string vs
 * derived, present vs absent optional params, string vs Buffer webhook payload).
 */

import { installStripeMock } from '../../../services/mocks/stripe-mock.js';

// Minimal fake matching the shape installStripeMock binds onto. The original
// methods are stubbed so `.bind()` has something to grab; the mock replaces them.
function makeFakeStripe(): any {
  return {
    customers: { create: async () => ({}) },
    checkout: { sessions: { create: async () => ({}) } },
    billingPortal: { sessions: { create: async () => ({}) } },
    webhooks: { constructEvent: () => ({}) },
  };
}

describe('installStripeMock', () => {
  it('returns the same client instance for chaining', () => {
    const stripe = makeFakeStripe();
    expect(installStripeMock(stripe)).toBe(stripe);
  });

  describe('customers.create', () => {
    it('echoes provided params', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const c = await stripe.customers.create({
        email: 'tradie@example.com',
        name: 'Test Tradie',
        metadata: { bossboard_user_id: 'u_1' },
        description: 'Beta user',
      });
      expect(c.id).toMatch(/^cus_test_mock_/);
      expect(c.object).toBe('customer');
      expect(c.email).toBe('tradie@example.com');
      expect(c.name).toBe('Test Tradie');
      expect(c.metadata).toEqual({ bossboard_user_id: 'u_1' });
      expect(c.description).toBe('Beta user');
      expect(c.livemode).toBe(false);
    });

    it('falls back to nulls/empties when params omitted', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const c = await stripe.customers.create();
      expect(c.email).toBeNull();
      expect(c.name).toBeNull();
      expect(c.metadata).toEqual({});
      expect(c.description).toBeNull();
    });
  });

  describe('checkout.sessions.create', () => {
    it('payment mode echoes payment_intent and unpaid status with string customer', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const s = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: 'cus_existing_123',
        customer_email: 'pay@example.com',
        success_url: 'https://app/success',
        cancel_url: 'https://app/cancel',
        metadata: { invoice_id: 'inv_1' },
      });
      expect(s.id).toMatch(/^cs_test_mock_/);
      expect(s.url).toContain('checkout.stripe.com');
      expect(s.mode).toBe('payment');
      expect(s.payment_status).toBe('unpaid');
      expect(s.customer).toBe('cus_existing_123');
      expect(s.customer_email).toBe('pay@example.com');
      expect(s.success_url).toBe('https://app/success');
      expect(s.cancel_url).toBe('https://app/cancel');
      expect(s.metadata).toEqual({ invoice_id: 'inv_1' });
      expect(s.payment_intent).toMatch(/^pi_test_mock_/);
      expect(s.subscription).toBeNull();
    });

    it('subscription mode echoes a subscription id', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const s = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: 'cus_sub_1',
      });
      expect(s.payment_status).toBe('no_payment_required');
      expect(s.payment_intent).toBeNull();
      expect(s.subscription).toMatch(/^sub_test_mock_/);
    });

    it('defaults mode to subscription and derives a customer id when params sparse', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const s = await stripe.checkout.sessions.create({});
      expect(s.mode).toBe('subscription');
      expect(s.customer).toMatch(/^cus_test_mock_/);
      expect(s.customer_email).toBeNull();
      expect(s.success_url).toBeNull();
      expect(s.cancel_url).toBeNull();
      expect(s.metadata).toEqual({});
      expect(s.subscription).toMatch(/^sub_test_mock_/);
    });
  });

  describe('billingPortal.sessions.create', () => {
    it('returns a portal url and echoes return_url', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const p = await stripe.billingPortal.sessions.create({
        customer: 'cus_1',
        return_url: 'https://app/return',
      });
      expect(p.id).toMatch(/^bps_test_mock_/);
      expect(p.url).toContain('billing.stripe.com');
      expect(p.customer).toBe('cus_1');
      expect(p.return_url).toBe('https://app/return');
    });

    it('falls back to null return_url when omitted', async () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const p = await stripe.billingPortal.sessions.create({ customer: 'cus_2' });
      expect(p.return_url).toBeNull();
    });
  });

  describe('webhooks.constructEvent', () => {
    it('parses a JSON string payload, bypassing signature verification', () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const event = stripe.webhooks.constructEvent(
        JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
        'sig',
        'whsec_test'
      );
      expect(event.id).toBe('evt_1');
      expect(event.type).toBe('checkout.session.completed');
    });

    it('parses a Buffer payload', () => {
      const stripe = makeFakeStripe();
      installStripeMock(stripe);
      const event = stripe.webhooks.constructEvent(
        Buffer.from(JSON.stringify({ id: 'evt_2', type: 'invoice.payment_failed' })),
        ['sig'],
        'whsec_test'
      );
      expect(event.id).toBe('evt_2');
      expect(event.type).toBe('invoice.payment_failed');
    });
  });
});
