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
const mockGetInvoiceByIdRaw = jest.fn();

jest.mock('../../services/invoices.js', () => ({
  __esModule: true,
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createInvoice: (...args: any[]) => mockCreateInvoice(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getInvoiceByIdRaw: (...args: any[]) => mockGetInvoiceByIdRaw(...args),
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
  mockDbQuery.mockReset();
  mockGetClient.mockReset();
  mockCreateInvoice.mockReset();
  mockGetInvoiceByIdRaw.mockReset();
  mockGetClient.mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  });
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
      .mockResolvedValueOnce({ rows: [makeRecurringRow(), makeRecurringRow({ id: 'ri-2', name: 'Weekly Clean' })] }); // SELECT

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

    mockDbQuery.mockResolvedValueOnce({ rows: [autoRow, manualRow] });

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

    // getRecurringInvoiceById calls db.query (not the client) twice
    mockDbQuery
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
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'ri-1' }] }); // ownership check

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

  it('bills the Auckland civil date, not the UTC day shifted by toISOString', async () => {
    // 2026-04-04T11:30:00Z is 2026-04-05 00:30 NZDT, before DST ends at 03:00.
    // payment terms 20 → due 2026-04-25. Period is the Auckland month 2026-04.
    // A UTC clock or toISOString() of that early-morning instant yields 2026-04-24.
    const recRow = makeRecurringRow({ payment_terms: 20, day_of_month: 5 });
    const liRow = makeLineItemRow({ unit_price: 100, quantity: 1, type: 'fixed' });
    const now = new Date('2026-04-04T11:30:00.000Z');

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockCreateInvoice.mockResolvedValue({ id: 'inv-nz' });

    await generateInvoiceFromRecurring('ri-1', 'user-1', undefined, now);

    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        dueDate: '2026-04-25',
        recurringPeriod: '2026-04',
        recurringInvoiceId: 'ri-1',
      })
    );
  });

  it('returns the existing invoice for the same template and period', async () => {
    const recRow = makeRecurringRow({ payment_terms: 20, day_of_month: 1 });
    const liRow = makeLineItemRow();
    const now = new Date('2026-03-31T12:00:00.000Z'); // 2026-04-01 01:00 NZDT

    mockDbQuery
      .mockResolvedValueOnce({ rows: [recRow] })
      .mockResolvedValueOnce({ rows: [liRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-existing' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockGetInvoiceByIdRaw.mockResolvedValue({ id: 'inv-existing', dueDate: '2026-04-21' });

    const result = await generateInvoiceFromRecurring('ri-1', 'user-1', { 'li-1': 999 }, now) as Record<string, unknown>;

    expect(mockCreateInvoice).not.toHaveBeenCalled();
    expect(mockGetInvoiceByIdRaw).toHaveBeenCalledWith('inv-existing', 'user-1');
    expect(result.id).toBe('inv-existing');
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
});
