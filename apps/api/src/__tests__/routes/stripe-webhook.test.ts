/**
 * Stripe Webhook Route Tests
 *
 * Covers:
 *   - 400 response when stripe-signature header is missing
 *   - 400 response when signature verification fails
 *   - 200 { received: true } response on valid webhook
 *   - constructWebhookEvent called with raw Buffer body (not parsed JSON)
 *   - handleWebhookEvent is invoked asynchronously (does not block HTTP response)
 *   - handleWebhookEvent errors do not cause the route to return 5xx
 *
 * NOTE: This route must be mounted with express.raw() — NOT express.json() —
 * because Stripe signature verification requires the raw request body.
 */

import request from 'supertest';
import express, { Express } from 'express';

const mockConstructWebhookEvent = jest.fn();
const mockHandleWebhookEvent = jest.fn();

jest.mock('../../services/stripe.js', () => ({
  constructWebhookEvent: (...args: unknown[]) => mockConstructWebhookEvent(...args),
  handleWebhookEvent: (...args: unknown[]) => mockHandleWebhookEvent(...args),
}));

import stripeWebhookRouter from '../../routes/stripe-webhook.js';

// ---------------------------------------------------------------------------
// Test app — mirrors how the route is registered in production (index.ts)
// ---------------------------------------------------------------------------

let app: Express;

beforeAll(() => {
  app = express();
  // Raw body parser MUST precede the route — same as production setup
  app.use('/webhooks/stripe', express.raw({ type: '*/*' }), stripeWebhookRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_SIGNATURE = 't=1234567890,v1=abc123def456';
const VALID_RAW_BODY = Buffer.from(
  JSON.stringify({ id: 'evt_test_1', type: 'checkout.session.completed' })
);
const MOCK_EVENT = { id: 'evt_test_1', type: 'checkout.session.completed' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /webhooks/stripe', () => {
  describe('signature validation', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const response = await request(app)
        .post('/webhooks/stripe')
        .send(VALID_RAW_BODY);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing stripe-signature header');
      expect(mockConstructWebhookEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when the signature header is present but verification fails', async () => {
      mockConstructWebhookEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'invalid_signature')
        .send(VALID_RAW_BODY);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No signatures found');
    });

    it('returns 400 with a generic message when a non-Error is thrown during verification', async () => {
      mockConstructWebhookEvent.mockImplementation(() => {
        // Intentionally throw a non-Error to exercise the generic-message path.
        throw 'unexpected non-error value';
      });

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'bad_sig')
        .send(VALID_RAW_BODY);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Webhook signature verification failed');
    });
  });

  describe('successful webhook receipt', () => {
    it('returns 200 with { received: true } on a valid webhook', async () => {
      mockConstructWebhookEvent.mockReturnValue(MOCK_EVENT);
      mockHandleWebhookEvent.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', VALID_SIGNATURE)
        .send(VALID_RAW_BODY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('passes a raw Buffer (not parsed JSON) to constructWebhookEvent', async () => {
      mockConstructWebhookEvent.mockReturnValue(MOCK_EVENT);
      mockHandleWebhookEvent.mockResolvedValue(undefined);

      await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', VALID_SIGNATURE)
        .set('Content-Type', 'application/json')
        .send(VALID_RAW_BODY);

      const [bodyArg, sigArg] = mockConstructWebhookEvent.mock.calls[0];
      expect(Buffer.isBuffer(bodyArg)).toBe(true);
      expect(sigArg).toBe(VALID_SIGNATURE);
    });

    it('calls handleWebhookEvent with the verified event object', async () => {
      mockConstructWebhookEvent.mockReturnValue(MOCK_EVENT);
      mockHandleWebhookEvent.mockResolvedValue(undefined);

      await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', VALID_SIGNATURE)
        .send(VALID_RAW_BODY);

      expect(mockHandleWebhookEvent).toHaveBeenCalledWith(MOCK_EVENT);
    });
  });

  describe('async processing', () => {
    it('responds with 200 immediately even while handleWebhookEvent is still running', async () => {
      mockConstructWebhookEvent.mockReturnValue(MOCK_EVENT);

      // Simulate slow async processing that hasn't resolved when the response arrives
      let resolveProcessing!: () => void;
      const processingPromise = new Promise<void>((resolve) => {
        resolveProcessing = resolve;
      });
      mockHandleWebhookEvent.mockReturnValue(processingPromise);

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', VALID_SIGNATURE)
        .send(VALID_RAW_BODY);

      // Response must arrive before processing completes
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(mockHandleWebhookEvent).toHaveBeenCalledWith(MOCK_EVENT);

      // Clean up the dangling promise
      resolveProcessing();
      await processingPromise;
    });

    it('returns 200 even when handleWebhookEvent rejects (error is swallowed async)', async () => {
      mockConstructWebhookEvent.mockReturnValue(MOCK_EVENT);
      mockHandleWebhookEvent.mockRejectedValue(new Error('Database connection lost'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', VALID_SIGNATURE)
        .send(VALID_RAW_BODY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });

      // Allow the rejected promise's .catch() handler to run
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Stripe Webhook]'),
        expect.any(String),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});
