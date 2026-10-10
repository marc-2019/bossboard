/**
 * Unit tests for recurring-invoices service — async CRUD & generation functions.
 *
 * Covers the 7 async exports that had zero test coverage:
 *   - createRecurringInvoice
 *   - getRecurringInvoiceById
 *   - listRecurringInvoices
 *   - getPendingRecurringInvoices
 *   - updateRecurringInvoice
 *   - deleteRecurringInvoice
 *   - generateInvoiceFromRecurring
 */

// ---------------------------------------------------------------------------
// Mocks (hoisted before imports)
// ---------------------------------------------------------------------------

const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: (...args: any[]) => mockDbQuery(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient: (...args: any[]) => mockGetClient(...args),
  },
}));

const mockCreateInvoice = jest.fn();

jest.mock('../../services/invoices.js', () => ({
  __esModule: true,
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createInvoice: (...args: any[]) => mockCreateInvoice(...args),
  },
}));

// Stable UUID for assertions
jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createRecurringInvoice,
  getRecurringInvoiceById,
  listRecurringInvoices,
  getPendingRecurringInvoices,
  updateRecurringInvoice,
  deleteRecurringInvoice,
  generateInvoiceFromRecurring,
} from '../../services/recurring-invoices.js';
import { MAX_INVOICE_LINE_AMOUNT_CENTS } from '../../services/invoice-integer-cap.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal DB row representing a recurring invoice */
function makeRecurringRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ri-1',
    user_id: 'user-1',
    customer_id: 'cust-1',
    name: 'Monthly Maintenance',
    recurrence: 'monthly',
    day_of_month: 15,
    is_auto_generate: true,
    include_gst: true,
    payment_terms: 20,
    notes: null,
    is_active: true,
    last_generated_at: null,
    next_generation_date: '2026-05-15',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    customer_name: 'ACME Ltd',
    customer_email: 'acme@example.com',
    customer_phone: null,
    ...overrides,
  };
}

/** Minimal DB row for a line item */
function makeLineItemRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'li-1',
    recurring_invoice_id: 'ri-1',
    product_service_id: 'ps-1',
    description: 'Oil change',
    unit_price: 100,
    quantity: 1,
    type: 'fixed',
    sort_order: 0,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    product_name: 'Standard Service',
    ...overrides,
  };
}

/** Build a mock pg client for transaction tests */
function makeClient(queryResponses: unknown[] = []) {
  const clientQuery = jest.fn();
  queryResponses.forEach((resp) => clientQuery.mockResolvedValueOnce(resp));
  // Default to empty success for any extra calls
  clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

  const release = jest.fn();
  const client = { query: clientQuery, release };
  mockGetClient.mockResolvedValue(client);
  return { client, clientQuery, release };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('getRecurringInvoiceById', () => {
  it('returns null when the recurring invoice does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // primary SELECT → not found

    const result = await getRecurringInvoiceById('missing-id', 'user-1');

    expect(result).toBeNull();
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it('returns mobile-shaped object with customer and line items when found', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRecurringRow()] })      // primary SELECT
      .mockResolvedValueOnce({ rows: [makeLineItemRow()] });       // line items SELECT

    const result = await getRecurringInvoiceById('ri-1', 'user-1') as Record<string, unknown>;

    expect(result).not.toBeNull();
    expect(result.id).toBe('ri-1');
    expect(result.name).toBe('Monthly Maintenance');
    expect(result.customer).toBeDefined();
    expect((result.customer as Record<string, unknown>).name).toBe('ACME Ltd');
    expect(Array.isArray(result.line_items)).toBe(true);
    expect((result.line_items as unknown[]).length).toBe(1);
  });

  it('returns empty line_items array when no line items exist', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRecurringRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getRecurringInvoiceById('ri-1', 'user-1') as Record<string, unknown>;
    expect((result.line_items as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('listRecurringInvoices', () => {
  it('returns paginated results with total count', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })                    // COUNT
      .mockResolvedValueOnce({ rows: [makeRecurringRow(), makeRecurringRow({ id: 'ri-2', name: 'Weekly Clean' })] }) // SELECT
      .mockResolvedValueOnce({ rows: [] });                                 // batched line items

    const { recurringInvoices, total } = await listRecurringInvoices('user-1');

    expect(total).toBe(3);
    expect(recurringInvoices.length).toBe(2);
    expect(recurringInvoices[0].id).toBe('ri-1');
    expect(recurringInvoices[1].id).toBe('ri-2');
  });

  it('returns empty array when user has no recurring invoices', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const { recurringInvoices, total } = await listRecurringInvoices('user-1');

    expect(total).toBe(0);
    expect(recurringInvoices).toEqual([]);
  });

  it('passes limit and offset to the query', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listRecurringInvoices('user-1', { limit: 10, offset: 20 });

    const selectCall = mockDbQuery.mock.calls[1];
    expect(selectCall[1]).toEqual(['user-1', 10, 20]);
  });
});

