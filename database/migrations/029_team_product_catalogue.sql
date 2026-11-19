-- =============================================================================
-- 029_team_product_catalogue.sql
-- Team-shared product catalogue.
--
-- Decision (Marc, 19 Nov 2026): teams share one product catalogue.
--   20:14 NZDT correction: members are read-only unless an owner/admin grants edit.
--   20:15 NZDT correction: one level per member — none, view (default), or edit.
--   Owner and admin (team_members.role) always edit and are the only ones who
--   set another member's level. 'none' hides supplier cost and pricing.
--   On join, the joiner's unassigned products move onto the team.
--   On leave, products stay with the team.
--
-- Idempotent. Do not run on shared databases without Marc's go-ahead.
-- Application code treats owner/admin as edit even if this column says view.
-- =============================================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS catalogue_access VARCHAR(10) NOT NULL DEFAULT 'view';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_members_catalogue_access_check'
  ) THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_catalogue_access_check
      CHECK (catalogue_access IN ('none', 'view', 'edit'));
  END IF;
END $$;

COMMENT ON COLUMN team_members.catalogue_access IS
  'Worker catalogue level: none (no prices), view (default, read-only), or edit. Owner and admin always edit in the API.';

ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS team_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_services_team_id_fkey'
  ) THEN
    ALTER TABLE products_services
      ADD CONSTRAINT products_services_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_services_team_id
  ON products_services (team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON COLUMN products_services.team_id IS
  'Team catalogue that owns this product. NULL means a solo product visible only to user_id. ON DELETE SET NULL returns rows to the creator if the team is removed.';

-- Products whose owner currently has a primary team join that catalogue.
UPDATE products_services ps
SET team_id = u.team_id
FROM users u
WHERE ps.user_id = u.id
  AND ps.team_id IS NULL
  AND u.team_id IS NOT NULL;

-- ROLLBACK (manual, not executed):
-- DROP INDEX IF EXISTS idx_products_services_team_id;
-- ALTER TABLE products_services DROP CONSTRAINT IF EXISTS products_services_team_id_fkey;
-- ALTER TABLE products_services DROP COLUMN IF EXISTS team_id;
-- ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_catalogue_access_check;
-- ALTER TABLE team_members DROP COLUMN IF EXISTS catalogue_access;
