/**
 * Recurring invoices API contract (mobile + web consumers).
 *
 * Pins the HTTP JSON the installed clients read. DB and auth are mocked.
 * The real recurring-invoices router and service produce the body.
 * Create and update are not service-mocked: each opens one transaction
 * (BEGIN / write / COMMIT) and then getRecurringInvoiceById (two queries).
 * That sequence is fixed, so the wire shape still comes from the real formatter.
 *
 * Mobile (snake_case, no camelize):
 * - apps/mobile/app/recurring/index.tsx:61 data.recurringInvoices
 * - apps/mobile/app/recurring/index.tsx:67-68 data.autoGenerate / data.needsInput
 * - apps/mobile/app/recurring/index.tsx:98 items.reduce(unit_price * quantity)
 * - apps/mobile/app/recurring/index.tsx:102 items.some(type === 'variable')
 * - apps/mobile/app/recurring/index.tsx:154 calculateTotal(item.line_items)
 * - apps/mobile/app/recurring/index.tsx:155 hasVariableItems(item.line_items)
 * - apps/mobile/app/recurring/index.tsx:205 item.line_items.length
 * - apps/mobile/app/recurring/[id].tsx:63 data.recurringInvoice
 * - apps/mobile/app/recurring/generate.tsx:75 data.recurringInvoice
 * - apps/mobile/app/recurring/create.tsx:98 data.recurringInvoice
 * - apps/mobile/app/recurring/create.tsx:248 data.recurringInvoice?.id
 * - apps/mobile/app/recurring/[id].tsx:327 `recurring.customer_name.charAt(0)`
 * - apps/mobile/app/recurring/[id].tsx:331 `recurring.customer_name` text
 * - apps/mobile/app/recurring/generate.tsx:239 `recurring.customer_name`
 * - apps/mobile/app/recurring/generate.tsx:132-140 preview total = entered cents * quantity
 * - apps/mobile/app/recurring/generate.tsx:168-171 map keyed by productServiceId
 * - apps/mobile/src/services/api.ts:749-750 body `{ variableAmounts }`
 *
 * Web camelizes the same JSON (line_items → lineItems, unit_price → unitPrice)
 * in apps/web/src/lib/api-client.ts before the pages read it:
 * - apps/web/src/lib/api-client.ts:332-336 list → recurringInvoices
 * - apps/web/src/lib/api-client.ts:338-343 pending → autoGenerate / needsInput
 * - apps/web/src/lib/api-client.ts:360 create → recurringInvoice
 * - apps/web/src/app/(dashboard)/recurring/page.tsx:28 recurringInvoices
 * - apps/web/src/app/(dashboard)/recurring/page.tsx:30-31 autoGenerate / needsInput
 * - apps/web/src/app/(dashboard)/recurring/page.tsx:137-141 lineItems unitPrice * quantity
 * - apps/web/e2e/demos/api/invoices.api.spec.ts:325-326 data.recurringInvoice?.id ?? data.recurring?.id
 * - apps/web/src/app/(dashboard)/invoices/[id]/page.tsx:143 data.recurring
 *   (from-invoice only; that route is outside this contract)
 */

const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();

jest.mock('../../src/services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    getClient: (...args: unknown[]) => mockGetClient(...args),
  },
}));

jest.mock('../../src/services/invoices.js', () => ({
  __esModule: true,
  default: {
    createInvoice: jest.fn(),
  },
}));

jest.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req: { user?: { userId: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { userId: 'user-001', email: 'tradie@example.com' };
    next();
  },
}));

import request from 'supertest';
import express, { Express } from 'express';
import recurringInvoiceRoutes from '../../src/routes/recurring-invoices.js';
import invoicesService from '../../src/services/invoices.js';
import { errorHandler } from '../../src/middleware/error.js';

const mockCreateInvoice = invoicesService.createInvoice as unknown as jest.Mock;

const USER_ID = 'user-001';

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
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
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
    quantity: 2,
    type: 'fixed',
    sort_order: 0,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    product_name: 'Standard Service',
    ...overrides,
  };
}

function installClient(): void {
  const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  mockGetClient.mockResolvedValue({ query: clientQuery, release: jest.fn() });
}

function expectMobileLineItem(actual: unknown, expected: Record<string, unknown>): void {
  expect(actual).toEqual(expect.objectContaining({
    id: expected.id,
    description: expected.description,
    unit_price: expected.unit_price,
    quantity: expected.quantity,
    type: expected.type,
    sort_order: expected.sort_order,
    product_name: expected.product_name,
  }));
}

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/recurring-invoices', recurringInvoiceRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  // Once-queues survive clearAllMocks. Each it queues after this reset.
  mockDbQuery.mockReset();
  installClient();
});

