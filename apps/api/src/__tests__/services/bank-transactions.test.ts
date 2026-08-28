/**
 * Bank Transactions Service Tests
 *
 * Covers financial correctness paths:
 *   - parseBankCSV / uploadCSV: Wise, ANZ, ASB, BNZ formats; NZ dates; cents; invalid rows skipped
 *   - detectBankCsvFormat: header fingerprints
 *   - uploadCSV: duplicate detection (PG error 23505), batch ID assignment, format field
 *   - autoMatch: exact amount + invoice-number ref → high; exact amount + client name → high;
 *     exact amount only → medium; ~5% tolerance → low; no match → skipped; debit skipped
 *   - confirmMatch: reconciles transaction + marks invoice paid; not-found returns null
 *   - unmatchTransaction: clears match fields; not-found returns null
 *   - listTransactions: pagination, reconciled filter, date range, batchId filter
 *   - getTransactionSummary: aggregate counts and amounts
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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  uploadCSV,
  listTransactions,
  autoMatch,
  confirmMatch,
  unmatchTransaction,
  getTransactionSummary,
  detectBankCsvFormat,
  parseBankCSV,
} from '../../services/bank-transactions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal DB row that transformTransaction can hydrate */
function makeTxnRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'txn-uuid-1',
    user_id: 'user-1',
    transaction_id: 'wise-001',
    date: '2026-01-15',
    amount: 115000,       // $1,150.00 in cents
    currency: 'NZD',
    description: 'Client payment',
    payment_reference: 'INV-0001',
    running_balance: 500000,
    matched_invoice_id: null,
    match_confidence: 'none',
    is_reconciled: false,
    reconciled_at: null,
    upload_batch_id: 'batch-1',
    source_filename: 'wise_export.csv',
    created_at: new Date('2026-01-15'),
    updated_at: new Date('2026-01-15'),
    ...overrides,
  };
}

/** Minimal DB row for an invoice */
function makeInvRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'inv-uuid-1',
    invoice_number: 'INV-0001',
    client_name: 'Acme Ltd',
    total: 115000,
    status: 'sent',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CSV fixtures
// ---------------------------------------------------------------------------

const STANDARD_CSV = `TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance
wise-001,2026-01-15,1150.00,NZD,Client payment,INV-0001,5000.00
wise-002,2026-01-10,-50.00,NZD,Bank fee,,4950.00`;

const ALT_COLUMNS_CSV = `ID,Created On,Source Amount,Source Currency,Merchant,Reference,Balance
wise-003,15/01/2026,230.00,NZD,John Doe,INV-0002,1000.00`;

const NZ_DATE_SLASH_CSV = `TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance
wise-004,25/03/2026,500.00,NZD,Test,,2000.00`;

const NZ_DATE_DASH_CSV = `TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance
wise-005,25-03-2026,500.00,NZD,Test,,2000.00`;

const QUOTED_FIELDS_CSV = `TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance
wise-006,2026-02-01,"1,234.56",NZD,"Smith & Sons, Ltd","INV-0010",10000.00`;

const INVALID_AMOUNT_CSV = `TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance
wise-007,2026-01-01,N/A,NZD,Bad amount,,0`;

const INVALID_DATE_CSV = `TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance
wise-008,not-a-date,100.00,NZD,Bad date,,0`;

/** ASB FastNet Classic export shape (Date, Unique Id, Tran Type, Cheque Number, Payee, Memo, Amount) */
const ASB_CSV = `Date,Unique Id,Tran Type,Cheque Number,Payee,Memo,Amount
15/01/2026,asb-uid-001,D/C,,Acme Ltd,INV-0001,1150.00
10/01/2026,asb-uid-002,FEE,,ASB,Monthly fee,-5.00`;

/** ANZ NZ classic accounting CSV (Type, Details, Particulars, Code, Reference, Amount, Date, ...) */
const ANZ_CSV = `Type,Details,Particulars,Code,Reference,Amount,Date,ForeignCurrencyAmount,ConversionCharge
,TFR CREDIT,ACME LTD,INV-0001,INV-0001,2300.00,25/03/2026,,
,POS,COFFEE SHOP,,, -12.50,24/03/2026,,`;

