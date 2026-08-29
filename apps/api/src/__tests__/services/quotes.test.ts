/**
 * Quotes Service Tests
 *
 * Covers the core quoting logic:
 *   - getNextQuoteNumber: QTE prefix, sequential numbering, INV→QTE prefix transform
 *   - createQuote: GST calculations, auto-populate from business profile, line item IDs
 *   - getQuoteByIdRaw / getQuoteById: found, not found
 *   - listQuotes: pagination, status filter
 *   - updateQuote: draft OK, non-draft throws, not found returns null, recalculates totals
 *   - deleteQuote: found returns true, not found returns false
 *   - markAsSent: draft → sent stamps sent_at; second call no-op; returns null when not found
 *   - markAsAccepted / markAsDeclined / convertToInvoice: preserve sent_at
 *   - listQuotes: includes sent_at when present
 *   - getQuoteStats: aggregate counts and amounts
 */

// ---------------------------------------------------------------------------
// Mocks — must appear before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

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

const mockCreateInvoice = jest.fn();
jest.mock('../../services/invoices.js', () => ({
  createInvoice: (...args: unknown[]) => mockCreateInvoice(...args),
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
    isDevelopment: false,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  getNextQuoteNumber,
  createQuote,
  getQuoteByIdRaw,
  getQuoteById,
  listQuotes,
  updateQuote,
  deleteQuote,
  markAsSent,
  markAsAccepted,
  markAsDeclined,
  convertToInvoice,
  getQuoteStats,
} from '../../services/quotes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal DB row that transformQuote can hydrate into a Quote. */
function makeQuoteRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'quote-uuid-1',
    user_id: 'user-1',
    quote_number: 'QTE-0001',
    client_name: 'Test Client',
    client_email: 'client@example.com',
    client_phone: null,
    customer_id: null,
    job_description: null,
    line_items: JSON.stringify([{ id: 'li-1', description: 'Labour', amount: 10000 }]),
    subtotal: 10000,
    gst_amount: 1500,
    total: 11500,
    include_gst: true,
    status: 'draft',
    valid_until: null,
    converted_invoice_id: null,
    bank_account_name: null,
    bank_account_number: null,
    intl_bank_account_name: null,
    intl_iban: null,
    intl_swift_bic: null,
    intl_bank_name: null,
    intl_bank_address: null,
    company_name: null,
    company_address: null,
    ird_number: null,
    gst_number: null,
    notes: null,
    internal_memo: null,
    sent_at: null,
    last_operator_nudge_at: null,
    operator_nudge_count: 0,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/** A minimal valid QuoteCreateInput */
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
  // getNextQuoteNumber uses db.transaction — set up a pass-through by default
  const mockClientQuery = jest.fn();
  mockDbTransaction.mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
    return callback({ query: mockClientQuery });
  });
});

// ===========================================================================
// getNextQuoteNumber
// ===========================================================================

describe('getNextQuoteNumber', () => {
  it('returns QTE-0001 for a user with no prior quotes and no profile', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })  // no business profile
      .mockResolvedValueOnce({ rows: [] }); // no existing quotes
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextQuoteNumber('user-1');
    expect(num).toBe('QTE-0001');
  });

  it('increments from the last quote number', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'INV' }] })
      .mockResolvedValueOnce({ rows: [{ quote_number: 'QTE-0042' }] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextQuoteNumber('user-1');
    expect(num).toBe('QTE-0043');
  });

  it('transforms INV prefix to QTE prefix', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'INV' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextQuoteNumber('user-1');
    expect(num).toBe('QTE-0001');
  });

  it('uses QTE when profile prefix does not start with INV', async () => {
    // A custom non-INV prefix falls back to QTE (code logic)
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'SMITH' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const num = await getNextQuoteNumber('user-1');
    // prefix 'SMITH' doesn't start with 'INV', so replace returns 'SMITH' unchanged,
    // === 'SMITH' !== 'QTE', so falls back to 'QTE'
    expect(num).toBe('QTE-0001');
  });
});

