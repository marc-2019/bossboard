/**
 * Supplier cost service.
 * The fake database applies user_id predicates and the partial unique indexes.
 * A query without user_id throws. Cross-account calls must 404 and leave the row.
 */

import fs from 'fs';
import path from 'path';

interface ProductRow {
  id: string;
  user_id: string;
  unit_cost: number | null;
  unit_price: number;
  default_margin_percent: number | null;
  unit_cost_is_annual: boolean;
}

interface CostRow {
  id: string;
  user_id: string;
  product_id: string;
  supplier_name: string | null;
  supplier_url: string | null;
  supplier_sku: string | null;
  gtin: string | null;
  cost_ex_gst_cents: number | null;
  currency: string;
  source_tax_flag: string | null;
  source: string;
  checked_at: string | null;
  is_preferred: boolean;
  created_at: string;
  updated_at: string;
}

const calls: { sql: string; params: unknown[] }[] = [];
let products: ProductRow[] = [];
let costs: CostRow[] = [];

function snapshot(): { products: ProductRow[]; costs: CostRow[] } {
  return JSON.parse(JSON.stringify({ products, costs })) as {
    products: ProductRow[];
    costs: CostRow[];
  };
}

function assertScoped(sql: string): void {
  if (/^\s*insert\b/i.test(sql)) {
    if (!/\buser_id\b/i.test(sql)) {
      throw new Error(`UNSCOPED_QUERY ${sql}`);
    }
    return;
  }
  if (!/user_id\s*=\s*\$\d+/i.test(sql)) {
    throw new Error(`UNSCOPED_QUERY ${sql}`);
  }
}

function userParam(sql: string, params: unknown[], which = 0): string {
  const matches = [...sql.matchAll(/user_id\s*=\s*\$(\d+)/gi)];
  return String(params[Number(matches[which][1]) - 1]);
}

function skuConflict(row: CostRow): boolean {
  if (row.supplier_sku == null || row.supplier_name == null) return false;
  return costs.some(
    (other) =>
      other.id !== row.id &&
      other.user_id === row.user_id &&
      other.supplier_name === row.supplier_name &&
      other.supplier_sku === row.supplier_sku,
  );
}

function preferredConflict(row: CostRow): boolean {
  if (!row.is_preferred) return false;
  return costs.some(
    (other) => other.id !== row.id && other.product_id === row.product_id && other.is_preferred,
  );
}

function enforceUniques(row: CostRow): void {
  if (preferredConflict(row)) {
    const error = new Error('duplicate preferred') as Error & { code: string; constraint: string };
    error.code = '23505';
    error.constraint = 'uq_product_supplier_costs_one_preferred';
    throw error;
  }
  if (skuConflict(row)) {
    const error = new Error('duplicate sku') as Error & { code: string; constraint: string };
    error.code = '23505';
    error.constraint = 'uq_product_supplier_costs_user_supplier_sku';
    throw error;
  }
}

