/**
 * Invoice Service Tests
 *
 * Covers the core billing logic:
 *   - createInvoice: GST calculations, auto-populate from business profile, line item IDs
 *   - getInvoiceByIdRaw / getInvoiceById: found, not found
 *   - listInvoices: pagination, status filter
 *   - updateInvoice: draft OK, non-draft throws, not found returns null, recalculates totals
 *   - deleteInvoice: draft deleted, non-draft throws, not found returns false
 *   - markAsSent: draft → sent, returns null when not found
 *   - markAsPaid: sent → paid, returns null when not found
 *   - getInvoiceStats: aggregate counts and amounts
 *   - generateShareToken: new token, existing token re-used, not found
 *   - getNextInvoiceNumber: sequential numbering with custom prefix
 */

// ---------------------------------------------------------------------------
// Mocks — must appear before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-line-item'),
}));

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

jest.mock('../../middleware/error.js', () => ({
  createError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

jest.mock('../../config/index.js', () => ({
  config: {
    port: 29001,
    // Tests encrypt bank/PII at rest the same as production
    isDevelopment: false,
    fieldEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
    jwt: { secret: 'test-jwt-secret-for-field-crypto' },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createInvoice,
  calculateTotals,
  getInvoiceByIdRaw,
  getInvoiceById,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  markAsSent,
  markAsPaid,
  getInvoiceStats,
  generateShareToken,
  getNextInvoiceNumber,
} from '../../services/invoices.js';
import { _resetFieldCryptoForTests } from '../../utils/field-crypto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal DB row that transformInvoice can hydrate into an Invoice. */
function makeInvoiceRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'inv-uuid-1',
    user_id: 'user-1',
    invoice_number: 'INV-0001',
    client_name: 'Test Client',
    client_email: 'client@example.com',
    client_phone: null,
    swms_id: null,
    job_description: null,
    line_items: JSON.stringify([{ id: 'li-1', description: 'Labour', amount: 10000 }]),
    subtotal: 10000,
    gst_amount: 1500,
    total: 11500,
    status: 'draft',
    due_date: null,
    paid_at: null,
    bank_account_name: null,
    bank_account_number: null,
    notes: null,
    customer_id: null,
    recurring_invoice_id: null,
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
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/** A minimal valid InvoiceCreateInput */
function makeCreateInput(overrides: Record<string, unknown> = {}): any {
  return {
    clientName: 'Test Client',
    clientEmail: 'client@example.com',
    lineItems: [{ description: 'Labour', amount: 10000 }],
    includeGst: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  _resetFieldCryptoForTests();
  // getNextInvoiceNumber uses db.transaction — set up a pass-through by default
  const mockClientQuery = jest.fn();
  mockDbTransaction.mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
    return callback({ query: mockClientQuery });
  });
});

// ===========================================================================
// calculateTotals (discount before GST)
// ===========================================================================

describe('calculateTotals', () => {
  it('applies fixed discount before GST', () => {
    const t = calculateTotals({
      lineItems: [{ description: 'Labour', amount: 10000 }],
      includeGst: true,
      discountType: 'fixed',
      discountValue: 1000, // $10
    });
    expect(t.subtotal).toBe(10000);
    expect(t.discountAmount).toBe(1000);
    expect(t.gstAmount).toBe(1350); // 15% of 9000
    expect(t.total).toBe(10350);
  });

  it('applies percent discount before GST', () => {
    const t = calculateTotals({
      lineItems: [{ description: 'Labour', amount: 10000 }],
      includeGst: true,
      discountType: 'percent',
      discountValue: 10,
    });
    expect(t.discountAmount).toBe(1000);
    expect(t.gstAmount).toBe(1350);
    expect(t.total).toBe(10350);
  });

  it('caps fixed discount at subtotal', () => {
    const t = calculateTotals({
      lineItems: [{ description: 'Labour', amount: 500 }],
      includeGst: false,
      discountType: 'fixed',
      discountValue: 9999,
    });
    expect(t.discountAmount).toBe(500);
    expect(t.total).toBe(0);
  });

  it('treats none / zero as no discount', () => {
    const t = calculateTotals({
      lineItems: [{ description: 'Labour', amount: 10000 }],
      includeGst: true,
      discountType: 'none',
      discountValue: 0,
    });
    expect(t.discountType).toBe('none');
    expect(t.discountAmount).toBe(0);
    expect(t.gstAmount).toBe(1500);
    expect(t.total).toBe(11500);
  });
});

// ===========================================================================
// createInvoice
// ===========================================================================

describe('createInvoice', () => {
  it('inserts invoice with correct totals including NZ GST (15%)', async () => {
    // getNextInvoiceNumber → transaction with two queries
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'INV' }] }) // business profile prefix
      .mockResolvedValueOnce({ rows: [] });                          // no existing invoices → starts at 1
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    mockGetBankDetails.mockResolvedValue(null); // no profile to auto-populate

    const insertedRow = makeInvoiceRow({ subtotal: 10000, gst_amount: 1500, total: 11500 });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] }); // INSERT RETURNING

    const invoice = await createInvoice('user-1', makeCreateInput());

    // Verify GST applied: 10000 * 0.15 = 1500
    expect(invoice.subtotal).toBe(10000);
    expect(invoice.gstAmount).toBe(1500);
    expect(invoice.total).toBe(11500);
    expect(invoice.status).toBe('draft');
    expect(invoice.invoiceNumber).toBe('INV-0001');
  });

  it('creates invoice WITHOUT GST when includeGst is false', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] }) // no business profile
      .mockResolvedValueOnce({ rows: [] }); // no existing invoices
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));
    mockGetBankDetails.mockResolvedValue(null);

    const insertedRow = makeInvoiceRow({ subtotal: 10000, gst_amount: 0, total: 10000, include_gst: false });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const invoice = await createInvoice('user-1', makeCreateInput({ includeGst: false }));

    expect(invoice.includeGst).toBe(false);
    expect(invoice.gstAmount).toBe(0);
    expect(invoice.total).toBe(10000);
  });

  it('creates invoice with fixed discount before GST', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));
    mockGetBankDetails.mockResolvedValue(null);

    const insertedRow = makeInvoiceRow({
      subtotal: 10000,
      discount_type: 'fixed',
      discount_value: 1000,
      discount_amount: 1000,
      discount_label: 'Mate rate',
      gst_amount: 1350,
      total: 10350,
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const invoice = await createInvoice(
      'user-1',
      makeCreateInput({
        discountType: 'fixed',
        discountValue: 1000,
        discountLabel: 'Mate rate',
      })
    );

    expect(invoice.discountType).toBe('fixed');
    expect(invoice.discountAmount).toBe(1000);
    expect(invoice.discountLabel).toBe('Mate rate');
    expect(invoice.gstAmount).toBe(1350);
    expect(invoice.total).toBe(10350);

    // INSERT includes discount columns
    const insertArgs = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(insertArgs).toContain('fixed');
    expect(insertArgs).toContain(1000);
    expect(insertArgs).toContain('Mate rate');
  });

  it('auto-populates bank details from business profile when not provided', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    mockGetBankDetails.mockResolvedValue({
      bankAccountName: 'Test Business',
      bankAccountNumber: '01-0001-0001234-00',
      companyName: 'Test Ltd',
      companyAddress: '1 Test St, Auckland',
      irdNumber: '12-345-678',
      gstNumber: '123-456-789',
      isGstRegistered: true,
      intlBankAccountName: null,
      intlIban: null,
      intlSwiftBic: null,
      intlBankName: null,
      intlBankAddress: null,
    });

    const insertedRow = makeInvoiceRow({
      bank_account_name: 'Test Business',
      bank_account_number: '01-0001-0001234-00',
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const invoice = await createInvoice('user-1', makeCreateInput());

    // getBankDetailsForInvoice called (no bank details in input)
    expect(mockGetBankDetails).toHaveBeenCalledWith('user-1');
    expect(invoice.bankAccountName).toBe('Test Business');
  });

  it('generates sequential invoice numbers using business profile prefix', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'INST' }] })   // profile prefix = INST
      .mockResolvedValueOnce({ rows: [{ invoice_number: 'INST-0004' }] }); // max existing = 4
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));
    mockGetBankDetails.mockResolvedValue(null);

    const insertedRow = makeInvoiceRow({ invoice_number: 'INST-0005' });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const invoice = await createInvoice('user-1', makeCreateInput());
    expect(invoice.invoiceNumber).toBe('INST-0005');
  });

  it('assigns unique IDs to each line item', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));
    mockGetBankDetails.mockResolvedValue(null);

    const twoItems = [
      { description: 'Labour', amount: 5000 },
      { description: 'Materials', amount: 3000 },
    ];
    const insertedRow = makeInvoiceRow({
      line_items: JSON.stringify([
        { id: 'uuid-a', description: 'Labour', amount: 5000 },
        { id: 'uuid-b', description: 'Materials', amount: 3000 },
      ]),
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const invoice = await createInvoice('user-1', makeCreateInput({ lineItems: twoItems }));

    expect(invoice.lineItems).toHaveLength(2);
    expect(invoice.lineItems[0].id).toBeDefined();
    expect(invoice.lineItems[1].id).toBeDefined();
    expect(invoice.lineItems[0].id).not.toBe(invoice.lineItems[1].id);
  });
});