describe('recurring invoices API contract (mobile + web consumers)', () => {
  const withLines = makeRecurringRow({
    id: 'ri-1',
    name: 'Monthly Maintenance',
    customer_name: 'ACME Ltd',
    is_auto_generate: true,
  });
  const emptyLines = makeRecurringRow({
    id: 'ri-2',
    name: 'Weekly Clean',
    customer_name: 'Beta Plumbing',
    is_auto_generate: false,
  });
  const line = makeLineItemRow({
    id: 'li-1',
    recurring_invoice_id: 'ri-1',
    description: 'Oil change',
    unit_price: 100,
    quantity: 2,
    type: 'fixed',
    sort_order: 0,
    product_name: 'Standard Service',
  });

  describe('GET /api/v1/recurring-invoices', () => {
    it('returns line_items arrays for a template with items and for an empty template', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [withLines, emptyLines] })
        .mockResolvedValueOnce({ rows: [line] });

      const response = await request(app).get('/api/v1/recurring-invoices');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const items = response.body.data.recurringInvoices as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);

      const filled = items[0];
      const vacant = items[1];
      expect(Array.isArray(filled.line_items)).toBe(true);
      expect(filled.line_items).toHaveLength(1);
      expectMobileLineItem((filled.line_items as unknown[])[0], line);
      expect(filled.customer_name).toBe('ACME Ltd');

      expect(Array.isArray(vacant.line_items)).toBe(true);
      expect(vacant.line_items).toEqual([]);
      expect(vacant.customer_name).toBe('Beta Plumbing');
    });
  });

  describe('GET /api/v1/recurring-invoices/pending', () => {
    it('returns line_items arrays on autoGenerate and needsInput, including empty', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [withLines, emptyLines] })
        .mockResolvedValueOnce({ rows: [line] });

      const response = await request(app).get('/api/v1/recurring-invoices/pending');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const { autoGenerate, needsInput } = response.body.data as {
        autoGenerate: Array<Record<string, unknown>>;
        needsInput: Array<Record<string, unknown>>;
      };

      expect(autoGenerate).toHaveLength(1);
      expect(needsInput).toHaveLength(1);
      expect(Array.isArray(autoGenerate[0].line_items)).toBe(true);
      expect(autoGenerate[0].line_items).toHaveLength(1);
      expectMobileLineItem((autoGenerate[0].line_items as unknown[])[0], line);
      expect(autoGenerate[0].customer_name).toBe('ACME Ltd');
      expect(Array.isArray(needsInput[0].line_items)).toBe(true);
      expect(needsInput[0].line_items).toEqual([]);
      expect(needsInput[0].customer_name).toBe('Beta Plumbing');
    });
  });

  describe('POST / GET /:id / PUT /:id', () => {
    const validBody = {
      customerId: 'f1e2d3c4-b5a6-7890-fedc-ba9876543210',
      name: 'Monthly Maintenance',
      lineItems: [
        {
          productServiceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          description: 'Oil change',
          unitPrice: 100,
          quantity: 2,
          type: 'fixed' as const,
        },
      ],
    };

    function expectBothKeysWithLineItems(
      body: { data: { recurring: Record<string, unknown>; recurringInvoice: Record<string, unknown> } },
      lineCount: number,
      customerName: string,
    ): void {
      expect(body.data.recurring).toEqual(body.data.recurringInvoice);
      expect(Array.isArray(body.data.recurring.line_items)).toBe(true);
      expect(body.data.recurring.line_items).toHaveLength(lineCount);
      expect(Array.isArray(body.data.recurringInvoice.line_items)).toBe(true);

      for (const rec of [body.data.recurring, body.data.recurringInvoice]) {
        expect(typeof rec.customer_name).toBe('string');
        expect(rec.customer_name).toBe(customerName);
        expect(rec.customer).toEqual(expect.objectContaining({
          id: 'cust-1',
          name: customerName,
          email: 'acme@example.com',
          phone: null,
        }));
      }
    }

    it('POST returns recurring and recurringInvoice as the same object with line_items', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [withLines] })
        .mockResolvedValueOnce({ rows: [line] });

      const response = await request(app).post('/api/v1/recurring-invoices').send(validBody);

      expect(response.status).toBe(201);
      expectBothKeysWithLineItems(response.body, 1, 'ACME Ltd');
      expectMobileLineItem(
        (response.body.data.recurring.line_items as unknown[])[0],
        line,
      );
    });

    it('GET /:id returns recurring and recurringInvoice as the same object with line_items', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [withLines] })
        .mockResolvedValueOnce({ rows: [line] });

      const response = await request(app).get('/api/v1/recurring-invoices/ri-1');

      expect(response.status).toBe(200);
      expectBothKeysWithLineItems(response.body, 1, 'ACME Ltd');
      expectMobileLineItem(
        (response.body.data.recurring.line_items as unknown[])[0],
        line,
      );
    });

    it('GET /:id returns an empty line_items array when the template has no lines', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [emptyLines] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/v1/recurring-invoices/ri-2');

      expect(response.status).toBe(200);
      expectBothKeysWithLineItems(response.body, 0, 'Beta Plumbing');
      expect(response.body.data.recurring.line_items).toEqual([]);
      expect(response.body.data.recurringInvoice.line_items).toEqual([]);
    });

    it('GET /:id returns customer_name as an empty string when the joined name is null', async () => {
      const unnamed = makeRecurringRow({ customer_name: null });
      mockDbQuery
        .mockResolvedValueOnce({ rows: [unnamed] })
        .mockResolvedValueOnce({ rows: [line] });

      const response = await request(app).get('/api/v1/recurring-invoices/ri-1');

      expect(response.status).toBe(200);
      expect(response.body.data.recurring).toEqual(response.body.data.recurringInvoice);
      expect(response.body.data.recurring.customer_name).toBe('');
      expect(response.body.data.recurringInvoice.customer_name).toBe('');
      // customer{} is the raw join. A null name stays null there.
      // The flat customer_name is '' so mobile charAt(0) does not throw.
      expect(response.body.data.recurring.customer).toEqual(expect.objectContaining({
        id: 'cust-1',
        name: null,
        email: 'acme@example.com',
        phone: null,
      }));
      expect(response.body.data.recurring.line_items).toHaveLength(1);
      expectMobileLineItem(
        (response.body.data.recurring.line_items as unknown[])[0],
        line,
      );
    });

    it('PUT returns recurring and recurringInvoice as the same object with line_items', async () => {
      const renamed = makeRecurringRow({ id: 'ri-1', name: 'Updated Name' });
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ id: 'ri-1' }] })
        .mockResolvedValueOnce({ rows: [renamed] })
        .mockResolvedValueOnce({ rows: [line] });

      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expectBothKeysWithLineItems(response.body, 1, 'ACME Ltd');
      expect(response.body.data.recurring.name).toBe('Updated Name');
      expect(response.body.data.recurringInvoice.name).toBe('Updated Name');
      expectMobileLineItem(
        (response.body.data.recurring.line_items as unknown[])[0],
        line,
      );
    });
  });

  describe('POST /api/v1/recurring-invoices/:id/generate', () => {
    function queueGenerate(lineRow: Record<string, unknown>): void {
      mockDbQuery.mockReset();
      mockCreateInvoice.mockReset();
      mockCreateInvoice.mockResolvedValue({ id: 'inv-1', status: 'draft' });
      mockDbQuery
        .mockResolvedValueOnce({ rows: [makeRecurringRow()] })
        .mockResolvedValueOnce({ rows: [lineRow] })
        .mockResolvedValueOnce({ rows: [] });
    }

    it('product-id times quantity: variableAmounts ps-1 100 with quantity 2 yields line amount 200', async () => {
      // Stored 40 * 2 is 80, so 200 can only be per-unit cents * quantity.
      queueGenerate(makeLineItemRow({
        id: 'li-1',
        product_service_id: 'ps-1',
        description: 'Oil change',
        unit_price: 40,
        quantity: 2,
        type: 'variable',
      }));

      const response = await request(app)
        .post('/api/v1/recurring-invoices/ri-1/generate')
        .send({ variableAmounts: { 'ps-1': 100 } });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.invoice).toEqual({ id: 'inv-1', status: 'draft' });
      expect(mockCreateInvoice).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          lineItems: [{ description: 'Oil change', amount: 200 }],
        }),
      );
    });

    it('line-id full amount: variableAmounts li-1 350 with quantity 2 yields 350 not 700', async () => {
      queueGenerate(makeLineItemRow({
        id: 'li-1',
        product_service_id: 'ps-1',
        description: 'Oil change',
        unit_price: 100,
        quantity: 2,
        type: 'variable',
      }));

      const response = await request(app)
        .post('/api/v1/recurring-invoices/ri-1/generate')
        .send({ variableAmounts: { 'li-1': 350 } });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.invoice).toEqual({ id: 'inv-1', status: 'draft' });
      expect(mockCreateInvoice).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          lineItems: [{ description: 'Oil change', amount: 350 }],
        }),
      );
    });
  });
});
