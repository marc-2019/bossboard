-- P1.1: operator chase bookkeeping (not client messaging)
-- See docs/QUOTE_P1_1_SENT_AT_ADDENDUM_2026-08-13.md

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_operator_nudge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operator_nudge_count INTEGER NOT NULL DEFAULT 0;

-- Do not backfill sent_at from updated_at or created_at. Those are last-write /
-- create times, not first-send. Historical past-draft rows stay NULL until a
-- real send path stamps via COALESCE(sent_at, NOW()). P1.2 must skip NULL sent_at.

-- Partial index: open sent quotes ordered by age for P1.2 selection
CREATE INDEX IF NOT EXISTS idx_quotes_sent_open
  ON quotes (user_id, sent_at)
  WHERE status = 'sent';

COMMENT ON COLUMN quotes.sent_at IS 'First time status became sent; chase schedule anchor. NULL means first-send is unknown — do not invent from updated_at.';
COMMENT ON COLUMN quotes.last_operator_nudge_at IS 'Last operator push/email nudge (P1.2)';
COMMENT ON COLUMN quotes.operator_nudge_count IS 'Automated operator nudges sent; cap 3 in P1.2';
