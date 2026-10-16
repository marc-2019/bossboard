-- Staff-only memo on recurring templates.
-- Customer-facing template notes stay in `notes` (same rule as invoices.notes).
-- generateInvoiceFromRecurring copies this column onto invoices.internal_memo,
-- never onto invoices.notes.

ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS internal_memo TEXT;

COMMENT ON COLUMN recurring_invoices.internal_memo IS
  'Internal-only memo. Copied to invoices.internal_memo on generate. Never onto customer notes, PDF, email, or share link.';