function mockQuery(sql: string, params: unknown[] = []): { rows: unknown[]; rowCount: number } {
  calls.push({ sql, params });
  assertScoped(sql);
  const compact = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  if (compact.startsWith('select id from products_services')) {
    const [productId] = params;
    const userId = userParam(sql, params);
    const rows = products.filter((row) => row.id === productId && row.user_id === userId);
    return { rows, rowCount: rows.length };
  }

  if (
    compact.startsWith(
      'select id, unit_cost, unit_price, default_margin_percent, unit_cost_is_annual from products_services',
    )
  ) {
    const [productId] = params;
    const userId = userParam(sql, params);
    const rows = products.filter((row) => row.id === productId && row.user_id === userId);
    return { rows, rowCount: rows.length };
  }

  if (compact.startsWith('select * from product_supplier_costs where product_id')) {
    const [productId] = params;
    const userId = userParam(sql, params);
    const rows = costs
      .filter((row) => row.product_id === productId && row.user_id === userId)
      .sort((a, b) => Number(b.is_preferred) - Number(a.is_preferred));
    return { rows, rowCount: rows.length };
  }

  if (compact.startsWith('select * from product_supplier_costs where id')) {
    const [id, productId] = params;
    const userId = userParam(sql, params);
    const rows = costs.filter(
      (row) => row.id === id && row.product_id === productId && row.user_id === userId,
    );
    return { rows, rowCount: rows.length };
  }

  if (compact.startsWith('update product_supplier_costs set is_preferred = false')) {
    const [productId, , keepId] = params;
    const userId = userParam(sql, params);
    let changed = 0;
    for (const row of costs) {
      if (row.product_id === productId && row.user_id === userId && row.is_preferred) {
        if (keepId == null || row.id !== keepId) {
          row.is_preferred = false;
          changed += 1;
        }
      }
    }
    return { rows: [], rowCount: changed };
  }

  if (compact.startsWith('insert into product_supplier_costs')) {
    const row: CostRow = {
      id: String(params[0]),
      user_id: String(params[1]),
      product_id: String(params[2]),
      supplier_name: (params[3] as string | null) ?? null,
      supplier_url: (params[4] as string | null) ?? null,
      supplier_sku: (params[5] as string | null) ?? null,
      gtin: (params[6] as string | null) ?? null,
      cost_ex_gst_cents: params[7] as number,
      currency: 'NZD',
      source_tax_flag: String(params[8]),
      source: String(params[9]),
      checked_at: (params[10] as string | null) ?? null,
      is_preferred: Boolean(params[11]),
      created_at: '2026-11-19T00:00:00.000Z',
      updated_at: '2026-11-19T00:00:00.000Z',
    };
    enforceUniques(row);
    costs.push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (compact.startsWith('update product_supplier_costs set supplier_name')) {
    const supplierId = params[9];
    const productId = params[10];
    const userId = userParam(sql, params);
    const row = costs.find(
      (item) => item.id === supplierId && item.product_id === productId && item.user_id === userId,
    );
    if (!row) return { rows: [], rowCount: 0 };
    const next: CostRow = {
      ...row,
      supplier_name: params[0] as string,
      supplier_url: (params[1] as string | null) ?? null,
      supplier_sku: (params[2] as string | null) ?? null,
      gtin: (params[3] as string | null) ?? null,
      cost_ex_gst_cents: params[4] as number,
      source_tax_flag: params[5] as string,
      source: String(params[6]),
      checked_at: (params[7] as string | null) ?? null,
      is_preferred: Boolean(params[8]),
    };
    enforceUniques(next);
    Object.assign(row, next);
    return { rows: [row], rowCount: 1 };
  }

  if (compact.startsWith('update products_services set unit_cost = $1, unit_price')) {
    const [unitCost, unitPrice, productId] = params;
    const userId = userParam(sql, params);
    const row = products.find((item) => item.id === productId && item.user_id === userId);
    if (!row) return { rows: [], rowCount: 0 };
    row.unit_cost = unitCost as number;
    row.unit_price = unitPrice as number;
    return { rows: [row], rowCount: 1 };
  }

  if (compact.startsWith('update products_services set unit_cost = $1, updated_at')) {
    const [unitCost, productId] = params;
    const userId = userParam(sql, params);
    const row = products.find((item) => item.id === productId && item.user_id === userId);
    if (!row) return { rows: [], rowCount: 0 };
    row.unit_cost = unitCost as number;
    return { rows: [row], rowCount: 1 };
  }

  if (compact.startsWith('delete from product_supplier_costs')) {
    const [id, productId] = params;
    const userId = userParam(sql, params);
    const index = costs.findIndex(
      (row) => row.id === id && row.product_id === productId && row.user_id === userId,
    );
    if (index < 0) return { rows: [], rowCount: 0 };
    const [removed] = costs.splice(index, 1);
    return { rows: [{ id: removed.id }], rowCount: 1 };
  }

  throw new Error(`UNHANDLED_SQL ${compact}`);
}

async function mockTransaction<T>(
  callback: (client: { query: typeof mockQuery }) => Promise<T>,
): Promise<T> {
  const snap = snapshot();
  try {
    return await callback({ query: mockQuery });
  } catch (error) {
    products = snap.products;
    costs = snap.costs;
    throw error;
  }
}

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (sql: string, params?: unknown[]) => mockQuery(sql, params),
    transaction: (callback: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
      mockTransaction(callback),
  },
}));