// ===========================================================================
// createQuote
// ===========================================================================

describe('createQuote', () => {
  it('inserts quote with correct totals including NZ GST (15%)', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ invoice_prefix: 'INV' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));
    mockGetBankDetails.mockResolvedValue(null);

    const insertedRow = makeQuoteRow({ subtotal: 10000, gst_amount: 1500, total: 11500 });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const quote = await createQuote('user-1', makeCreateInput());

    expect(quote.subtotal).toBe(10000);
    expect(quote.gstAmount).toBe(1500);
    expect(quote.total).toBe(11500);
    expect(quote.status).toBe('draft');
    expect(quote.quoteNumber).toBe('QTE-0001');
  });

  it('creates quote WITHOUT GST when includeGst is false', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));
    mockGetBankDetails.mockResolvedValue(null);

    const insertedRow = makeQuoteRow({ subtotal: 10000, gst_amount: 0, total: 10000, include_gst: false });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const quote = await createQuote('user-1', makeCreateInput({ includeGst: false }));

    expect(quote.includeGst).toBe(false);
    expect(quote.gstAmount).toBe(0);
    expect(quote.total).toBe(10000);
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

    const insertedRow = makeQuoteRow({
      bank_account_name: 'Test Business',
      bank_account_number: '01-0001-0001234-00',
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const quote = await createQuote('user-1', makeCreateInput());

    expect(mockGetBankDetails).toHaveBeenCalledWith('user-1');
    expect(quote.bankAccountName).toBe('Test Business');
  });

  it('defaults includeGst from business profile isGstRegistered when not specified', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    mockGetBankDetails.mockResolvedValue({
      bankAccountName: 'Biz',
      bankAccountNumber: '01-0001',
      companyName: null,
      companyAddress: null,
      irdNumber: null,
      gstNumber: null,
      isGstRegistered: false, // not GST registered
      intlBankAccountName: null,
      intlIban: null,
      intlSwiftBic: null,
      intlBankName: null,
      intlBankAddress: null,
    });

    const insertedRow = makeQuoteRow({ include_gst: false });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    // Create without specifying includeGst — should inherit from profile
    const { includeGst: _, ...inputWithoutGst } = makeCreateInput();
    const quote = await createQuote('user-1', inputWithoutGst);

    expect(quote.includeGst).toBe(false);
  });

  it('continues gracefully when business profile fetch throws', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    mockGetBankDetails.mockRejectedValue(new Error('DB error'));

    const insertedRow = makeQuoteRow();
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    // Should not throw — gracefully continues without bank details
    await expect(createQuote('user-1', makeCreateInput())).resolves.toBeDefined();
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
    const insertedRow = makeQuoteRow({
      line_items: JSON.stringify([
        { id: 'uuid-a', description: 'Labour', amount: 5000 },
        { id: 'uuid-b', description: 'Materials', amount: 3000 },
      ]),
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [insertedRow] });

    const quote = await createQuote('user-1', makeCreateInput({ lineItems: twoItems }));

    expect(quote.lineItems).toHaveLength(2);
    expect(quote.lineItems[0].id).toBeDefined();
    expect(quote.lineItems[1].id).toBeDefined();
    expect(quote.lineItems[0].id).not.toBe(quote.lineItems[1].id);
  });
});

// ===========================================================================
// getQuoteByIdRaw
// ===========================================================================

describe('getQuoteByIdRaw', () => {
  it('returns a typed Quote when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow()] });

    const quote = await getQuoteByIdRaw('quote-uuid-1', 'user-1');

    expect(quote).not.toBeNull();
    expect(quote!.id).toBe('quote-uuid-1');
    expect(quote!.quoteNumber).toBe('QTE-0001');
    expect(quote!.status).toBe('draft');
  });

  it('returns null when quote not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const quote = await getQuoteByIdRaw('nonexistent', 'user-1');
    expect(quote).toBeNull();
  });
});

