-- P1.1: operator chase bookkeeping (not client messaging)
-- See docs/QUOTE_P1_1_SENT_AT_ADDENDUM_2026-08-13.md

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_operator_nudge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operator_nudge_count INTEGER NOT NULL DEFAULT 0;

-- Best-effort backfill for rows already past draft
UPDATE quotes
SET sent_at = COALESCE(sent_at, updated_at)
WHERE status IN ('sent', 'accepted', 'declined', 'expired', 'converted')
  AND sent_at IS NULL;

-- Partial index: open sent quotes ordered by age for P1.2 selection
CREATE INDEX IF NOT EXISTS idx_quotes_sent_open
  ON quotes (user_id, sent_at)
  WHERE status = 'sent';

COMMENT ON COLUMN quotes.sent_at IS 'First time status became sent; chase schedule anchor';
COMMENT ON COLUMN quotes.last_operator_nudge_at IS 'Last operator push/email nudge (P1.2)';
COMMENT ON COLUMN quotes.operator_nudge_count IS 'Automated operator nudges sent; cap 3 in P1.2';
