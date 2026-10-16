/**
 * Batched recurring line items (list + pending) and the
 * recurring / recurringInvoice response alias.
 *
 * Service functions under test are the real module. Route cases spy the
 * default service object so the same file can mount the router without
 * jest.mock-ing the recurring-invoices module.
 */

const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();

jest.mock('../../src/services/database.js', () => ({
  __esModule: true,
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: (...args: any[]) => mockDbQuery(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient: (...args: any[]) => mockGetClient(...args),
  },
}));

const mockCreateInvoice = jest.fn();

jest.mock('../../src/services/invoices.js', () => ({
  __esModule: true,
  default: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createInvoice: (...args: any[]) => mockCreateInvoice(...args),
  },
}));

jest.mock('../../src/middleware/auth.js', () => ({
  authenticate: function (req: { user?: { userId: string; email: string } }, _res: unknown, next: () => void) {
    req.user = { userId: 'user-001', email: 'tradie@example.com' };
    next();
  },
}));

import request from 'supertest';
import express, { Express } from 'express';
import recurringInvoicesService, {
  listRecurringInvoices,
  getPendingRecurringInvoices,
} from '../../src/services/recurring-invoices.js';
import recurringInvoiceRoutes from '../../src/routes/recurring-invoices.js';
import { errorHandler } from '../../src/middleware/error.js';

const USER_ID = 'user-001';

const LINE_ITEM_KEYS = [
  'id',
  'recurring_invoice_id',
  'product_service_id',
  'description',
  'unit_price',
  'quantity',
  'type',
  'sort_order',
  'product_name',
];

function makeRecurringRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ri-1',
    user_id: USER_ID,
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

function mobileLineItem(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    recurring_invoice_id: row.recurring_invoice_id,
    product_service_id: row.product_service_id,
    description: row.description,
    unit_price: row.unit_price,
    quantity: row.quantity,
    type: row.type,
    sort_order: row.sort_order,
    product_name: row.product_name,
  };
}

function expectExactLineItems(actual: unknown, rows: Record<string, unknown>[]): void {
  expect(Array.isArray(actual)).toBe(true);
  const items = actual as Record<string, unknown>[];
  expect(items).toEqual(rows.map(mobileLineItem));
  for (const item of items) {
    expect(Object.keys(item).sort()).toEqual([...LINE_ITEM_KEYS].sort());
  }
}

function lineItemCalls(): jest.Mock['mock']['calls'] {
  return mockDbQuery.mock.calls.filter((call) => String(call[0]).includes('recurring_line_items'));
}

function expectSingleBatchedAnyQuery(templateIds: string[], userId: string): void {
  const calls = lineItemCalls();
  expect(calls).toHaveLength(1);
  const sql = String(calls[0][0]);
  const params = calls[0][1] as unknown[];
  expect(sql).toContain('recurring_line_items');
  expect(sql).toContain('ANY($1::uuid[])');
  expect(sql).toContain('ri.user_id = $2');
  expect(sql).toContain('ORDER BY rli.sort_order ASC');
  expect(params).toEqual([templateIds, userId]);

  for (const call of mockDbQuery.mock.calls) {
    const callParams = call[1] as unknown[] | undefined;
    if (!Array.isArray(callParams)) continue;
    for (const id of templateIds) {
      expect(callParams).not.toEqual([id]);
      expect(callParams).not.toEqual([id, userId]);
      expect(callParams).not.toEqual([userId, id]);
    }
  }
}

function expectNoLineItemQuery(): void {
  for (const call of mockDbQuery.mock.calls) {
    expect(String(call[0])).not.toContain('recurring_line_items');
    expect(String(call[0])).not.toContain('ANY($1::uuid[])');
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
  mockDbQuery.mockReset();
});