// ===========================================================================
// getNextInvoiceNumber
// ===========================================================================

describe('getNextInvoiceNumber', () => {
  it('returns INV-0001 for a user with no prior invoices and no profile', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })  // no business profile
      .mockResolvedValueOnce({ rows: [] }); // no existing invoices
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextInvoiceNumber('user-1');
    expect(num).toBe('INV-0001');
  });

  it('increments from the last invoice number', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'INV' }] })
      .mockResolvedValueOnce({ rows: [{ invoice_number: 'INV-0042' }] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextInvoiceNumber('user-1');
    expect(num).toBe('INV-0043');
  });

  it('uses custom prefix from business profile', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'ABC' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextInvoiceNumber('user-1');
    expect(num).toBe('ABC-0001');
  });
});

// ===========================================================================
// getInvoiceByIdRaw
// ===========================================================================

describe('getInvoiceByIdRaw', () => {
  it('returns a typed Invoice when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeInvoiceRow()] });

    const invoice = await getInvoiceByIdRaw('inv-uuid-1', 'user-1');

    expect(invoice).not.toBeNull();
    expect(invoice!.id).toBe('inv-uuid-1');
    expect(invoice!.clientName).toBe('Test Client');
    expect(invoice!.subtotal).toBe(10000);
    expect(invoice!.lineItems).toHaveLength(1);
  });

  it('returns null when invoice does not exist or belongs to another user', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const invoice = await getInvoiceByIdRaw('missing', 'user-1');
    expect(invoice).toBeNull();
  });
});