/**
 * BNZ internet banking / business export shape
 * Date,Amount,Payee,Particulars,Code,Reference,Tran Type,This Party Account,Other Party Account,Serial,...
 */
const BNZ_CSV = `Date,Amount,Payee,Particulars,Code,Reference,Tran Type,This Party Account,Other Party Account,Serial,Transaction Code,Batch Number,Originating Bank/Branch,Processed Date
15/01/2026,1150.00,Acme Ltd,INV-0001,,INV-0001,D/C,12-3456-7890123-00,01-2345-6789012-00,bnz-serial-001,50,,BNZ,15/01/2026
10/01/2026,-9.50,BNZ,Monthly fee,,,FEE,12-3456-7890123-00,,bnz-serial-002,20,,BNZ,10/01/2026`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// detectBankCsvFormat / parseBankCSV — multi-format detection
// ===========================================================================

describe('detectBankCsvFormat', () => {
  it('detects Wise from TransferWise ID header', () => {
    expect(
      detectBankCsvFormat(
        'TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance'
      )
    ).toBe('wise');
  });

  it('detects ASB from Unique Id + Tran Type + Amount', () => {
    expect(
      detectBankCsvFormat(
        'Date,Unique Id,Tran Type,Cheque Number,Payee,Memo,Amount'
      )
    ).toBe('asb');
  });

  it('detects ANZ from Type/Details/Particulars/Amount/Date', () => {
    expect(
      detectBankCsvFormat(
        'Type,Details,Particulars,Code,Reference,Amount,Date,ForeignCurrencyAmount,ConversionCharge'
      )
    ).toBe('anz');
  });

  it('detects BNZ from Date/Amount/Particulars/Tran Type/Serial party fields', () => {
    expect(
      detectBankCsvFormat(
        'Date,Amount,Payee,Particulars,Code,Reference,Tran Type,This Party Account,Other Party Account,Serial,Transaction Code,Batch Number,Originating Bank/Branch,Processed Date'
      )
    ).toBe('bnz');
  });

  it('falls back to generic for simple Date/Amount headers', () => {
    expect(detectBankCsvFormat('Date,Amount,Description')).toBe('generic');
  });
});

describe('parseBankCSV', () => {
  it('parses ASB fixture with NZ dates, cents, and unique ids', () => {
    const { format, transactions } = parseBankCSV(ASB_CSV);
    expect(format).toBe('asb');
    expect(transactions).toHaveLength(2);

    expect(transactions[0].transactionId).toBe('asb-uid-001');
    expect(transactions[0].date).toBe('2026-01-15');
    expect(transactions[0].amount).toBe(115000);
    expect(transactions[0].currency).toBe('NZD');
    expect(transactions[0].description).toContain('Acme Ltd');
    expect(transactions[0].paymentReference).toBe('INV-0001');

    expect(transactions[1].amount).toBe(-500);
    expect(transactions[1].date).toBe('2026-01-10');
  });

  it('parses ANZ fixture with signed amounts and content-hash ids when missing', () => {
    const { format, transactions } = parseBankCSV(ANZ_CSV);
    expect(format).toBe('anz');
    expect(transactions).toHaveLength(2);

    expect(transactions[0].date).toBe('2026-03-25');
    expect(transactions[0].amount).toBe(230000);
    expect(transactions[0].paymentReference).toBe('INV-0001');
    expect(transactions[0].description).toMatch(/TFR CREDIT/i);
    expect(transactions[0].transactionId).toMatch(/^[a-f0-9]{32}$/);
    expect(transactions[0].currency).toBe('NZD');

    expect(transactions[1].date).toBe('2026-03-24');
    expect(transactions[1].amount).toBe(-1250);
  });

  it('still parses Wise standard CSV as wise', () => {
    const { format, transactions } = parseBankCSV(STANDARD_CSV);
    expect(format).toBe('wise');
    expect(transactions).toHaveLength(2);
    expect(transactions[0].amount).toBe(115000);
    expect(transactions[0].transactionId).toBe('wise-001');
  });

  it('parses BNZ fixture with NZ dates, cents, serial ids, and invoice ref', () => {
    const { format, transactions } = parseBankCSV(BNZ_CSV);
    expect(format).toBe('bnz');
    expect(transactions).toHaveLength(2);

    expect(transactions[0].transactionId).toBe('bnz-serial-001');
    expect(transactions[0].date).toBe('2026-01-15');
    expect(transactions[0].amount).toBe(115000);
    expect(transactions[0].currency).toBe('NZD');
    expect(transactions[0].paymentReference).toBe('INV-0001');
    expect(transactions[0].description).toMatch(/Acme Ltd/i);

    expect(transactions[1].transactionId).toBe('bnz-serial-002');
    expect(transactions[1].amount).toBe(-950);
    expect(transactions[1].date).toBe('2026-01-10');
  });
});

