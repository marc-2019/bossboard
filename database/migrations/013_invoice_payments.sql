-- Migration: 013_invoice_payments.sql
-- Phase 1 invoice payment gateway (Stripe Payment Links).
-- Adds the columns the public invoice flow needs to (a) hand off to a
-- Stripe-hosted payment page and (b) record the payment when the webhook
-- lands. Subscription billing (services/stripe.ts checkout flow) is untouched.
--
-- See: docs/product/PAYMENT_GATEWAY_PARTNERS.md  (Phase 1 recommendation)

-- payment_provider: which gateway processed this invoice ('stripe' for Phase 1;
--   reserved for 'windcave' / 'akahu' in later phases). NULL for unpaid or
--   manually-marked-paid invoices.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20)
  CHECK (payment_provider IS NULL OR payment_provider IN ('stripe', 'windcave', 'akahu', 'manual'));

-- payment_reference: opaque reference from the gateway (Stripe payment_intent
--   ID, or for manual marks a free-text reference like a bank txn ID). Used
--   for reconciliation, refund lookup, and audit trail.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255);

-- payment_link_url: the gateway-hosted payment page URL we sent the client to.
--   Persisted so the public invoice page renders a consistent "Pay Now" link
--   across requests (Stripe Checkout Sessions are reusable until they expire).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT;

-- stripe_checkout_session_id: lets us look up the session for status checks
--   and matches webhook events back to the originating session.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255);

-- stripe_payment_intent_id: captured from the webhook payload; recorded so
--   refunds can be issued without re-deriving from the Checkout Session.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

-- Index for webhook lookup: when checkout.session.completed fires we look up
--   the invoice by stripe_checkout_session_id.
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_session
  ON invoices(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Index for the reconciliation flow: looking up an invoice from a payment
--   intent ID (e.g. when investigating a Stripe dashboard alert).
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent
  ON invoices(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN invoices.payment_provider IS
  'Gateway that processed this invoice payment (stripe / windcave / akahu / manual). NULL when unpaid.';
COMMENT ON COLUMN invoices.payment_reference IS
  'Gateway-opaque reference (Stripe payment_intent ID for Phase 1). Used for refunds and reconciliation.';
COMMENT ON COLUMN invoices.payment_link_url IS
  'Gateway-hosted payment page URL — persisted so the public invoice page renders a stable Pay Now link.';