// ===========================================================================
// getInvoiceById (mobile format)
// ===========================================================================

describe('getInvoiceById', () => {
  it('returns snake_case formatted invoice for mobile clients', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeInvoiceRow()] });

    const result = await getInvoiceById('inv-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    // Mobile format uses snake_case keys
    expect(result!['invoice_number']).toBe('INV-0001');
    expect(result!['client_name']).toBe('Test Client');
    expect(result!['gst_amount']).toBe(1500);
  });

  it('returns null when invoice not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getInvoiceById('missing', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// listInvoices
// ===========================================================================

describe('listInvoices', () => {
  it('returns paginated list with total count', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // COUNT query
      .mockResolvedValueOnce({ rows: [makeInvoiceRow(), makeInvoiceRow({ id: 'inv-2', invoice_number: 'INV-0002' })] });

    const result = await listInvoices('user-1');

    expect(result.total).toBe(5);
    expect(result.invoices).toHaveLength(2);
    // Results are in mobile snake_case format
    expect(result.invoices[0]['invoice_number']).toBe('INV-0001');
  });

  it('applies status filter to query', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listInvoices('user-1', { status: 'paid' });

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('status = $2'),
      expect.arrayContaining(['user-1', 'paid'])
    );
  });

  it('uses default limit of 20 and offset of 0', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listInvoices('user-1');

    // Second query (the SELECT with LIMIT/OFFSET) should include 20 and 0
    const secondCall = mockDbQuery.mock.calls[1];
    expect(secondCall[1]).toContain(20);
    expect(secondCall[1]).toContain(0);
  });
});

// ===========================================================================
// updateInvoice
// ===========================================================================

describe('updateInvoice', () => {
  it('updates a draft invoice and returns refreshed data', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeInvoiceRow()] })      // full row for baseline
      .mockResolvedValueOnce({ rowCount: 1 })                       // UPDATE
      .mockResolvedValueOnce({ rows: [makeInvoiceRow({ client_name: 'Updated Client' })] }); // getInvoiceById re-query

    const result = await updateInvoice('inv-uuid-1', 'user-1', { clientName: 'Updated Client' });

    expect(result).not.toBeNull();
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE invoices'),
      expect.any(Array)
    );
  });

  it('throws INVOICE_NOT_EDITABLE when trying to update a sent invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeInvoiceRow({ status: 'sent' })] });

    await expect(updateInvoice('inv-uuid-1', 'user-1', { clientName: 'X' }))
      .rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE', statusCode: 400 });
  });

  it('returns null when invoice does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await updateInvoice('missing', 'user-1', { clientName: 'X' });
    expect(result).toBeNull();
  });

  it('recalculates totals when line items are updated', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeInvoiceRow()] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeInvoiceRow({ subtotal: 20000, gst_amount: 3000, total: 23000 })] });

    const result = await updateInvoice('inv-uuid-1', 'user-1', {
      lineItems: [{ description: 'Extra work', amount: 20000 }],
    });

    // UPDATE query should include subtotal, gst_amount, total fields
    const updateCall = mockDbQuery.mock.calls[1];
    expect(updateCall[0]).toContain('subtotal');
    expect(updateCall[0]).toContain('gst_amount');
    expect(updateCall[0]).toContain('total');
    expect(updateCall[0]).toContain('discount_amount');
    expect(result).not.toBeNull();
  });

  it('returns current invoice unchanged when updates object is empty', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeInvoiceRow()] }) // full row
      .mockResolvedValueOnce({ rows: [makeInvoiceRow()] });    // getInvoiceById fallback (no UPDATE)

    const result = await updateInvoice('inv-uuid-1', 'user-1', {});
    expect(result).not.toBeNull();
    // Should only be 2 DB calls (load + re-read), no UPDATE
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// deleteInvoice
// ===========================================================================