import {
  createSupplierCost,
  deleteSupplierCost,
  getSupplierCost,
  listSupplierCosts,
  updateSupplierCost,
} from '../../services/product-suppliers';

const USER_A = 'user-a';
const USER_B = 'user-b';
const PRODUCT_A = 'product-a';
const PRODUCT_B = 'product-b';

function seedProduct(row: Partial<ProductRow> & Pick<ProductRow, 'id' | 'user_id'>): void {
  products.push({
    unit_cost: null,
    unit_price: 5000,
    default_margin_percent: null,
    unit_cost_is_annual: false,
    ...row,
  });
}

beforeEach(() => {
  products = [];
  costs = [];
  calls.length = 0;
});

describe('product supplier costs', () => {
  it('does not contain a supplier network client', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../services/product-suppliers.ts'),
      'utf8',
    );
    const routes = fs.readFileSync(
      path.resolve(__dirname, '../../routes/product-suppliers.ts'),
      'utf8',
    );
    for (const text of [source, routes]) {
      expect(text).not.toMatch(/\bfetch\s*\(/);
      expect(text).not.toMatch(/https?\.(request|get)\s*\(/);
      expect(text).not.toMatch(/from 'node:(http|https|net)'/);
    }
  });

  it('converts 11500 inclusive cents to 10000 once, and a re-save stays 10000', async () => {
    seedProduct({ id: PRODUCT_A, user_id: USER_A, default_margin_percent: 30, unit_price: 1 });

    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Hardware Panel',
      costCents: 11500,
      priceIncludesGst: true,
    });
    expect(created.supplier.cost_ex_gst_cents).toBe(10000);
    expect(created.supplier.source_tax_flag).toBe('inclusive');
    expect(created.supplier.currency).toBe('NZD');

    const again = await updateSupplierCost(USER_A, PRODUCT_A, created.supplier.id, {
      costCents: 11500,
      priceIncludesGst: true,
    });
    expect(again.supplier.cost_ex_gst_cents).toBe(10000);

    const renamed = await updateSupplierCost(USER_A, PRODUCT_A, created.supplier.id, {
      supplierName: 'Hardware Panel trade',
    });
    expect(renamed.supplier.cost_ex_gst_cents).toBe(10000);
    expect(renamed.supplier.source_tax_flag).toBe('inclusive');
    expect(costs[0].cost_ex_gst_cents).toBe(10000);
  });

  it('stores an exclusive cost unchanged and rejects unknown for manual entry', async () => {
    seedProduct({ id: PRODUCT_A, user_id: USER_A });
    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Ideal',
      supplierSku: 'ABC-1',
      costCents: 2500,
      sourceTaxFlag: 'exclusive',
    });
    expect(created.supplier.cost_ex_gst_cents).toBe(2500);
    expect(created.supplier.source_tax_flag).toBe('exclusive');

    await expect(
      createSupplierCost(USER_A, PRODUCT_A, {
        supplierName: 'Ideal',
        costCents: 2500,
        sourceTaxFlag: 'unknown',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      createSupplierCost(USER_A, PRODUCT_A, {
        supplierName: 'Ideal',
        supplierSku: 'USD-1',
        costCents: 2500,
        sourceTaxFlag: 'exclusive',
        currency: 'USD',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(costs).toHaveLength(1);
    expect(costs[0].cost_ex_gst_cents).toBe(2500);
  });

  it('copies a preferred cost onto the product and recomputes unit_price', async () => {
    seedProduct({
      id: PRODUCT_A,
      user_id: USER_A,
      unit_cost: 1,
      unit_price: 1,
      default_margin_percent: 30,
    });

    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Mico',
      costCents: 10000,
      priceIncludesGst: false,
      isPreferred: true,
    });

    expect(created.product).toEqual({
      id: PRODUCT_A,
      unit_cost: 10000,
      unit_price: 13000,
      default_margin_percent: 30,
    });
    expect(products[0].unit_cost).toBe(10000);
    expect(products[0].unit_price).toBe(13000);
  });

  it('divides an annual preferred cost by 12 before markup', async () => {
    seedProduct({
      id: PRODUCT_A,
      user_id: USER_A,
      unit_cost: 1,
      unit_price: 1,
      default_margin_percent: 20,
      unit_cost_is_annual: true,
    });

    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Hosting Co',
      costCents: 120000,
      sourceTaxFlag: 'exclusive',
      isPreferred: true,
    });

    expect(created.product?.unit_cost).toBe(120000);
    expect(created.product?.unit_price).toBe(12000);
    expect(products[0].unit_price).not.toBe(144000);
    expect(calls.some((call) => /unit_cost_is_annual/i.test(call.sql))).toBe(true);
  });

  it('does not strip GST a second time when a preferred inclusive cost is copied', async () => {
    seedProduct({
      id: PRODUCT_A,
      user_id: USER_A,
      default_margin_percent: 0,
      unit_price: 1,
      unit_cost_is_annual: false,
    });

    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Hardware Panel',
      costCents: 11500,
      priceIncludesGst: true,
      isPreferred: true,
    });

    expect(created.supplier.cost_ex_gst_cents).toBe(10000);
    expect(created.product?.unit_cost).toBe(10000);
    expect(created.product?.unit_price).toBe(10000);
    expect(created.product?.unit_price).not.toBe(8696);
  });

  it('rounds preferred sell prices on the half-cent and large edges', async () => {
    seedProduct({
      id: PRODUCT_A,
      user_id: USER_A,
      default_margin_percent: 50,
      unit_price: 0,
    });
    const oneCent = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'One',
      costCents: 1,
      sourceTaxFlag: 'exclusive',
      isPreferred: true,
    });
    expect(oneCent.product?.unit_cost).toBe(1);
    expect(oneCent.product?.unit_price).toBe(2);

    await updateSupplierCost(USER_A, PRODUCT_A, oneCent.supplier.id, {
      costCents: 200,
      sourceTaxFlag: 'exclusive',
      isPreferred: true,
    });
    products[0].default_margin_percent = 0.25;
    const edge = await updateSupplierCost(USER_A, PRODUCT_A, oneCent.supplier.id, {
      costCents: 200,
      sourceTaxFlag: 'exclusive',
    });
    expect(edge.product?.unit_price).toBe(201);

    const large = await updateSupplierCost(USER_A, PRODUCT_A, oneCent.supplier.id, {
      costCents: 1_000_000_000,
      sourceTaxFlag: 'exclusive',
    });
    products[0].default_margin_percent = 15;
    const largeAgain = await updateSupplierCost(USER_A, PRODUCT_A, oneCent.supplier.id, {
      costCents: 1_000_000_000,
      sourceTaxFlag: 'exclusive',
    });
    expect(large.supplier.cost_ex_gst_cents).toBe(1_000_000_000);
    expect(largeAgain.product?.unit_price).toBe(1_150_000_000);
  });

  it('keeps at most one preferred row per product', async () => {
    seedProduct({
      id: PRODUCT_A,
      user_id: USER_A,
      default_margin_percent: 0,
      unit_price: 0,
    });
    const first = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Corys',
      supplierSku: 'C-1',
      costCents: 4000,
      sourceTaxFlag: 'exclusive',
      isPreferred: true,
    });
    const second = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'J. A. Russell',
      supplierSku: 'R-9',
      costCents: 5000,
      sourceTaxFlag: 'exclusive',
      isPreferred: true,
    });

    const preferred = costs.filter((row) => row.is_preferred);
    expect(preferred).toHaveLength(1);
    expect(preferred[0].id).toBe(second.supplier.id);
    expect(first.supplier.id).not.toBe(second.supplier.id);
    expect(costs.find((row) => row.id === first.supplier.id)?.is_preferred).toBe(false);
    expect(products[0].unit_cost).toBe(5000);
    expect(products[0].unit_price).toBe(5000);
  });

  it('returns 404 for another account and does not change the row', async () => {
    seedProduct({
      id: PRODUCT_A,
      user_id: USER_A,
      unit_cost: 111,
      unit_price: 222,
      default_margin_percent: 10,
    });
    seedProduct({ id: PRODUCT_B, user_id: USER_B, unit_price: 1 });
    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'PlaceMakers',
      supplierSku: 'PM-1',
      costCents: 8800,
      priceIncludesGst: false,
      isPreferred: true,
    });
    const before = snapshot();

    await expect(listSupplierCosts(USER_B, PRODUCT_A)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getSupplierCost(USER_B, PRODUCT_A, created.supplier.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      updateSupplierCost(USER_B, PRODUCT_A, created.supplier.id, { supplierName: 'Stolen' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(deleteSupplierCost(USER_B, PRODUCT_A, created.supplier.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(snapshot()).toEqual(before);

    const visible = await listSupplierCosts(USER_A, PRODUCT_A);
    expect(visible.map((row) => row.user_id)).toEqual([USER_A]);
    const ownList = await listSupplierCosts(USER_B, PRODUCT_B);
    expect(ownList).toEqual([]);
    expect(visible.some((row) => row.user_id === USER_B)).toBe(false);
  });

  it('rejects B using A\'s supplier id on B\'s own product, and lets the owner delete', async () => {
    seedProduct({ id: PRODUCT_A, user_id: USER_A, unit_price: 1 });
    seedProduct({ id: PRODUCT_B, user_id: USER_B, unit_price: 1 });
    const created = await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Mico',
      supplierSku: 'M-1',
      costCents: 1000,
      sourceTaxFlag: 'exclusive',
    });
    const supplierId = created.supplier.id;

    await expect(getSupplierCost(USER_B, PRODUCT_B, supplierId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      updateSupplierCost(USER_B, PRODUCT_B, supplierId, { supplierName: 'Stolen' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(deleteSupplierCost(USER_B, PRODUCT_B, supplierId)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(costs.map((row) => row.id)).toEqual([supplierId]);
    expect(costs[0].user_id).toBe(USER_A);
    expect(costs[0].supplier_name).toBe('Mico');

    await deleteSupplierCost(USER_A, PRODUCT_A, supplierId);
    expect(costs).toHaveLength(0);
  });

  it('rejects a second row with the same supplier SKU for the account', async () => {
    seedProduct({ id: PRODUCT_A, user_id: USER_A });
    seedProduct({ id: PRODUCT_B, user_id: USER_A });
    await createSupplierCost(USER_A, PRODUCT_A, {
      supplierName: 'Mico',
      supplierSku: 'SAME',
      costCents: 100,
      sourceTaxFlag: 'exclusive',
    });
    await expect(
      createSupplierCost(USER_A, PRODUCT_B, {
        supplierName: 'Mico',
        supplierSku: 'SAME',
        costCents: 200,
        sourceTaxFlag: 'exclusive',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(costs).toHaveLength(1);
    expect(costs[0].cost_ex_gst_cents).toBe(100);
  });
});