// ===========================================================================
// uploadCSV — CSV parsing and import
// ===========================================================================

describe('uploadCSV', () => {
  it('parses standard Wise CSV and inserts all valid rows', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] }); // INSERT succeeds

    const result = await uploadCSV('user-1', STANDARD_CSV, 'wise_export.csv');

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.batchId).toBe('mock-uuid');
    expect(result.format).toBe('wise');
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('imports ASB CSV and reports format asb', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await uploadCSV('user-1', ASB_CSV, 'asb_export.csv');

    expect(result.format).toBe('asb');
    expect(result.imported).toBe(2);

    const creditParams = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(creditParams[2]).toBe('asb-uid-001'); // transaction_id
    expect(creditParams[3]).toBe('2026-01-15');
    expect(creditParams[4]).toBe(115000);
    expect(creditParams[5]).toBe('NZD');
    expect(creditParams[7]).toBe('INV-0001');
  });

  it('imports BNZ CSV and reports format bnz', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await uploadCSV('user-1', BNZ_CSV, 'bnz_export.csv');

    expect(result.format).toBe('bnz');
    expect(result.imported).toBe(2);

    const creditParams = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(creditParams[2]).toBe('bnz-serial-001');
    expect(creditParams[3]).toBe('2026-01-15');
    expect(creditParams[4]).toBe(115000);
    expect(creditParams[5]).toBe('NZD');
    expect(creditParams[7]).toBe('INV-0001');
  });

  it('imports ANZ CSV with cents and NZ date normalisation', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await uploadCSV('user-1', ANZ_CSV, 'anz_export.csv');

    expect(result.format).toBe('anz');
    expect(result.imported).toBe(2);

    const creditParams = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(creditParams[3]).toBe('2026-03-25');
    expect(creditParams[4]).toBe(230000);
    expect(creditParams[7]).toBe('INV-0001');
    // Content-hash transaction_id when bank omits id
    expect(String(creditParams[2])).toMatch(/^[a-f0-9]{32}$/);
  });

  it('inserts correct field values including cents conversion', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    await uploadCSV('user-1', STANDARD_CSV, 'wise_export.csv');

    // First INSERT: $1,150.00 → 115000 cents, running balance $5000 → 500000
    const firstCall = mockDbQuery.mock.calls[0];
    const params = firstCall[1] as unknown[];
    expect(params[4]).toBe(115000);    // amount
    expect(params[5]).toBe('NZD');     // currency
    expect(params[6]).toBe('Client payment'); // description
    expect(params[7]).toBe('INV-0001');       // payment_reference
    expect(params[8]).toBe(500000);    // running_balance
    expect(params[9]).toBe('mock-uuid'); // batchId
    expect(params[10]).toBe('wise_export.csv'); // filename
  });

  it('parses alternative Wise column names', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await uploadCSV('user-1', ALT_COLUMNS_CSV, 'alt.csv');
    expect(result.imported).toBe(1);

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe(23000); // $230.00 → 23000 cents
    expect(params[5]).toBe('NZD');
  });

  it('normalises NZ date format DD/MM/YYYY to YYYY-MM-DD', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    await uploadCSV('user-1', NZ_DATE_SLASH_CSV, 'nz.csv');

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('2026-03-25'); // date
  });

  it('normalises NZ date format DD-MM-YYYY to YYYY-MM-DD', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    await uploadCSV('user-1', NZ_DATE_DASH_CSV, 'nz2.csv');

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('2026-03-25');
  });

  it('parses quoted fields including amounts with commas', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    await uploadCSV('user-1', QUOTED_FIELDS_CSV, 'quoted.csv');
    expect(mockDbQuery).toHaveBeenCalledTimes(1);

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe(123456); // $1,234.56 → 123456 cents
    expect(params[6]).toBe('Smith & Sons, Ltd');
    expect(params[7]).toBe('INV-0010');
  });

  it('skips rows with invalid amounts', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await uploadCSV('user-1', INVALID_AMOUNT_CSV, 'bad.csv');
    expect(result.imported).toBe(0);
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('skips rows with unparseable dates', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });

    const result = await uploadCSV('user-1', INVALID_DATE_CSV, 'bad.csv');
    expect(result.imported).toBe(0);
  });

  it('returns 0 rows for empty CSV (header only)', async () => {
    const headerOnly = 'TransferWise ID,Date,Amount,Currency\n';
    const result = await uploadCSV('user-1', headerOnly, 'empty.csv');
    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(0);
  });

  it('returns 0 rows for CSV with just a header line and no data', async () => {
    const result = await uploadCSV('user-1', 'Date,Amount,Currency', 'no-data.csv');
    expect(result.imported).toBe(0);
  });

  it('counts duplicate transactions (PG unique constraint 23505)', async () => {
    const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // first row succeeds
      .mockRejectedValueOnce(dupError);    // second row is duplicate

    const result = await uploadCSV('user-1', STANDARD_CSV, 'wise_export.csv');

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it('re-throws non-duplicate database errors', async () => {
    const dbError = Object.assign(new Error('connection error'), { code: '08000' });
    mockDbQuery.mockRejectedValueOnce(dbError);

    await expect(uploadCSV('user-1', STANDARD_CSV, 'wise_export.csv')).rejects.toThrow(
      'connection error'
    );
  });
});