// ===========================================================================
// getQuoteById
// ===========================================================================

describe('getQuoteById', () => {
  it('returns mobile-formatted (snake_case) quote when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow()] });

    const result = await getQuoteById('quote-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    // Mobile format uses snake_case
    expect(result!.quote_number).toBe('QTE-0001');
    expect(result!.client_name).toBe('Test Client');
  });

  it('returns null when quote not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getQuoteById('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// listQuotes
// ===========================================================================

describe('listQuotes', () => {
  it('returns paginated quotes with total count', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })        // COUNT query
      .mockResolvedValueOnce({ rows: [makeQuoteRow(), makeQuoteRow({ id: 'quote-uuid-2', quote_number: 'QTE-0002' })] });

    const result = await listQuotes('user-1', { limit: 20, offset: 0 });

    expect(result.total).toBe(5);
    expect(result.quotes).toHaveLength(2);
    expect(result.quotes[0].quote_number).toBe('QTE-0001');
  });

  it('filters by status when provided', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [makeQuoteRow({ status: 'sent' })] });

    const result = await listQuotes('user-1', { status: 'sent' });

    expect(result.total).toBe(2);
    expect(result.quotes[0].status).toBe('sent');
  });

  it('T6: list ?status=sent includes sent_at on each item when set', async () => {
    const sentAt = new Date('2026-08-10T09:00:00.000Z');
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          makeQuoteRow({
            status: 'sent',
            sent_at: sentAt,
            operator_nudge_count: 0,
          }),
        ],
      });

    const result = await listQuotes('user-1', { status: 'sent' });

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].status).toBe('sent');
    expect(result.quotes[0].sent_at).toBe(sentAt.toISOString());
    // Nudge columns are schema-only — must not leak onto the Quote / mobile transform.
    expect(result.quotes[0]).not.toHaveProperty('operator_nudge_count');
    expect(result.quotes[0]).not.toHaveProperty('last_operator_nudge_at');
    expect(result.quotes[0]).not.toHaveProperty('operatorNudgeCount');
    expect(result.quotes[0]).not.toHaveProperty('lastOperatorNudgeAt');
  });

  it('applies default limit of 20 when not specified', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listQuotes('user-1');

    expect(result.total).toBe(0);
    expect(result.quotes).toHaveLength(0);
  });
});

// ===========================================================================
// updateQuote
// ===========================================================================

describe('updateQuote', () => {
  it('updates a draft quote and returns updated mobile-formatted result', async () => {
    // 1st call: SELECT status
    mockDbQuery.mockResolvedValueOnce({ rows: [{ status: 'draft' }] });
    // 2nd call: UPDATE
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    // 3rd call: re-fetch via getQuoteById (SELECT *)
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow({ client_name: 'Updated Client' })] });

    const result = await updateQuote('quote-uuid-1', 'user-1', { clientName: 'Updated Client' });

    expect(result).not.toBeNull();
    expect(result!.client_name).toBe('Updated Client');
  });

  it('throws QUOTE_NOT_EDITABLE when trying to update a sent quote', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ status: 'sent' }] });

    await expect(
      updateQuote('quote-uuid-1', 'user-1', { clientName: 'New Name' })
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_EDITABLE' });
  });

  it('returns null when quote not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await updateQuote('nonexistent', 'user-1', { clientName: 'X' });
    expect(result).toBeNull();
  });

  it('recalculates totals when line items are updated', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ status: 'draft' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow({ subtotal: 20000, gst_amount: 3000, total: 23000 })] });

    const result = await updateQuote('quote-uuid-1', 'user-1', {
      lineItems: [{ description: 'Big job', amount: 20000 }],
    });

    expect(result!.subtotal).toBe(20000);
    expect(result!.gst_amount).toBe(3000);
    expect(result!.total).toBe(23000);
  });

  it('returns current quote unchanged when no valid fields to update', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ status: 'draft' }] });
    // No UPDATE call expected — getQuoteById called directly
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow()] });

    const result = await updateQuote('quote-uuid-1', 'user-1', {});
    expect(result).not.toBeNull();
  });
});

