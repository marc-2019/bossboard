-- One generated invoice per recurring template per Auckland calendar month.
-- recurring_period is YYYY-MM in Pacific/Auckland. NULL means a one-off invoice,
-- or a historical duplicate that could not be attributed uniquely.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recurring_period VARCHAR(7);

COMMENT ON COLUMN invoices.recurring_period IS
  'Auckland calendar month (YYYY-MM) this recurring generation belongs to. NULL for one-off invoices.';

-- Attribute the earliest invoice in each template+month. Later historical
-- duplicates stay NULL so this unique index can be created without rewriting them.
UPDATE invoices i
SET recurring_period = sub.period
FROM (
  SELECT DISTINCT ON (
    recurring_invoice_id,
    to_char(created_at AT TIME ZONE 'Pacific/Auckland', 'YYYY-MM')
  )
    id,
    to_char(created_at AT TIME ZONE 'Pacific/Auckland', 'YYYY-MM') AS period
  FROM invoices
  WHERE recurring_invoice_id IS NOT NULL
    AND recurring_period IS NULL
  ORDER BY
    recurring_invoice_id,
    to_char(created_at AT TIME ZONE 'Pacific/Auckland', 'YYYY-MM'),
    created_at ASC,
    id ASC
) sub
WHERE i.id = sub.id
  AND i.recurring_period IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_recurring_period_unique
  ON invoices (recurring_invoice_id, recurring_period)
  WHERE recurring_invoice_id IS NOT NULL
    AND recurring_period IS NOT NULL;