// ===========================================================================
// autoMatch — match confidence scoring
// ===========================================================================

describe('autoMatch', () => {
  it('assigns HIGH confidence when amount matches AND reference contains invoice number', async () => {
    const txn = makeTxnRow({
      payment_reference: 'INV-0001 payment',
      amount: 115000,
    });
    const inv = makeInvRow({ total: 115000 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn] }) // unreconciled transactions
      .mockResolvedValueOnce({ rows: [inv] }) // outstanding invoices
      .mockResolvedValueOnce({ rows: [] });   // UPDATE

    const result = await autoMatch('user-1');

    expect(result.matched).toBe(1);
    expect(result.suggestions[0].confidence).toBe('high');
    expect(mockDbQuery.mock.calls[2][1]).toContain('high');
  });

  it('assigns HIGH confidence when amount matches AND description contains invoice number', async () => {
    const txn = makeTxnRow({
      payment_reference: null,
      description: 'payment for inv-0001',
      amount: 115000,
    });
    const inv = makeInvRow({ total: 115000 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn] })
      .mockResolvedValueOnce({ rows: [inv] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await autoMatch('user-1');
    expect(result.suggestions[0].confidence).toBe('high');
  });

  it('assigns HIGH confidence when amount matches AND description contains client name', async () => {
    const txn = makeTxnRow({
      payment_reference: 'ref-xyz',
      description: 'payment from acme ltd',
      amount: 115000,
    });
    const inv = makeInvRow({ total: 115000, client_name: 'Acme Ltd' });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn] })
      .mockResolvedValueOnce({ rows: [inv] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await autoMatch('user-1');
    expect(result.suggestions[0].confidence).toBe('high');
  });

  it('assigns MEDIUM confidence when only amount matches (no reference clues)', async () => {
    const txn = makeTxnRow({
      payment_reference: 'random-ref',
      description: 'unrelated',
      amount: 115000,
    });
    const inv = makeInvRow({ total: 115000 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn] })
      .mockResolvedValueOnce({ rows: [inv] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await autoMatch('user-1');
    expect(result.suggestions[0].confidence).toBe('medium');
  });

  it('assigns LOW confidence when amount is within 5% of invoice total', async () => {
    // Invoice is $1,150 = 115000 cents; transaction is $1,100 = 110000 cents
    // diff = 5000, threshold = 115000 * 0.05 = 5750 → within threshold
    const txn = makeTxnRow({ amount: 110000, payment_reference: null, description: null });
    const inv = makeInvRow({ total: 115000 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn] })
      .mockResolvedValueOnce({ rows: [inv] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await autoMatch('user-1');
    expect(result.suggestions[0].confidence).toBe('low');
  });

  it('does not match when amount difference exceeds 5%', async () => {
    // Invoice $1,150 = 115000; transaction $1,000 = 100000; diff = 15000 > 5750 threshold
    const txn = makeTxnRow({ amount: 100000, payment_reference: null, description: null });
    const inv = makeInvRow({ total: 115000 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn] })
      .mockResolvedValueOnce({ rows: [inv] });

    const result = await autoMatch('user-1');
    expect(result.matched).toBe(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('skips debit (negative amount) transactions', async () => {
    // Debits are filtered out by the SQL query (amount > 0), so if db returns nothing we get 0
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // no positive transactions
      .mockResolvedValueOnce({ rows: [makeInvRow()] });

    const result = await autoMatch('user-1');
    expect(result.matched).toBe(0);
  });

  it('returns zero matches when there are no outstanding invoices', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeTxnRow()] })
      .mockResolvedValueOnce({ rows: [] }); // no invoices

    const result = await autoMatch('user-1');
    expect(result.matched).toBe(0);
  });

  it('handles multiple transactions and invoices, choosing best match per transaction', async () => {
    const txn1 = makeTxnRow({ id: 'txn-1', amount: 50000 });
    const txn2 = makeTxnRow({ id: 'txn-2', amount: 100000, payment_reference: 'INV-0002' });
    const inv1 = makeInvRow({ id: 'inv-1', invoice_number: 'INV-0001', total: 50000 });
    const inv2 = makeInvRow({ id: 'inv-2', invoice_number: 'INV-0002', total: 100000 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [txn1, txn2] })
      .mockResolvedValueOnce({ rows: [inv1, inv2] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE txn1
      .mockResolvedValueOnce({ rows: [] }); // UPDATE txn2

    const result = await autoMatch('user-1');
    expect(result.matched).toBe(2);
    // txn2 has invoice number in reference → high confidence
    const txn2Match = result.suggestions.find((s) => s.transaction_id === 'txn-2');
    expect(txn2Match!.confidence).toBe('high');
  });
});

// ===========================================================================
// confirmMatch — reconciliation state transitions
// ===========================================================================

describe('confirmMatch', () => {
  it('marks transaction as reconciled and invoice as paid', async () => {
    const reconciledTxn = makeTxnRow({
      is_reconciled: true,
      match_confidence: 'confirmed',
      reconciled_at: new Date(),
      matched_invoice_id: 'inv-uuid-1',
    });

    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [makeTxnRow({ matched_invoice_id: 'inv-uuid-1' })] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // UPDATE bank_transactions → reconciled
      .mockResolvedValueOnce({ rows: [] }) // UPDATE invoices → paid
      .mockResolvedValueOnce({ rows: [reconciledTxn] }); // SELECT updated transaction

    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const result = await confirmMatch('txn-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!['is_reconciled']).toBe(true);
    expect(result!['match_confidence']).toBe('confirmed');
    expect(result!['reconciled_at']).not.toBeNull();

    // Invoice update should use correct params
    const invoiceUpdate = mockClientQuery.mock.calls[2];
    expect(invoiceUpdate[0]).toContain("status = 'paid'");
    expect(invoiceUpdate[1]).toContain('inv-uuid-1');
    expect(invoiceUpdate[1]).toContain('user-1');
  });

  it("only confirms invoices in 'sent' or 'overdue' status", async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [makeTxnRow({ matched_invoice_id: 'inv-uuid-1' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [makeTxnRow({ is_reconciled: true, match_confidence: 'confirmed' })] });

    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    await confirmMatch('txn-uuid-1', 'user-1');

    const invoiceUpdateSql = mockClientQuery.mock.calls[2][0] as string;
    expect(invoiceUpdateSql).toContain("status IN ('sent', 'overdue')");
  });

  it('returns null when transaction not found or has no match', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] }); // no transaction with that ID + userId + matched_invoice_id

    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const result = await confirmMatch('missing-txn', 'user-1');
    expect(result).toBeNull();
  });

  it('returns null when transaction belongs to another user', async () => {
    const mockClientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] });

    mockDbTransaction.mockImplementationOnce(async (cb: any) => cb({ query: mockClientQuery }));

    const result = await confirmMatch('txn-uuid-1', 'different-user');
    expect(result).toBeNull();
    // Should not attempt any UPDATE
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// unmatchTransaction — clearing reconciliation state
// ===========================================================================