describe('deleteInvoice', () => {
  it('deletes a draft invoice and returns true', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ status: 'draft' }] }) // status check
      .mockResolvedValueOnce({ rowCount: 1 });                 // DELETE

    const result = await deleteInvoice('inv-uuid-1', 'user-1');
    expect(result).toBe(true);
  });

  it('throws INVOICE_NOT_DELETABLE when trying to delete a sent invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ status: 'sent' }] });

    await expect(deleteInvoice('inv-uuid-1', 'user-1'))
      .rejects.toMatchObject({ code: 'INVOICE_NOT_DELETABLE', statusCode: 400 });
  });

  it('throws INVOICE_NOT_DELETABLE when trying to delete a paid invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ status: 'paid' }] });

    await expect(deleteInvoice('inv-uuid-1', 'user-1'))
      .rejects.toMatchObject({ code: 'INVOICE_NOT_DELETABLE' });
  });

  it('returns false when invoice does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await deleteInvoice('missing', 'user-1');
    expect(result).toBe(false);
  });
});

// ===========================================================================
// markAsSent
// ===========================================================================

describe('markAsSent', () => {
  it('transitions a draft invoice to sent status', async () => {
    const sentRow = makeInvoiceRow({ status: 'sent' });
    mockDbQuery.mockResolvedValueOnce({ rows: [sentRow] });

    const result = await markAsSent('inv-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!['status']).toBe('sent');
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'sent'"),
      ['inv-uuid-1', 'user-1']
    );
  });

  it('returns null when invoice not found or already in non-draft state', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await markAsSent('inv-uuid-1', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// markAsPaid
// ===========================================================================

describe('markAsPaid', () => {
  it('transitions a sent invoice to paid status with paid_at timestamp', async () => {
    const paidRow = makeInvoiceRow({ status: 'paid', paid_at: new Date() });
    mockDbQuery.mockResolvedValueOnce({ rows: [paidRow] });

    const result = await markAsPaid('inv-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!['status']).toBe('paid');
    expect(result!['paid_at']).not.toBeNull();
    // Query should only target sent or overdue invoices
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('sent', 'overdue')"),
      ['inv-uuid-1', 'user-1']
    );
  });

  it('transitions an overdue invoice to paid status', async () => {
    const paidRow = makeInvoiceRow({ status: 'paid', paid_at: new Date() });
    mockDbQuery.mockResolvedValueOnce({ rows: [paidRow] });

    const result = await markAsPaid('inv-uuid-1', 'user-1');
    expect(result).not.toBeNull();
    expect(result!['status']).toBe('paid');
  });

  it('returns null when invoice not found or in wrong state (draft)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await markAsPaid('inv-uuid-1', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// getInvoiceStats
// ===========================================================================

describe('getInvoiceStats', () => {
  it('returns aggregate counts and unpaid amount', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        total: '12',
        unpaid: '3',
        unpaid_amount: '45000',
        this_month: '4',
      }],
    });

    const stats = await getInvoiceStats('user-1');

    expect(stats.total).toBe(12);
    expect(stats.unpaid).toBe(3);
    expect(stats.unpaidAmount).toBe(45000);
    expect(stats.thisMonth).toBe(4);
  });

  it('returns zeroes when user has no invoices', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        total: '0',
        unpaid: '0',
        unpaid_amount: '0',
        this_month: '0',
      }],
    });

    const stats = await getInvoiceStats('user-1');
    expect(stats.total).toBe(0);
    expect(stats.unpaidAmount).toBe(0);
  });
});

// ===========================================================================
// generateShareToken
// ===========================================================================

describe('generateShareToken', () => {
  it('generates and persists a new 64-char hex token', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'inv-uuid-1', share_token: null }] }) // no existing token
      .mockResolvedValueOnce({ rowCount: 1 });                                     // UPDATE

    const token = await generateShareToken('inv-uuid-1', 'user-1');

    expect(token).not.toBeNull();
    expect(token!.length).toBe(64); // 32 bytes → 64 hex chars
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('returns the existing token without re-generating', async () => {
    const existingToken = 'a'.repeat(64);
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 'inv-uuid-1', share_token: existingToken }],
    });

    const token = await generateShareToken('inv-uuid-1', 'user-1');

    expect(token).toBe(existingToken);
    // Should NOT call UPDATE (only one DB call)
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });

  it('returns null when invoice not found or belongs to another user', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const token = await generateShareToken('missing', 'user-1');
    expect(token).toBeNull();
  });
});
