/**
 * Products/Services Service Tests
 *
 * Product & service catalog used by invoicing. Covers:
 *   - createProduct: defaults (type=fixed, isGstApplicable=true), explicit values, mobile shape
 *   - getProductById: found + not-found (null)
 *   - listProducts: defaults, includeInactive, type filter, search, pagination, total
 *   - updateProduct: field mapping, no-op (re-fetch), not-found (null)
 *   - deleteProduct: soft-delete success + miss
 */

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

import {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
} from '../../services/products.js';

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-1',
    user_id: 'user-1',
    name: 'Callout fee',
    description: 'Standard callout',
    unit_price: 9500,
    type: 'fixed',
    is_gst_applicable: true,
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe('createProduct', () => {
  it('creates with explicit values and returns the mobile snake_case shape', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ type: 'variable', is_gst_applicable: false })] });

    const result = await createProduct('user-1', {
      name: 'Hourly labour',
      description: 'Per hour',
      unitPrice: 8000,
      type: 'variable',
      isGstApplicable: false,
    });

    expect(result.name).toBe('Callout fee'); // from row
    expect(result.unit_price).toBe(9500);
    expect(result.is_gst_applicable).toBe(false);
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    // id, userId, name, desc, unitPrice, unitCost, unitCostIsAnnual, margin%, type, isGst
    expect(params[6]).toBe(false); // unitCostIsAnnual default
    expect(params[8]).toBe('variable'); // type
    expect(params[9]).toBe(false); // isGstApplicable explicit
  });

  it('defaults type to fixed and isGstApplicable to true', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    await createProduct('user-1', { name: 'Callout fee', unitPrice: 9500 });
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBeNull(); // description default
    expect(params[6]).toBe(false); // unitCostIsAnnual
    expect(params[8]).toBe('fixed');
    expect(params[9]).toBe(true);
  });

  it('recomputes an annual create to 12000 cents at 20% markup', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ unit_price: 12000, unit_cost: 120000 })] });
    await createProduct('user-1', {
      name: 'Hosting',
      unitPrice: 1,
      unitCost: 120000,
      unitCostIsAnnual: true,
      defaultMarginPercent: 20,
    });
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe(12000);
    expect(params[5]).toBe(120000);
    expect(params[6]).toBe(true);
    expect(params[7]).toBe(20);
  });
});

describe('getProductById', () => {
  it('returns the mobile shape when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await getProductById('prod-1', 'user-1');
    expect(result?.id).toBe('prod-1');
    expect(result?.user_id).toBe('user-1');
  });

  it('returns null when not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getProductById('missing', 'user-1');
    expect(result).toBeNull();
  });
});

describe('listProducts', () => {
  it('defaults to active-only, name order, default pagination', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });

    const { products, total } = await listProducts('user-1');
    expect(total).toBe(1);
    expect(products).toHaveLength(1);
    const countSql = mockDbQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('is_active = true');
    const pageParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(pageParams.slice(-2)).toEqual([50, 0]);
  });

  it('includes inactive, filters by type and search', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listProducts('user-1', {
      includeInactive: true,
      type: 'variable',
      search: 'labour',
      limit: 5,
      offset: 5,
    });

    const countSql = mockDbQuery.mock.calls[0][0] as string;
    expect(countSql).not.toContain('is_active = true');
    expect(countSql).toContain('type = $2');
    expect(countSql).toContain('ILIKE $3');
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('%labour%');
  });
});

