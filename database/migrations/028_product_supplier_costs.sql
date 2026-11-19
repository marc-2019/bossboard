-- =============================================================================
-- 028_product_supplier_costs.sql
-- Phase 0 slice 1 (CF bad3485f / 5a65ab36): tradie's own supplier cost rows.
--
-- Additive and idempotent. Does not change quote lines, invoice lines, or
-- products_services columns. cost_ex_gst_cents is ex-GST NZD cents entered by
-- the account, not a live supplier price.
--
-- Do not run this against a shared or hosted database until Marc gates it.
-- A rollback drops any supplier costs already entered (C6).
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_supplier_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,

    supplier_name VARCHAR(120),
    supplier_url TEXT,
    supplier_sku VARCHAR(80),
    gtin VARCHAR(14),

    cost_ex_gst_cents INTEGER CHECK (cost_ex_gst_cents >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'NZD' CHECK (currency = 'NZD'),

    source_tax_flag VARCHAR(10) CHECK (source_tax_flag IN ('inclusive', 'exclusive', 'unknown')),
    source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'file')),
    checked_at DATE,
    is_preferred BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_supplier_costs_user_product
    ON product_supplier_costs (user_id, product_id);

-- Phase 1 matches on supplier SKU. NULL SKUs are not part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_supplier_costs_user_supplier_sku
    ON product_supplier_costs (user_id, supplier_name, supplier_sku)
    WHERE supplier_sku IS NOT NULL;

-- At most one preferred supplier row per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_supplier_costs_one_preferred
    ON product_supplier_costs (product_id)
    WHERE is_preferred = true;

-- Same updated_at trigger as 001 / 003. update_updated_at() comes from init.sql.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_product_supplier_costs_updated_at'
    ) THEN
        CREATE TRIGGER update_product_supplier_costs_updated_at
            BEFORE UPDATE ON product_supplier_costs
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

COMMENT ON TABLE product_supplier_costs IS
  'Account-scoped tradie cost for a product, ex-GST NZD cents. Not a fetched supplier price.';
COMMENT ON COLUMN product_supplier_costs.cost_ex_gst_cents IS
  'Tradie-entered cost in ex-GST NZD cents. Inclusive sources are converted once before storage.';
COMMENT ON COLUMN product_supplier_costs.source_tax_flag IS
  'How the entered figure was taxed: inclusive, exclusive, or unknown.';
COMMENT ON COLUMN product_supplier_costs.is_preferred IS
  'When true, this row is copied onto products_services.unit_cost. At most one per product.';

-- Rollback (drops entered supplier costs):
-- DROP TABLE IF EXISTS product_supplier_costs;