describe('unmatchTransaction', () => {
  it('clears match fields and returns updated transaction in mobile format', async () => {
    const unmatchedRow = makeTxnRow({
      matched_invoice_id: null,
      match_confidence: 'none',
      is_reconciled: false,
      reconciled_at: null,
    });

    mockDbQuery.mockResolvedValueOnce({ rows: [unmatchedRow] });

    const result = await unmatchTransaction('txn-uuid-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!['matched_invoice_id']).toBeNull();
    expect(result!['match_confidence']).toBe('none');
    expect(result!['is_reconciled']).toBe(false);
    expect(result!['reconciled_at']).toBeNull();

    // SQL should clear all four fields
    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toContain('matched_invoice_id = NULL');
    expect(sql).toContain("match_confidence = 'none'");
    expect(sql).toContain('is_reconciled = false');
    expect(sql).toContain('reconciled_at = NULL');
    expect(params).toContain('txn-uuid-1');
    expect(params).toContain('user-1');
  });

  it('returns null when transaction not found or belongs to another user', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await unmatchTransaction('missing', 'user-1');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// listTransactions — pagination and filtering
// ===========================================================================

describe('listTransactions', () => {
  it('returns paginated list with total count', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [makeTxnRow(), makeTxnRow({ id: 'txn-2' })] });

    const result = await listTransactions('user-1');

    expect(result.total).toBe(10);
    expect(result.transactions).toHaveLength(2);
    // Results are in mobile snake_case format
    expect(result.transactions[0]['transaction_id']).toBe('wise-001');
    expect(result.transactions[0]['is_reconciled']).toBe(false);
  });

  it('uses default limit 50 and offset 0', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listTransactions('user-1');

    const selectParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(selectParams).toContain(50);
    expect(selectParams).toContain(0);
  });

  it('filters by isReconciled = true', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listTransactions('user-1', { isReconciled: true });

    const countSql = mockDbQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('is_reconciled');
    const countParams = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(countParams).toContain(true);
  });

  it('filters by date range', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listTransactions('user-1', { startDate: '2026-01-01', endDate: '2026-01-31' });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('2026-01-01');
    expect(params).toContain('2026-01-31');
  });

  it('filters by batchId', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listTransactions('user-1', { batchId: 'batch-abc' });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('batch-abc');
  });

  it('applies custom limit and offset', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listTransactions('user-1', { limit: 10, offset: 20 });

    const selectParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(selectParams).toContain(10);
    expect(selectParams).toContain(20);
  });

  it('returns empty list when user has no transactions', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listTransactions('user-1');
    expect(result.total).toBe(0);
    expect(result.transactions).toHaveLength(0);
  });
});

// ===========================================================================
// getTransactionSummary — aggregate statistics
// ===========================================================================

describe('getTransactionSummary', () => {
  it('returns parsed aggregate counts and amounts', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        total: '20',
        reconciled: '15',
        unreconciled: '5',
        total_credits: '500000',
        total_debits: '-25000',
      }],
    });

    const summary = await getTransactionSummary('user-1');

    expect(summary.total).toBe(20);
    expect(summary.reconciled).toBe(15);
    expect(summary.unreconciled).toBe(5);
    expect(summary.total_credits).toBe(500000);
    expect(summary.total_debits).toBe(-25000);
  });

  it('returns zeroes when user has no transactions', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        total: '0',
        reconciled: '0',
        unreconciled: '0',
        total_credits: '0',
        total_debits: '0',
      }],
    });

    const summary = await getTransactionSummary('user-1');
    expect(summary.total).toBe(0);
    expect(summary.total_credits).toBe(0);
    expect(summary.total_debits).toBe(0);
  });

  it('queries only for the given user', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ total: '0', reconciled: '0', unreconciled: '0', total_credits: '0', total_debits: '0' }],
    });

    await getTransactionSummary('user-specific');

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params).toEqual(['user-specific']);
  });
});
