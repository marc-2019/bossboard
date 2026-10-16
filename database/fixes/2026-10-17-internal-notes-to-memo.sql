-- Data fix. NOT A MIGRATION. NOT EXECUTED.
-- database/migrations/ is the only directory the API startup runner applies.
-- This file ends in ROLLBACK, so running it does not persist writes.
-- Do not commit real customer names or production ids in this file.
--
-- What a reviewed COMMIT would do, idempotently:
--   For the supplied invoice ids owned by owner_user_id (drafts only) and the
--   supplied recurring-template ids owned by that same user, move notes that
--   look internal onto internal_memo and clear notes.
--   Customer-facing notes are left alone. A second run updates 0 rows.
--
-- Requires:
--   invoices.internal_memo          — database/migrations/025_internal_memo.sql
--   recurring_invoices.internal_memo — database/migrations/028_recurring_invoice_internal_memo.sql
--     (max 2000 characters; rows whose resulting memo is longer are counted and skipped)
--
-- "Looks internal" matches packages/shared/src/utils/invoice-notes.ts.
--
-- Supply the tenant and the row ids at runtime. No name matching.
--
--   psql "$DATABASE_URL" \
--     -v owner_user_id=00000000-0000-0000-0000-000000000000 \
--     -v invoice_ids=11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222 \
--     -v recurring_invoice_ids=33333333-3333-4333-8333-333333333333 \
--     -f database/fixes/2026-10-17-internal-notes-to-memo.sql
--
-- Pass raw UUIDs, comma-separated, no spaces required (spaces are trimmed).
-- An empty id list matches no rows. Ids that belong to another user are ignored.
-- Read the preview counts. Leave ROLLBACK in place unless those counts are the
-- rows you meant to change; only then replace the final ROLLBACK with COMMIT.

\set ON_ERROR_STOP on

\if :{?owner_user_id}
\else
\echo 'Refusing to run: set owner_user_id to the owning user uuid.'
\quit 1
\endif

\if :{?invoice_ids}
\else
\set invoice_ids ''
\endif

\if :{?recurring_invoice_ids}
\else
\set recurring_invoice_ids ''
\endif

BEGIN;

CREATE FUNCTION pg_temp.looks_internal(notes text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT notes IS NOT NULL
     AND btrim(notes) <> ''
     AND (
       notes ~* '(system[[:space:]]*test|bossboard[[:space:]]+system|review[[:space:]]+before[[:space:]]+send|do[[:space:]]+not[[:space:]]+send|draft[[:space:]]+for|deskera|internal[[:space:]]+only|for[[:space:]]+testing|test[[:space:]]+invoice|seed(ed)?[[:space:]]+(data|invoice|note)|xxx+)'
       OR notes ~ '[[:<:]]TODO[[:>:]]'
       OR notes ~ '[[:<:]]FIXME[[:>:]]'
     );
$$;

CREATE FUNCTION pg_temp.memo_after(existing text, notes text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN existing IS NULL OR btrim(existing) = '' THEN btrim(notes)
    WHEN position(btrim(notes) IN existing) > 0 THEN existing
    ELSE btrim(existing) || E'\n\n' || btrim(notes)
  END;
$$;

CREATE TEMP TABLE fix_invoice_ids ON COMMIT DROP AS
SELECT DISTINCT btrim(x)::uuid AS id
FROM unnest(string_to_array(:'invoice_ids', ',')) AS t(x)
WHERE btrim(x) <> '';

CREATE TEMP TABLE fix_recurring_ids ON COMMIT DROP AS
SELECT DISTINCT btrim(x)::uuid AS id
FROM unnest(string_to_array(:'recurring_invoice_ids', ',')) AS t(x)
WHERE btrim(x) <> '';

CREATE TEMP TABLE invoice_plan ON COMMIT DROP AS
SELECT
  i.id,
  pg_temp.memo_after(i.internal_memo, i.notes) AS memo_after
FROM invoices i
JOIN fix_invoice_ids ids ON ids.id = i.id
WHERE i.user_id = :'owner_user_id'::uuid
  AND i.status = 'draft'
  AND pg_temp.looks_internal(i.notes);

CREATE TEMP TABLE recurring_plan ON COMMIT DROP AS
SELECT
  ri.id,
  pg_temp.memo_after(ri.internal_memo, ri.notes) AS memo_after
FROM recurring_invoices ri
JOIN fix_recurring_ids ids ON ids.id = ri.id
WHERE ri.user_id = :'owner_user_id'::uuid
  AND pg_temp.looks_internal(ri.notes);

-- Preview the affected-row counts before any write.
SELECT
  (SELECT count(*) FROM fix_invoice_ids) AS supplied_invoice_ids,
  (SELECT count(*) FROM invoices i
     JOIN fix_invoice_ids ids ON ids.id = i.id
     WHERE i.user_id = :'owner_user_id'::uuid) AS owned_invoice_ids,
  (SELECT count(*) FROM invoice_plan WHERE char_length(memo_after) <= 2000) AS invoice_rows_to_update,
  (SELECT count(*) FROM invoice_plan WHERE char_length(memo_after) > 2000) AS invoice_rows_over_length,
  (SELECT count(*) FROM fix_recurring_ids) AS supplied_recurring_ids,
  (SELECT count(*) FROM recurring_invoices ri
     JOIN fix_recurring_ids ids ON ids.id = ri.id
     WHERE ri.user_id = :'owner_user_id'::uuid) AS owned_recurring_ids,
  (SELECT count(*) FROM recurring_plan WHERE char_length(memo_after) <= 2000) AS recurring_rows_to_update,
  (SELECT count(*) FROM recurring_plan WHERE char_length(memo_after) > 2000) AS recurring_rows_over_length;

SELECT id AS invoice_id_to_update
FROM invoice_plan
WHERE char_length(memo_after) <= 2000
ORDER BY id;

SELECT id AS recurring_id_to_update
FROM recurring_plan
WHERE char_length(memo_after) <= 2000
ORDER BY id;

UPDATE invoices i
SET
  internal_memo = plan.memo_after,
  notes = NULL,
  updated_at = NOW()
FROM invoice_plan plan
WHERE i.id = plan.id
  AND i.user_id = :'owner_user_id'::uuid
  AND char_length(plan.memo_after) <= 2000;

UPDATE recurring_invoices ri
SET
  internal_memo = plan.memo_after,
  notes = NULL,
  updated_at = NOW()
FROM recurring_plan plan
WHERE ri.id = plan.id
  AND ri.user_id = :'owner_user_id'::uuid
  AND char_length(plan.memo_after) <= 2000;

-- Unexecuted as stored. Replace this line with COMMIT only after the counts match the review.
ROLLBACK;