// ---------------------------------------------------------------------------

describe('getPendingRecurringInvoices', () => {
  it('splits results into autoGenerate and needsInput buckets', async () => {
    const autoRow = makeRecurringRow({ is_auto_generate: true });
    const manualRow = makeRecurringRow({ id: 'ri-2', is_auto_generate: false });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [autoRow, manualRow] })
      .mockResolvedValueOnce({ rows: [] }); // batched line items

    const { autoGenerate, needsInput } = await getPendingRecurringInvoices('user-1');

    expect(autoGenerate.length).toBe(1);
    expect(needsInput.length).toBe(1);
    expect((autoGenerate[0] as Record<string, unknown>).id).toBe('ri-1');
    expect((needsInput[0] as Record<string, unknown>).id).toBe('ri-2');
  });

  it('returns empty buckets when no pending invoices exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const { autoGenerate, needsInput } = await getPendingRecurringInvoices('user-1');

    expect(autoGenerate).toEqual([]);
    expect(needsInput).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('createRecurringInvoice', () => {
  it('commits the transaction and calls getRecurringInvoiceById for the return value', async () => {
    const { clientQuery } = makeClient([
      undefined, // BEGIN
      { rows: [makeRecurringRow()] }, // INSERT recurring_invoices
      undefined, // INSERT line_item
      undefined, // COMMIT
    ]);

    // Ownership checks, then getRecurringInvoiceById (two queries).
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cust-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1' }] })
      .mockResolvedValueOnce({ rows: [makeRecurringRow()] })
      .mockResolvedValueOnce({ rows: [makeLineItemRow()] });

    const result = await createRecurringInvoice('user-1', {
      customerId: 'cust-1',
      name: 'Monthly Maintenance',
      dayOfMonth: 15,
      lineItems: [
        { productServiceId: 'ps-1', unitPrice: 100, quantity: 1, type: 'fixed' as const },
      ],
    }) as Record<string, unknown>;

    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(result.id).toBe('ri-1');
  });

  it('rolls back the transaction on error', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cust-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1' }] });

    const { clientQuery } = makeClient([
      undefined, // BEGIN
    ]);
    clientQuery.mockRejectedValueOnce(new Error('DB insert failed')); // INSERT fails

    await expect(
      createRecurringInvoice('user-1', {
        customerId: 'cust-1',
        name: 'Bad Invoice',
        lineItems: [
          { productServiceId: 'ps-1', unitPrice: 50, quantity: 1, type: 'fixed' as const },
        ],
      })
    ).rejects.toThrow('DB insert failed');

    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('sets is_auto_generate=false when any line item is variable', async () => {
    const { clientQuery } = makeClient([
      undefined, // BEGIN
      { rows: [makeRecurringRow({ is_auto_generate: false })] }, // INSERT
      undefined, // INSERT li 1
      undefined, // INSERT li 2
      undefined, // COMMIT
    ]);

    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cust-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1' }, { id: 'ps-2' }] })
      .mockResolvedValueOnce({ rows: [makeRecurringRow({ is_auto_generate: false })] })
      .mockResolvedValueOnce({ rows: [] });

    await createRecurringInvoice('user-1', {
      customerId: 'cust-1',
      name: 'Mixed Invoice',
      lineItems: [
        { productServiceId: 'ps-1', unitPrice: 100, quantity: 1, type: 'fixed' as const },
        { productServiceId: 'ps-2', unitPrice: 0, quantity: 1, type: 'variable' as const },
      ],
    });

    // Find the INSERT into recurring_invoices call and check is_auto_generate = false
    const insertCall = clientQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO recurring_invoices')
    );
    expect(insertCall).toBeDefined();
    // is_auto_generate is param index 6 (0-based)
    expect(insertCall![1][5]).toBe(false);
  });

  it('rejects a customer the user does not own before opening a transaction', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      createRecurringInvoice('user-1', {
        customerId: 'cust-other',
        name: 'Cross tenant',
        lineItems: [
          { productServiceId: 'ps-1', unitPrice: 100, quantity: 1, type: 'fixed' as const },
        ],
      })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Customer not found' });

    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects a product the user does not own before opening a transaction', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cust-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      createRecurringInvoice('user-1', {
        customerId: 'cust-1',
        name: 'Cross tenant product',
        lineItems: [
          { productServiceId: 'ps-other', unitPrice: 100, quantity: 1, type: 'fixed' as const },
        ],
      })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Product not found' });

    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('updateRecurringInvoice', () => {
  it('returns null when the recurring invoice does not belong to the user', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // ownership check → not found

    const result = await updateRecurringInvoice('ri-missing', 'user-1', { name: 'New Name' });

    expect(result).toBeNull();
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('updates fields and returns the updated invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'ri-1' }] }); // ownership check

    const { clientQuery } = makeClient([
      undefined, // BEGIN
      undefined, // UPDATE
      undefined, // COMMIT
    ]);

    // getRecurringInvoiceById for the return value
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRecurringRow({ name: 'Renamed' })] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await updateRecurringInvoice('ri-1', 'user-1', { name: 'Renamed' }) as Record<string, unknown>;

    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(result.name).toBe('Renamed');
  });

  it('replaces line items and recomputes is_auto_generate when lineItems provided', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ri-1' }] }) // template ownership
      .mockResolvedValueOnce({ rows: [{ id: 'ps-new' }] }); // product ownership

    const { clientQuery } = makeClient([
      undefined, // BEGIN
      undefined, // DELETE old line items
      undefined, // INSERT new line item
      undefined, // UPDATE recurring_invoices
      undefined, // COMMIT
    ]);

    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRecurringRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await updateRecurringInvoice('ri-1', 'user-1', {
      lineItems: [
        { productServiceId: 'ps-new', unitPrice: 200, quantity: 2, type: 'fixed' as const },
      ],
    });

    const deleteCall = clientQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM recurring_line_items')
    );
    expect(deleteCall).toBeDefined();
  });

  it('rolls back on error', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'ri-1' }] }); // ownership check

    const { clientQuery } = makeClient([
      undefined, // BEGIN
    ]);
    clientQuery.mockRejectedValueOnce(new Error('Constraint violation'));

    await expect(
      updateRecurringInvoice('ri-1', 'user-1', { name: 'x' })
    ).rejects.toThrow('Constraint violation');

    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects another tenant product before replacing line items', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ri-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      updateRecurringInvoice('ri-1', 'user-1', {
        lineItems: [
          { productServiceId: 'ps-other', unitPrice: 200, quantity: 1, type: 'fixed' as const },
        ],
      })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Product not found' });

    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('deleteRecurringInvoice', () => {
  it('returns true when a row was deleted', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const result = await deleteRecurringInvoice('ri-1', 'user-1');

    expect(result).toBe(true);
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM recurring_invoices'),
      ['ri-1', 'user-1']
    );
  });

  it('returns false when no row matched (wrong user or already deleted)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });

    const result = await deleteRecurringInvoice('ri-missing', 'user-1');

    expect(result).toBe(false);
  });

  it('returns false when rowCount is null', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: null });

    const result = await deleteRecurringInvoice('ri-1', 'user-1');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('generateInvoiceFromRecurring', () => {
  it('throws when the recurring invoice is not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // not found

    await expect(
      generateInvoiceFromRecurring('ri-missing', 'user-1')
    ).rejects.toThrow('Recurring invoice not found');
  });

  it('calls createInvoice with correct data from fixed line items', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({ unit_price: 120, quantity: 2, type: 'fixed' });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })      // recurring invoice SELECT
      .mockResolvedValueOnce({ rows: [liRow] })       // line items SELECT
      .mockResolvedValueOnce({ rows: [] });            // UPDATE next_generation_date

    mockCreateInvoice.mockResolvedValue({ id: 'inv-new', status: 'draft' });

    const result = await generateInvoiceFromRecurring('ri-1', 'user-1') as Record<string, unknown>;

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        clientName: 'ACME Ltd',
        clientEmail: 'acme@example.com',
        customerId: 'cust-1',
        recurringInvoiceId: 'ri-1',
        includeGst: true,
        lineItems: [{ description: 'Oil change', amount: 240 }], // 120 * 2
      })
    );
    expect(result.id).toBe('inv-new');
  });

  it('uses variableAmounts override for variable line items', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({ id: 'li-var', type: 'variable', unit_price: 0, quantity: 1 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-var' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', { 'li-var': 350 });

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Oil change', amount: 350 }],
      })
    );
  });

  it('falls back to stored price for variable items when variableAmounts not provided', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({ type: 'variable', unit_price: 75, quantity: 3 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-fallback' });

    await generateInvoiceFromRecurring('ri-1', 'user-1');

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Oil change', amount: 225 }], // 75 * 3
      })
    );
  });

  it('updates next_generation_date after successful invoice creation', async () => {
    const recRow = makeRecurringRow({ day_of_month: 1 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [] })  // no line items
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    mockCreateInvoice.mockResolvedValue({ id: 'inv-updated' });

    await generateInvoiceFromRecurring('ri-1', 'user-1');

    const updateCall = mockDbQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('last_generated_at')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][1]).toBe('ri-1'); // WHERE id = recurringId
  });

  it('uses product_name as description fallback when line item description is null', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({ description: null, product_name: 'Premium Service' });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-desc' });

    await generateInvoiceFromRecurring('ri-1', 'user-1');

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Premium Service', amount: 100 }],
      })
    );
  });

  it('line-id full amount: quantity 4 override 350 is 350 and is not multiplied', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({
      id: 'li-1',
      product_service_id: 'ps-1',
      type: 'variable',
      unit_price: 80,
      quantity: 4,
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-line-id' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', { 'li-1': 350 });

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Oil change', amount: 350 }],
      })
    );
  });

  it('product-id times quantity: per-unit 100 with quantity 4 is 400', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({
      id: 'li-1',
      product_service_id: 'ps-1',
      type: 'variable',
      unit_price: 80,
      quantity: 4,
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-product-id' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', { 'ps-1': 100 });

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Oil change', amount: 400 }],
      })
    );
  });

  it('line-id wins: line-id 350 beats product-id 100 and is not multiplied by quantity 4', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({
      id: 'li-1',
      product_service_id: 'ps-1',
      type: 'variable',
      unit_price: 80,
      quantity: 4,
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-both-keys' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', { 'li-1': 350, 'ps-1': 100 });

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Oil change', amount: 350 }],
      })
    );
  });

  it('fixed ignores overrides: unit_price 120 times quantity 2 is 240 when both line id and product id are present', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({
      id: 'li-1',
      product_service_id: 'ps-1',
      type: 'fixed',
      unit_price: 120,
      quantity: 2,
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-fixed-ignores' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', { 'li-1': 350, 'ps-1': 100 });

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [{ description: 'Oil change', amount: 240 }],
      })
    );
  });

  it('shared product id: product-id 50 times quantities 2 and 3 is 100 and 150', async () => {
    const recRow = makeRecurringRow();
    const first = makeLineItemRow({
      id: 'li-a',
      product_service_id: 'ps-shared',
      description: 'Callout',
      type: 'variable',
      unit_price: 9,
      quantity: 2,
      sort_order: 0,
    });
    const second = makeLineItemRow({
      id: 'li-b',
      product_service_id: 'ps-shared',
      description: 'Labour',
      type: 'variable',
      unit_price: 9,
      quantity: 3,
      sort_order: 1,
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [first, second] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreateInvoice.mockResolvedValue({ id: 'inv-shared' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', { 'ps-shared': 50 });

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        lineItems: [
          { description: 'Callout', amount: 100 },
          { description: 'Labour', amount: 150 },
        ],
      })
    );
  });

  it('rejects a product-id amount times quantity that exceeds the integer cap', async () => {
    const recRow = makeRecurringRow();
    const liRow = makeLineItemRow({
      id: 'li-1',
      product_service_id: 'ps-1',
      type: 'variable',
      unit_price: 10,
      quantity: 2,
    });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] });

    await expect(
      generateInvoiceFromRecurring('ri-1', 'user-1', {
        'ps-1': Math.floor(MAX_INVOICE_LINE_AMOUNT_CENTS / 2) + 1,
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });
});