describe('listRecurringInvoices line items', () => {
  const ri1 = makeRecurringRow({ customer_name: 'ACME Ltd' });
  const ri2 = makeRecurringRow({
    id: 'ri-2',
    name: 'Weekly Clean',
    customer_name: 'Beta Plumbing',
  });

  const liRi1Sort1 = makeLineItemRow({
    id: 'li-1-sort1',
    recurring_invoice_id: 'ri-1',
    product_service_id: 'ps-filter',
    description: 'Filter',
    unit_price: 200,
    quantity: 2,
    type: 'fixed',
    sort_order: 1,
    product_name: 'Filter Kit',
  });
  const liRi1Sort0 = makeLineItemRow({
    id: 'li-1-sort0',
    recurring_invoice_id: 'ri-1',
    product_service_id: 'ps-oil',
    description: 'Oil change',
    unit_price: 100,
    quantity: 1,
    type: 'fixed',
    sort_order: 0,
    product_name: 'Standard Service',
  });
  const liRi2 = makeLineItemRow({
    id: 'li-2',
    recurring_invoice_id: 'ri-2',
    product_service_id: 'ps-mow',
    description: 'Lawn mow',
    unit_price: 50,
    quantity: 3,
    type: 'variable',
    sort_order: 0,
    product_name: 'Mow',
  });

  it('returns a line_items array on each grouped template using a single batched ANY query', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [ri1, ri2] })
      // sort_order 1 before 0 so the service must sort each group itself
      .mockResolvedValueOnce({ rows: [liRi1Sort1, liRi1Sort0, liRi2] });

    const { recurringInvoices, total } = await listRecurringInvoices(USER_ID);

    expect(total).toBe(2);
    expect(mockDbQuery).toHaveBeenCalledTimes(3);
    expect(String(mockDbQuery.mock.calls[0][0])).toContain('COUNT');
    expect(String(mockDbQuery.mock.calls[0][0])).toContain('user_id = $1');
    expect(mockDbQuery.mock.calls[0][1]).toEqual([USER_ID]);
    expect(String(mockDbQuery.mock.calls[1][0])).not.toContain('recurring_line_items');
    expectSingleBatchedAnyQuery(['ri-1', 'ri-2'], USER_ID);

    expect(recurringInvoices.map((row) => row.id)).toEqual(['ri-1', 'ri-2']);
    expect(recurringInvoices[0].customer_name).toBe('ACME Ltd');
    expect(recurringInvoices[1].customer_name).toBe('Beta Plumbing');
    expectExactLineItems(recurringInvoices[0].line_items, [liRi1Sort0, liRi1Sort1]);
    expectExactLineItems(recurringInvoices[1].line_items, [liRi2]);

    const onFirst = (recurringInvoices[0].line_items as Array<{ id: string; recurring_invoice_id: string }>)
      .map((line) => line.id);
    const onSecond = (recurringInvoices[1].line_items as Array<{ id: string }>).map((line) => line.id);
    expect(onFirst).toEqual(['li-1-sort0', 'li-1-sort1']);
    expect(onFirst).not.toContain('li-2');
    expect(onSecond).toEqual(['li-2']);
    expect(onSecond).not.toContain('li-1-sort0');
    expect(
      (recurringInvoices[0].line_items as Array<{ recurring_invoice_id: string }>).every(
        (line) => line.recurring_invoice_id === 'ri-1'
      )
    ).toBe(true);
    expect(
      (recurringInvoices[1].line_items as Array<{ recurring_invoice_id: string }>).every(
        (line) => line.recurring_invoice_id === 'ri-2'
      )
    ).toBe(true);
  });

  it('returns empty line_items when templates exist but the batch returns no rows', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [ri1, ri2] })
      .mockResolvedValueOnce({ rows: [] });

    const { recurringInvoices, total } = await listRecurringInvoices(USER_ID);

    expect(total).toBe(2);
    expect(mockDbQuery).toHaveBeenCalledTimes(3);
    expectSingleBatchedAnyQuery(['ri-1', 'ri-2'], USER_ID);
    expect(recurringInvoices[0].line_items).toEqual([]);
    expect(recurringInvoices[1].line_items).toEqual([]);
    expect(Array.isArray(recurringInvoices[0].line_items)).toBe(true);
    expect(Array.isArray(recurringInvoices[1].line_items)).toBe(true);
    expect(recurringInvoices[0].customer_name).toBe('ACME Ltd');
    expect(recurringInvoices[1].customer_name).toBe('Beta Plumbing');
  });

  it('does not query recurring_line_items when the template select returns no rows', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const { recurringInvoices, total } = await listRecurringInvoices(USER_ID);

    expect(total).toBe(0);
    expect(recurringInvoices).toEqual([]);
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    expect(String(mockDbQuery.mock.calls[0][0])).toContain('user_id = $1');
    expect(mockDbQuery.mock.calls[0][1]).toEqual([USER_ID]);
    expectNoLineItemQuery();
  });
});

