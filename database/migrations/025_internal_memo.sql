-- Internal memo: staff-only notes that never appear on customer PDF/email/share.
-- Customer-facing notes remain in `notes` (subject to customer-ready validation).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS internal_memo TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS internal_memo TEXT;

COMMENT ON COLUMN quotes.internal_memo IS
  'Internal-only memo (seed notes, review flags, Deskera refs). Never on quote PDF.';
COMMENT ON COLUMN invoices.internal_memo IS
  'Internal-only memo. Never on invoice PDF, email body, or share link.';
