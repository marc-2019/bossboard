-- Annual cost flag for products (e.g. web hosting paid yearly).
-- unit_cost stores the full annual amount when unit_cost_is_annual is true;
-- invoice P&L attributes unit_cost / 12 so months stay comparable.

ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS unit_cost_is_annual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN products_services.unit_cost_is_annual IS
  'When true, unit_cost is a full-year amount; use unit_cost/12 as cost per invoice for profit.';
