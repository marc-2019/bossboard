-- Staff-only memo on recurring templates.
-- Customer-facing template notes stay in `notes` (same rule as invoices.notes).
-- generateInvoiceFromRecurring copies this column onto invoices.internal_memo,
-- never onto invoices.notes.

ALTER TABLE recurring_invoices
  ADD COLUMN IF NOT EXISTS internal_memo TEXT;

-- 2000 characters, same cap as API validation (INTERNAL_MEMO_MAX_LENGTH).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recurring_invoices_internal_memo_len'
  ) THEN
    ALTER TABLE recurring_invoices
      ADD CONSTRAINT recurring_invoices_internal_memo_len
      CHECK (internal_memo IS NULL OR char_length(internal_memo) <= 2000);
  END IF;
END $$;

COMMENT ON COLUMN recurring_invoices.internal_memo IS
  'Internal-only memo (max 2000 characters). Copied to invoices.internal_memo on generate. Never onto customer notes, PDF, email, or share link.';