describe('getPendingRecurringInvoices line items', () => {
  const autoRow = makeRecurringRow({
    id: 'ri-1',
    is_auto_generate: true,
    customer_name: 'ACME Ltd',
  });
  const manualRow = makeRecurringRow({
    id: 'ri-2',
    name: 'Weekly Clean',
    is_auto_generate: false,
    customer_name: 'Beta Plumbing',
  });

  const liAutoSort1 = makeLineItemRow({
    id: 'li-auto-1',
    recurring_invoice_id: 'ri-1',
    product_service_id: 'ps-filter',
    description: 'Filter',
    unit_price: 200,
    quantity: 2,
    type: 'fixed',
    sort_order: 1,
    product_name: 'Filter Kit',
  });
  const liAutoSort0 = makeLineItemRow({
    id: 'li-auto-0',
    recurring_invoice_id: 'ri-1',
    product_service_id: 'ps-oil',
    description: 'Oil change',
    unit_price: 100,
    quantity: 1,
    type: 'fixed',
    sort_order: 0,
    product_name: 'Standard Service',
  });
  const liManual = makeLineItemRow({
    id: 'li-manual',
    recurring_invoice_id: 'ri-2',
    product_service_id: 'ps-mow',
    description: 'Lawn mow',
    unit_price: 50,
    quantity: 3,
    type: 'variable',
    sort_order: 0,
    product_name: 'Mow',
  });

  it('groups a line_items array onto each pending grouped template using a single batched ANY query', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [autoRow, manualRow] })
      .mockResolvedValueOnce({ rows: [liAutoSort1, liAutoSort0, liManual] });

    const { autoGenerate, needsInput } = await getPendingRecurringInvoices(USER_ID);

    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    expect(String(mockDbQuery.mock.calls[0][0])).not.toContain('recurring_line_items');
    expectSingleBatchedAnyQuery(['ri-1', 'ri-2'], USER_ID);

    expect(autoGenerate).toHaveLength(1);
    expect(needsInput).toHaveLength(1);
    expect(autoGenerate[0].id).toBe('ri-1');
    expect(needsInput[0].id).toBe('ri-2');
    expect(autoGenerate[0].customer_name).toBe('ACME Ltd');
    expect(needsInput[0].customer_name).toBe('Beta Plumbing');
    expectExactLineItems(autoGenerate[0].line_items, [liAutoSort0, liAutoSort1]);
    expectExactLineItems(needsInput[0].line_items, [liManual]);
    expect(
      (autoGenerate[0].line_items as Array<{ recurring_invoice_id: string }>).every(
        (line) => line.recurring_invoice_id === 'ri-1'
      )
    ).toBe(true);
    expect(
      (needsInput[0].line_items as Array<{ id: string; recurring_invoice_id: string }>).every(
        (line) => line.recurring_invoice_id === 'ri-2'
      )
    ).toBe(true);
    expect(
      (autoGenerate[0].line_items as Array<{ id: string }>).map((line) => line.id)
    ).not.toContain('li-manual');
    expect(
      (needsInput[0].line_items as Array<{ id: string }>).map((line) => line.id)
    ).not.toContain('li-auto-0');
  });

  it('returns empty autoGenerate and needsInput when no pending rows exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getPendingRecurringInvoices(USER_ID);

    expect(result).toEqual({ autoGenerate: [], needsInput: [] });
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expectNoLineItemQuery();
  });
});

describe('recurring invoice route recurring and recurringInvoice keys', () => {
  let app: Express;

  const validBody = {
    customerId: 'f1e2d3c4-b5a6-7890-fedc-ba9876543210',
    name: 'Monthly Maintenance',
    lineItems: [
      {
        productServiceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        description: 'Monthly electrical maintenance',
        unitPrice: 15000,
        quantity: 1,
        type: 'fixed' as const,
      },
    ],
  };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/recurring-invoices', recurringInvoiceRoutes);
    app.use(errorHandler);
  });

  it('POST returns both recurring and recurringInvoice keys', async () => {
    const created = { id: 'ri-1', name: 'Monthly Maintenance' };
    const createSpy = jest
      .spyOn(recurringInvoicesService, 'createRecurringInvoice')
      .mockResolvedValue(created);

    const response = await request(app).post('/api/v1/recurring-invoices').send(validBody);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Recurring invoice created successfully');
    expect(response.body.data.recurring).toEqual(response.body.data.recurringInvoice);
    expect(response.body.data.recurring).toEqual(created);
    expect(response.body.data.recurringInvoice).toEqual(created);
    expect(createSpy).toHaveBeenCalledWith(USER_ID, validBody);
  });

  it('GET returns both recurring and recurringInvoice keys', async () => {
    const found = { id: 'ri-1', name: 'Monthly Maintenance', line_items: [] as unknown[] };
    const getSpy = jest
      .spyOn(recurringInvoicesService, 'getRecurringInvoiceById')
      .mockResolvedValue(found);

    const response = await request(app).get('/api/v1/recurring-invoices/ri-1');

    expect(response.status).toBe(200);
    expect(response.body.data.recurring).toEqual(response.body.data.recurringInvoice);
    expect(response.body.data.recurring).toEqual(found);
    expect(response.body.data.recurringInvoice).toEqual(found);
    expect(getSpy).toHaveBeenCalledWith('ri-1', USER_ID);
  });

  it('PUT returns both recurring and recurringInvoice keys', async () => {
    const updated = { id: 'ri-1', name: 'Updated Name' };
    const updateSpy = jest
      .spyOn(recurringInvoicesService, 'updateRecurringInvoice')
      .mockResolvedValue(updated);

    const response = await request(app)
      .put('/api/v1/recurring-invoices/ri-1')
      .send({ name: 'Updated Name' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Recurring invoice updated successfully');
    expect(response.body.data.recurring).toEqual(response.body.data.recurringInvoice);
    expect(response.body.data.recurring).toEqual(updated);
    expect(response.body.data.recurringInvoice).toEqual(updated);
    expect(updateSpy).toHaveBeenCalledWith('ri-1', USER_ID, { name: 'Updated Name' });
  });
});