describe('updateProduct', () => {
  it('maps camelCase keys to columns and updates', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ name: 'New name' })] });

    const result = await updateProduct('prod-1', 'user-1', {
      name: 'New name',
      unitPrice: 12000,
      isActive: false,
    });

    expect(result?.name).toBe('New name');
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('name = $1');
    expect(sql).toContain('unit_price = $2');
    expect(sql).toContain('is_active = $3');
    expect(sql).toContain('updated_at = NOW()');
  });

  it('re-fetches via getProductById when no valid fields supplied', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] }); // getProductById
    const result = await updateProduct('prod-1', 'user-1', {});
    expect(result?.id).toBe('prod-1');
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT * FROM products_services');
  });

  it('returns null when the update affects no rows', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await updateProduct('missing', 'user-1', { name: 'x' });
    expect(result).toBeNull();
  });

  it('recomputes unit_price when cost or margin changes and both are present', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ unit_cost: 1000, default_margin_percent: '30.00' }],
      })
      .mockResolvedValueOnce({ rows: [makeRow({ unit_cost: 2000, unit_price: 2600 })] });

    await updateProduct('prod-1', 'user-1', { unitCost: 2000, unitPrice: 9999 });

    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(params).toContain(2600);
    expect(params).not.toContain(9999);

    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ unit_cost: 10000, default_margin_percent: '10.00' }],
      })
      .mockResolvedValueOnce({ rows: [makeRow()] });
    await updateProduct('prod-1', 'user-1', { defaultMarginPercent: 10 });
    expect(mockDbQuery.mock.calls[1][1] as unknown[]).toContain(11000);
  });

  it('rounds half-up edges when recomputing the sell price', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ unit_cost: null, default_margin_percent: null }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });
    await updateProduct('prod-1', 'user-1', { unitCost: 1, defaultMarginPercent: 50 });
    expect(mockDbQuery.mock.calls[1][1] as unknown[]).toContain(2);

    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ unit_cost: 10, default_margin_percent: '5.00' }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });
    await updateProduct('prod-1', 'user-1', { unitCost: 10 });
    expect(mockDbQuery.mock.calls[1][1] as unknown[]).toContain(11);

    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ unit_cost: null, default_margin_percent: null }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });
    await updateProduct('prod-1', 'user-1', {
      unitCost: 1_000_000_000,
      defaultMarginPercent: 15,
    });
    expect(mockDbQuery.mock.calls[1][1] as unknown[]).toContain(1_150_000_000);
  });

  it('MUST-FAIL: annual web edit stores unit_price 12000, not 12× the year', async () => {
    // Web edit payload for $1,200/yr hosting at 20% markup.
    // Attributed cost is round(120000/12)=10000, then 20% → 12000 cents.
    // Pricing the full year yields 144000. That is the 12× bug.
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          unit_cost: 120000,
          default_margin_percent: '20.00',
          unit_cost_is_annual: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [makeRow({ unit_cost: 120000, unit_price: 12000, unit_cost_is_annual: true })],
      });

    await updateProduct('prod-1', 'user-1', {
      unitPrice: 12000,
      unitCost: 120000,
      unitCostIsAnnual: true,
      defaultMarginPercent: 20,
    });

    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(mockDbQuery.mock.calls[0][0] as string).toContain('unit_cost_is_annual');
    expect(params[0]).toBe(12000);
    expect(params).not.toContain(144000);
  });

  it('uses the stored annual flag when the edit does not send one', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{
          unit_cost: 120000,
          default_margin_percent: '20.00',
          unit_cost_is_annual: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [makeRow()] });

    await updateProduct('prod-1', 'user-1', { unitCost: 120000, unitPrice: 1 });

    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(params).toContain(12000);
    expect(params).not.toContain(144000);
  });

  it('does not recompute unit_price when cost or margin is absent', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ unit_price: 5000 })] });
    await updateProduct('prod-1', 'user-1', { unitPrice: 5000 });
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('unit_price = $1');
    expect(sql).not.toContain('SELECT unit_cost');

    mockDbQuery.mockReset();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ unit_cost: null, default_margin_percent: null }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });
    await updateProduct('prod-1', 'user-1', { unitCost: 4000, unitPrice: 9000 });
    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(params).toContain(4000);
    expect(params).toContain(9000);
  });
});

describe('deleteProduct', () => {
  it('returns true when a row was soft-deleted', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteProduct('prod-1', 'user-1')).toBe(true);
  });

  it('returns false when nothing matched', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteProduct('missing', 'user-1')).toBe(false);
  });

  it('treats null rowCount as false', async () => {
    mockDbQuery.mockResolvedValueOnce({});
    expect(await deleteProduct('missing', 'user-1')).toBe(false);
  });
});
