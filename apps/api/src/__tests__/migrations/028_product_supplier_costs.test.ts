/**
 * Schema proof for migration 028. Reads the SQL file. Does not connect anywhere.
 */

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve(
  __dirname,
  '../../../../../database/migrations/028_product_supplier_costs.sql',
);
const migrationsDir = path.dirname(migrationPath);
const sql = fs.readFileSync(migrationPath, 'utf8');
const executable = sql.replace(/--.*$/gm, '');

describe('migration 028_product_supplier_costs', () => {
  it('is the next file after 027 and is the only 028', () => {
    const names = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
    expect(names).toContain('027_quote_chase.sql');
    expect(names).toContain('028_product_supplier_costs.sql');
    expect(names.filter((name) => name.startsWith('028'))).toEqual([
      '028_product_supplier_costs.sql',
    ]);
  });

  it('creates an additive, idempotent, user-scoped table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS product_supplier_costs/i);
    expect(sql).toMatch(/user_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(
      /product_id UUID NOT NULL REFERENCES products_services\(id\) ON DELETE CASCADE/i,
    );
    expect(sql).toMatch(/cost_ex_gst_cents INTEGER CHECK \(cost_ex_gst_cents >= 0\)/i);
    expect(sql).toMatch(/currency CHAR\(3\) NOT NULL DEFAULT 'NZD' CHECK \(currency = 'NZD'\)/i);
    expect(sql).toMatch(/'inclusive', 'exclusive', 'unknown'/);
    expect(sql).toMatch(/'manual', 'file'/);
    expect(sql).toMatch(/is_preferred BOOLEAN NOT NULL DEFAULT false/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_product_supplier_costs_user_product/i);
    expect(sql).toMatch(/\(user_id, product_id\)/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_product_supplier_costs_user_supplier_sku/i,
    );
    expect(sql).toMatch(/\(user_id, supplier_name, supplier_sku\)/);
    expect(sql).toMatch(/WHERE supplier_sku IS NOT NULL/i);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_product_supplier_costs_one_preferred/i,
    );
    expect(sql).toMatch(/\(product_id\)\s*\n\s*WHERE is_preferred = true/i);
    expect(sql).toMatch(/EXECUTE FUNCTION update_updated_at\(\)/i);
    expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_trigger/i);
  });

  it('keeps the rollback commented so migrate.sh does not drop the table', () => {
    expect(sql).toMatch(/-- DROP TABLE IF EXISTS product_supplier_costs;/);
    expect(executable).not.toMatch(/DROP\s+TABLE/i);
  });
});