// ===========================================================================
// deleteQuote
// ===========================================================================

describe('deleteQuote', () => {
  it('returns true when quote is deleted successfully', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const deleted = await deleteQuote('quote-uuid-1', 'user-1');
    expect(deleted).toBe(true);
  });

  it('returns false when quote does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });

    const deleted = await deleteQuote('nonexistent', 'user-1');
    expect(deleted).toBe(false);
  });
});

// ===========================================================================
// markAsSent
// ===========================================================================

describe('markAsSent', () => {
  it('T1: SQL stamps sent_at via COALESCE (injected RETURNING is not the write proof)', async () => {
    // RETURNING row is a mock — asserting it does not prove the write.
    // The lock here is the SQL. Live SELECT proof lives in quote-sent-at.live.test.ts.
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'sent', sent_at: null })],
    });

    const result = await markAsSent('quote-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('sent');

    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/sent_at\s*=\s*COALESCE\s*\(\s*sent_at\s*,\s*NOW\s*\(\s*\)\s*\)/i);
    expect(sql).toMatch(/status\s*=\s*'sent'/i);
    expect(sql).toMatch(/status\s*=\s*'draft'/i);
  });

  it('T2: second call on already-sent is no-op (null); sent_at would be unchanged on re-read', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await markAsSent('quote-uuid-1', 'user-1');
    expect(result).toBeNull();

    // WHERE still requires draft — already-sent cannot re-stamp
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/status\s*=\s*'draft'/i);
  });

  it('returns null when quote not found or not in draft status', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await markAsSent('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// markAsAccepted
// ===========================================================================

describe('markAsAccepted', () => {
  it('transitions sent quote to accepted status', async () => {
    const acceptedRow = makeQuoteRow({ status: 'accepted' });
    mockDbQuery.mockResolvedValueOnce({ rows: [acceptedRow] });

    const result = await markAsAccepted('quote-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('accepted');
  });

  it('T3: accept after send preserves sent_at', async () => {
    const sentAt = new Date('2026-08-01T10:00:00.000Z');
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'accepted', sent_at: sentAt })],
    });

    const result = await markAsAccepted('quote-uuid-1', 'user-1');

    expect(result!.status).toBe('accepted');
    expect(result!.sent_at).toBe(sentAt.toISOString());

    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/sent_at\s*=/);
  });

  it('returns null when quote not found or not in sent status', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await markAsAccepted('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// markAsDeclined
// ===========================================================================

describe('markAsDeclined', () => {
  it('transitions sent quote to declined status', async () => {
    const declinedRow = makeQuoteRow({ status: 'declined' });
    mockDbQuery.mockResolvedValueOnce({ rows: [declinedRow] });

    const result = await markAsDeclined('quote-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('declined');
  });

  it('T4: decline after send preserves sent_at', async () => {
    const sentAt = new Date('2026-08-02T12:30:00.000Z');
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'declined', sent_at: sentAt })],
    });

    const result = await markAsDeclined('quote-uuid-1', 'user-1');

    expect(result!.status).toBe('declined');
    expect(result!.sent_at).toBe(sentAt.toISOString());

    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/sent_at\s*=/);
  });

  it('returns null when quote not found or not in sent status', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await markAsDeclined('nonexistent', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// convertToInvoice
// ===========================================================================

describe('convertToInvoice', () => {
  it('converts an accepted quote to an invoice and marks quote as converted', async () => {
    // getQuoteByIdRaw → SELECT *
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow({ status: 'accepted' })] });

    mockCreateInvoice.mockResolvedValueOnce({ id: 'inv-123', invoiceNumber: 'INV-0001' });

    // UPDATE quotes SET status = 'converted' ... RETURNING *
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'converted', converted_invoice_id: 'inv-123' })],
    });

    const result = await convertToInvoice('quote-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.quote.status).toBe('converted');
    expect(result!.quote.converted_invoice_id).toBe('inv-123');
    expect(result!.invoice.id).toBe('inv-123');
    expect(result!.invoice.invoiceNumber).toBe('INV-0001');
  });

  it('T5: convert after send preserves sent_at and still creates invoice', async () => {
    const sentAt = new Date('2026-07-15T08:00:00.000Z');
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'sent', sent_at: sentAt })],
    });
    mockCreateInvoice.mockResolvedValueOnce({ id: 'inv-789', invoiceNumber: 'INV-0003' });
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        makeQuoteRow({
          status: 'converted',
          converted_invoice_id: 'inv-789',
          sent_at: sentAt,
        }),
      ],
    });

    const result = await convertToInvoice('quote-uuid-1', 'user-1');

    expect(result!.invoice.id).toBe('inv-789');
    expect(result!.quote.status).toBe('converted');
    expect(result!.quote.sent_at).toBe(sentAt.toISOString());

    const updateSql = mockDbQuery.mock.calls[1][0] as string;
    expect(updateSql).not.toMatch(/sent_at\s*=/);
  });

  it('converts a sent quote to an invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow({ status: 'sent' })] });
    mockCreateInvoice.mockResolvedValueOnce({ id: 'inv-456', invoiceNumber: 'INV-0002' });
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'converted', converted_invoice_id: 'inv-456' })],
    });

    const result = await convertToInvoice('quote-uuid-1', 'user-1');
    expect(result!.invoice.id).toBe('inv-456');
  });

  it('returns null when quote not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await convertToInvoice('nonexistent', 'user-1');
    expect(result).toBeNull();
  });

  it('throws QUOTE_NOT_CONVERTIBLE for a draft quote', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow({ status: 'draft' })] });

    await expect(convertToInvoice('quote-uuid-1', 'user-1'))
      .rejects.toMatchObject({ code: 'QUOTE_NOT_CONVERTIBLE' });
  });

  it('throws QUOTE_NOT_CONVERTIBLE for a declined quote', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeQuoteRow({ status: 'declined' })] });

    await expect(convertToInvoice('quote-uuid-1', 'user-1'))
      .rejects.toMatchObject({ code: 'QUOTE_NOT_CONVERTIBLE' });
  });

  it('throws QUOTE_ALREADY_CONVERTED when quote was already converted', async () => {
    // Status must be 'accepted' or 'sent' to pass the first guard,
    // but convertedInvoiceId already set to simulate prior conversion
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeQuoteRow({ status: 'accepted', converted_invoice_id: 'inv-existing' })],
    });

    await expect(convertToInvoice('quote-uuid-1', 'user-1'))
      .rejects.toMatchObject({ code: 'QUOTE_ALREADY_CONVERTED' });
  });
});

// ===========================================================================
// getQuoteStats
// ===========================================================================

describe('getQuoteStats', () => {
  it('returns aggregate quote statistics for a user', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        total: '12',
        pending: '3',
        pending_amount: '45000',
        accepted: '4',
        this_month: '5',
      }],
    });

    const stats = await getQuoteStats('user-1');

    expect(stats.total).toBe(12);
    expect(stats.pending).toBe(3);
    expect(stats.pendingAmount).toBe(45000);
    expect(stats.accepted).toBe(4);
    expect(stats.thisMonth).toBe(5);
  });

  it('returns zeros when user has no quotes', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        total: '0',
        pending: '0',
        pending_amount: '0',
        accepted: '0',
        this_month: '0',
      }],
    });

    const stats = await getQuoteStats('user-1');

    expect(stats.total).toBe(0);
    expect(stats.pendingAmount).toBe(0);
  });
});
