-- Product cost + default margin % for internal markup tracking.
-- Invoice line items store optional cost/marginPercent in JSON (not a new table).
-- Customer PDF/email never show cost/margin — only sell amount (line.amount).

ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS unit_cost INTEGER,
  ADD COLUMN IF NOT EXISTS default_margin_percent NUMERIC(7, 2);

COMMENT ON COLUMN products_services.unit_cost IS
  'Direct cost in cents (internal). Sell price remains unit_price.';
COMMENT ON COLUMN products_services.default_margin_percent IS
  'Default markup percent applied to unit_cost to derive unit_price when both set (e.g. 30.00 = 30%).';
