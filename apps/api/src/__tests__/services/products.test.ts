/**
 * Products/Services Service Tests
 *
 * Product & service catalog used by invoicing. Covers:
 *   - createProduct: defaults (type=fixed, isGstApplicable=true), explicit values, mobile shape
 *   - getProductById: found + not-found (null)
 *   - listProducts: defaults, includeInactive, type filter, search, pagination, total
 *   - updateProduct: field mapping, no-op (re-fetch), not-found (null)
 *   - deleteProduct: soft-delete success + miss
 *
 * Each call loads the catalogue actor first. These cases are the solo user
 * (no team), which keeps the pre-team behaviour: own rows only.
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
    team_id: null,
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

function mockSolo(): void {
  mockDbQuery.mockResolvedValueOnce({
    rows: [{ team_id: null, role: null, catalogue_access: null }],
  });
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe('createProduct', () => {
  it('creates with explicit values and returns the mobile snake_case shape', async () => {
    mockSolo();
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
    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    // id, userId, teamId, name, desc, unitPrice, unitCost, unitCostIsAnnual, margin%, type, isGst
    expect(params[2]).toBeNull();
    expect(params[7]).toBe(false); // unitCostIsAnnual default
    expect(params[9]).toBe('variable'); // type
    expect(params[10]).toBe(false); // isGstApplicable explicit
  });

  it('defaults type to fixed and isGstApplicable to true', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    await createProduct('user-1', { name: 'Callout fee', unitPrice: 9500 });
    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(params[4]).toBeNull(); // description default
    expect(params[7]).toBe(false); // unitCostIsAnnual
    expect(params[9]).toBe('fixed');
    expect(params[10]).toBe(true);
  });
});

describe('getProductById', () => {
  it('returns the mobile shape when found', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await getProductById('prod-1', 'user-1');
    expect(result?.id).toBe('prod-1');
    expect(result?.user_id).toBe('user-1');
  });

  it('returns null when not found', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getProductById('missing', 'user-1');
    expect(result).toBeNull();
  });
});

describe('listProducts', () => {
  it('defaults to active-only, name order, default pagination', async () => {
    mockSolo();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });

    const { products, total } = await listProducts('user-1');
    expect(total).toBe(1);
    expect(products).toHaveLength(1);
    const countSql = mockDbQuery.mock.calls[1][0] as string;
    expect(countSql).toContain('is_active = true');
    const pageParams = mockDbQuery.mock.calls[2][1] as unknown[];
    expect(pageParams.slice(-2)).toEqual([50, 0]);
  });

  it('includes inactive, filters by type and search', async () => {
    mockSolo();
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

    const countSql = mockDbQuery.mock.calls[1][0] as string;
    expect(countSql).not.toContain('is_active = true');
    expect(countSql).toContain('type = $4');
    expect(countSql).toContain('ILIKE $5');
    const params = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(params).toContain('%labour%');
  });
});

describe('updateProduct', () => {
  it('maps camelCase keys to columns and updates', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ name: 'New name' })] });

    const result = await updateProduct('prod-1', 'user-1', {
      name: 'New name',
      unitPrice: 12000,
      isActive: false,
    });

    expect(result?.name).toBe('New name');
    const sql = mockDbQuery.mock.calls[2][0] as string;
    expect(sql).toContain('name = $1');
    expect(sql).toContain('unit_price = $2');
    expect(sql).toContain('is_active = $3');
    expect(sql).toContain('updated_at = NOW()');
  });

  it('returns the loaded row when no valid fields supplied', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await updateProduct('prod-1', 'user-1', {});
    expect(result?.id).toBe('prod-1');
    const sql = mockDbQuery.mock.calls[1][0] as string;
    expect(sql).toContain('SELECT * FROM products_services');
  });

  it('returns null when the product is not visible', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await updateProduct('missing', 'user-1', { name: 'x' });
    expect(result).toBeNull();
  });
});

describe('deleteProduct', () => {
  it('returns true when a row was soft-deleted', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteProduct('prod-1', 'user-1')).toBe(true);
  });

  it('returns false when nothing matched', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await deleteProduct('missing', 'user-1')).toBe(false);
  });

  it('treats null rowCount as false', async () => {
    mockSolo();
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    mockDbQuery.mockResolvedValueOnce({});
    expect(await deleteProduct('missing', 'user-1')).toBe(false);
  });
});
