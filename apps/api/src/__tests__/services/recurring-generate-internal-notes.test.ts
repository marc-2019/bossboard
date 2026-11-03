/**
 * Generate path + real createInvoice.
 * Proves internal template text cannot land on invoices.notes.
 * createInvoice is not mocked — the INSERT binds are what the database would store.
 */

jest.mock('uuid', () => ({ v4: () => 'test-uuid-invoice' }));

const mockDbQuery = jest.fn();
const mockDbTransaction = jest.fn();

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

const mockGetBankDetails = jest.fn();
jest.mock('../../services/business-profile.js', () => ({
  getBankDetailsForInvoice: (...args: unknown[]) => mockGetBankDetails(...args),
}));

import { generateInvoiceFromRecurring } from '../../services/recurring-invoices.js';
import { looksLikeInternalInvoiceNotes } from '../../types/index.js';

function insertedColumn(sql: string, params: unknown[], column: string): unknown {
  const match = sql.match(/INSERT INTO invoices\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i);
  if (!match) throw new Error(`INSERT not parsed:\n${sql}`);
  const cols = match[1].split(',').map((s) => s.trim());
  const vals = match[2].split(',').map((s) => s.trim());
  const idx = cols.indexOf(column);
  if (idx < 0) throw new Error(`missing column ${column}`);
  const token = vals[idx];
  const param = token.match(/^\$(\d+)$/);
  if (!param) return token;
  return params[Number(param[1]) - 1];
}

function recurringRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ri-1',
    user_id: 'user-1',
    customer_id: 'cust-1',
    name: 'Monthly retainer',
    recurrence: 'monthly',
    day_of_month: 15,
    is_auto_generate: true,
    include_gst: true,
    payment_terms: 7,
    notes: null,
    internal_memo: null,
    is_active: true,
    customer_name: 'Example Client',
    customer_email: 'accounts@example.com',
    customer_phone: null,
    ...overrides,
  };
}

function lineItemRow(): Record<string, unknown> {
  return {
    id: 'li-1',
    description: 'Monthly support',
    unit_price: 10000,
    quantity: 1,
    type: 'fixed',
    product_name: 'Support',
  };
}

function invoiceRow(): Record<string, unknown> {
  return {
    id: 'inv-1',
    user_id: 'user-1',
    invoice_number: 'INV-0001',
    client_name: 'Example Client',
    client_email: 'accounts@example.com',
    client_phone: null,
    swms_id: null,
    job_description: null,
    line_items: JSON.stringify([{ id: 'li', description: 'Monthly support', amount: 10000 }]),
    subtotal: 10000,
    gst_amount: 1500,
    total: 11500,
    status: 'draft',
    due_date: '2026-10-24',
    paid_at: null,
    bank_account_name: null,
    bank_account_number: null,
    notes: null,
    internal_memo: null,
    customer_id: 'cust-1',
    recurring_invoice_id: 'ri-1',
    include_gst: true,
    discount_type: 'none',
    discount_value: 0,
    discount_amount: 0,
    discount_label: null,
    intl_bank_account_name: null,
    intl_iban: null,
    intl_swift_bic: null,
    intl_bank_name: null,
    intl_bank_address: null,
    company_name: null,
    company_address: null,
    ird_number: null,
    gst_number: null,
    share_token: null,
    created_at: new Date('2026-10-17'),
    updated_at: new Date('2026-10-17'),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBankDetails.mockResolvedValue(null);
  mockDbTransaction.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    return callback({ query: clientQuery });
  });
});

describe('generateInvoiceFromRecurring internal notes', () => {
  it('must not write internal template text into invoices.notes', async () => {
    const internal = 'Deskera 0000092 — review before send. system test.';
    mockDbQuery
      .mockResolvedValueOnce({ rows: [recurringRow({ notes: internal })] })
      .mockResolvedValueOnce({ rows: [lineItemRow()] })
      .mockResolvedValueOnce({ rows: [invoiceRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await generateInvoiceFromRecurring('ri-1', 'user-1');

    const insert = mockDbQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO invoices')
    );
    expect(insert).toBeDefined();
    const sql = insert![0] as string;
    const params = insert![1] as unknown[];
    const notes = insertedColumn(sql, params, 'notes');
    const memo = insertedColumn(sql, params, 'internal_memo');

    expect(notes).toBeNull();
    expect(looksLikeInternalInvoiceNotes(typeof notes === 'string' ? notes : null)).toBe(false);
    expect(memo).toBe(internal);
    expect(params.filter((value) => value === internal)).toEqual([internal]);
  });

  it('keeps customer-facing template notes and parks the staff memo', async () => {
    const customerNotes = 'Thanks — payment within 7 days.';
    const memo = 'Deskera 0000092 seed note';
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [recurringRow({ notes: customerNotes, internal_memo: memo })],
      })
      .mockResolvedValueOnce({ rows: [lineItemRow()] })
      .mockResolvedValueOnce({ rows: [invoiceRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await generateInvoiceFromRecurring('ri-1', 'user-1');

    const insert = mockDbQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO invoices')
    );
    expect(insert).toBeDefined();
    const sql = insert![0] as string;
    const params = insert![1] as unknown[];

    expect(insertedColumn(sql, params, 'notes')).toBe(customerNotes);
    expect(insertedColumn(sql, params, 'internal_memo')).toBe(memo);
    expect(looksLikeInternalInvoiceNotes(customerNotes)).toBe(false);
    expect(String(insertedColumn(sql, params, 'notes'))).not.toContain('Deskera');
  });
});
