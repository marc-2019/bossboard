-- Data fix (PREVIEW + APPLY). Not a migration. The API startup runner does not execute this file.
-- Do not run APPLY against production until a human has read the preview output.
--
-- What it does, idempotently:
-- 1. Mather Consult DRAFT invoices whose customer notes look internal:
--    move that text onto invoices.internal_memo and clear invoices.notes.
-- 2. Mather and High Tide recurring templates whose customer notes look internal:
--    move that text onto recurring_invoices.internal_memo and clear recurring_invoices.notes.
--
-- Requires:
--   invoices.internal_memo          — database/migrations/025_internal_memo.sql
--   recurring_invoices.internal_memo — database/migrations/028_recurring_invoice_internal_memo.sql
--
-- "Looks internal" matches packages/shared/src/utils/invoice-notes.ts
-- (system test, review before send, Deskera, TODO/FIXME, seed notes, and the rest).
-- Customer-facing notes that do not match are left alone.
-- A second run updates 0 rows because notes is already null.

-- =============================================================================
-- PREVIEW (read-only). Run this section on its own first.
-- Shows the current row and the intended notes / internal_memo after APPLY.
-- =============================================================================

-- Mather Consult draft invoices (all drafts, so a reviewer can see notes that
-- the pattern did not match as well as rows APPLY will change).
SELECT
  i.id,
  i.invoice_number,
  i.status,
  i.client_name,
  c.name AS customer_name,
  i.notes AS notes_before,
  i.internal_memo AS internal_memo_before,
  CASE
    WHEN i.notes IS NOT NULL
     AND btrim(i.notes) <> ''
     AND (
       i.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
       OR i.notes ~ '[[:<:]]TODO[[:>:]]'
       OR i.notes ~ '[[:<:]]FIXME[[:>:]]'
     )
    THEN NULL
    ELSE i.notes
  END AS notes_after,
  CASE
    WHEN i.notes IS NOT NULL
     AND btrim(i.notes) <> ''
     AND (
       i.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
       OR i.notes ~ '[[:<:]]TODO[[:>:]]'
       OR i.notes ~ '[[:<:]]FIXME[[:>:]]'
     )
    THEN CASE
      WHEN i.internal_memo IS NULL OR btrim(i.internal_memo) = '' THEN btrim(i.notes)
      WHEN position(btrim(i.notes) IN i.internal_memo) > 0 THEN i.internal_memo
      ELSE btrim(i.internal_memo) || E'\n\n' || btrim(i.notes)
    END
    ELSE i.internal_memo
  END AS internal_memo_after
FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id
WHERE i.status = 'draft'
  AND (
    i.client_name ILIKE '%mather%'
    OR c.name ILIKE '%mather%'
  )
ORDER BY i.created_at;

-- Mather and High Tide recurring templates.
SELECT
  ri.id,
  ri.name AS template_name,
  c.name AS customer_name,
  ri.notes AS notes_before,
  ri.internal_memo AS internal_memo_before,
  CASE
    WHEN ri.notes IS NOT NULL
     AND btrim(ri.notes) <> ''
     AND (
       ri.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
       OR ri.notes ~ '[[:<:]]TODO[[:>:]]'
       OR ri.notes ~ '[[:<:]]FIXME[[:>:]]'
     )
    THEN NULL
    ELSE ri.notes
  END AS notes_after,
  CASE
    WHEN ri.notes IS NOT NULL
     AND btrim(ri.notes) <> ''
     AND (
       ri.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
       OR ri.notes ~ '[[:<:]]TODO[[:>:]]'
       OR ri.notes ~ '[[:<:]]FIXME[[:>:]]'
     )
    THEN CASE
      WHEN ri.internal_memo IS NULL OR btrim(ri.internal_memo) = '' THEN btrim(ri.notes)
      WHEN position(btrim(ri.notes) IN ri.internal_memo) > 0 THEN ri.internal_memo
      ELSE btrim(ri.internal_memo) || E'\n\n' || btrim(ri.notes)
    END
    ELSE ri.internal_memo
  END AS internal_memo_after
FROM recurring_invoices ri
JOIN customers c ON c.id = ri.customer_id
WHERE c.name ILIKE '%mather%'
   OR c.name ILIKE '%high tide%'
   OR c.name ILIKE '%hightide%'
   OR ri.name ILIKE '%mather%'
   OR ri.name ILIKE '%high tide%'
   OR ri.name ILIKE '%hightide%'
ORDER BY c.name, ri.name;

-- =============================================================================
-- APPLY. Idempotent. Stop here if you only wanted the preview.
-- Review the SELECT output above before running this transaction.
-- =============================================================================

BEGIN;

UPDATE invoices i
SET
  internal_memo = CASE
    WHEN i.internal_memo IS NULL OR btrim(i.internal_memo) = '' THEN btrim(i.notes)
    WHEN position(btrim(i.notes) IN i.internal_memo) > 0 THEN i.internal_memo
    ELSE btrim(i.internal_memo) || E'\n\n' || btrim(i.notes)
  END,
  notes = NULL,
  updated_at = NOW()
FROM customers c
WHERE i.customer_id = c.id
  AND i.status = 'draft'
  AND (
    i.client_name ILIKE '%mather%'
    OR c.name ILIKE '%mather%'
  )
  AND i.notes IS NOT NULL
  AND btrim(i.notes) <> ''
  AND (
    i.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
    OR i.notes ~ '[[:<:]]TODO[[:>:]]'
    OR i.notes ~ '[[:<:]]FIXME[[:>:]]'
  );

-- Drafts with no customer_id still match on client_name. The join above
-- misses those because customer_id IS NULL. Cover them explicitly.
UPDATE invoices i
SET
  internal_memo = CASE
    WHEN i.internal_memo IS NULL OR btrim(i.internal_memo) = '' THEN btrim(i.notes)
    WHEN position(btrim(i.notes) IN i.internal_memo) > 0 THEN i.internal_memo
    ELSE btrim(i.internal_memo) || E'\n\n' || btrim(i.notes)
  END,
  notes = NULL,
  updated_at = NOW()
WHERE i.customer_id IS NULL
  AND i.status = 'draft'
  AND i.client_name ILIKE '%mather%'
  AND i.notes IS NOT NULL
  AND btrim(i.notes) <> ''
  AND (
    i.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
    OR i.notes ~ '[[:<:]]TODO[[:>:]]'
    OR i.notes ~ '[[:<:]]FIXME[[:>:]]'
  );

UPDATE recurring_invoices ri
SET
  internal_memo = CASE
    WHEN ri.internal_memo IS NULL OR btrim(ri.internal_memo) = '' THEN btrim(ri.notes)
    WHEN position(btrim(ri.notes) IN ri.internal_memo) > 0 THEN ri.internal_memo
    ELSE btrim(ri.internal_memo) || E'\n\n' || btrim(ri.notes)
  END,
  notes = NULL,
  updated_at = NOW()
FROM customers c
WHERE c.id = ri.customer_id
  AND (
    c.name ILIKE '%mather%'
    OR c.name ILIKE '%high tide%'
    OR c.name ILIKE '%hightide%'
    OR ri.name ILIKE '%mather%'
    OR ri.name ILIKE '%high tide%'
    OR ri.name ILIKE '%hightide%'
  )
  AND ri.notes IS NOT NULL
  AND btrim(ri.notes) <> ''
  AND (
    ri.notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
    OR ri.notes ~ '[[:<:]]TODO[[:>:]]'
    OR ri.notes ~ '[[:<:]]FIXME[[:>:]]'
  );

COMMIT;
