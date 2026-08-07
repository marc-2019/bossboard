-- Migration: 018_invoice_discount.sql
-- Client invoice discounts (tradie → their customer), before GST.
-- discount_type: 'none' | 'fixed' | 'percent'
-- discount_value: cents when fixed; whole percent 0–100 when percent
-- discount_amount: computed cents actually applied (capped at subtotal)
-- discount_label: optional line label on PDF / detail (default "Discount")

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label TEXT NULL;

DO $$ BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_discount_type_check
    CHECK (discount_type IN ('none', 'fixed', 'percent'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_discount_amount_nonneg
    CHECK (discount_amount >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN invoices.discount_type IS 'none | fixed (cents) | percent (0-100)';
COMMENT ON COLUMN invoices.discount_value IS 'Input value: cents if fixed, percent if percent';
COMMENT ON COLUMN invoices.discount_amount IS 'Computed discount in cents applied before GST';
COMMENT ON COLUMN invoices.discount_label IS 'Optional label shown on PDF (defaults to Discount)';
