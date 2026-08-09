-- Getting started checklist + first-login product tour (web P0)
-- Tracks whether the user finished/skipped the spotlight tour and dismissed the checklist.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS product_tour_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS getting_started_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN users.product_tour_completed_at IS
  'When the user finished or skipped the first-login product tour (NULL = not yet).';
COMMENT ON COLUMN users.getting_started_dismissed_at IS
  'When the user dismissed the dashboard Getting Started checklist (NULL = still show if incomplete).';
