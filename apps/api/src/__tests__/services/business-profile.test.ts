/**
 * Business Profile Service Tests
 *
 * Company/bank/invoice-default management. Covers:
 *   - getBusinessProfile: found (mobile shape) + not-found (null)
 *   - upsertBusinessProfile: explicit values, defaults (gst false, terms 20, prefix INV)
 *   - getBankDetailsForInvoice: found (typed shape) + not-found (null)
 */

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

import {
  getBusinessProfile,
  upsertBusinessProfile,
  getBankDetailsForInvoice,
} from '../../services/business-profile.js';

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bp-1',
    user_id: 'user-1',
    company_name: 'Acme Plumbing',
    trading_as: 'Acme',
    ird_number: '123-456-789',
    gst_number: '987-654-321',
    is_gst_registered: true,
    company_address: '1 Main St',
    company_phone: '021000000',
    company_email: 'acme@example.com',
    invoice_bcc_email: 'accounts@acme.example.com',
    bank_account_name: 'Acme Plumbing Ltd',
    bank_account_number: '12-3456-7890123-00',
    bank_name: 'ANZ',
    intl_bank_account_name: null,
    intl_iban: null,
    intl_swift_bic: null,
    intl_bank_name: null,
    intl_bank_address: null,
    intl_routing_number: null,
    default_payment_terms: 20,
    default_notes: 'Thanks for your business',
    invoice_prefix: 'INV',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe('getBusinessProfile', () => {
  it('returns the mobile snake_case shape when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await getBusinessProfile('user-1');
    expect(result?.company_name).toBe('Acme Plumbing');
    expect(result?.is_gst_registered).toBe(true);
    expect(result?.invoice_prefix).toBe('INV');
    expect(result?.invoice_bcc_email).toBe('accounts@acme.example.com');
  });

  it('returns null when no profile exists', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getBusinessProfile('user-1')).toBeNull();
  });
});

describe('upsertBusinessProfile', () => {
  it('passes explicit values through to the upsert', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });

    await upsertBusinessProfile('user-1', {
      companyName: 'Acme Plumbing',
      isGstRegistered: true,
      defaultPaymentTerms: 7,
      invoicePrefix: 'ACM',
    });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[1]).toBe('user-1');
    expect(params[2]).toBe('Acme Plumbing');
    expect(params[6]).toBe(true); // isGstRegistered
    expect(params[20]).toBe(7); // defaultPaymentTerms (index shifted by invoice_bcc_email)
    expect(params[22]).toBe('ACM'); // invoicePrefix
  });

  it('applies defaults for gst flag, payment terms, and prefix', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });

    await upsertBusinessProfile('user-1', { companyName: 'Solo Sparky' });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[6]).toBe(false); // isGstRegistered defaults false
    expect(params[20]).toBe(20); // defaultPaymentTerms defaults 20
    expect(params[22]).toBe('INV'); // invoicePrefix defaults INV
    expect(params[3]).toBeNull(); // tradingAs default null
  });

  it('returns the mobile shape from the returned row', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ company_name: 'Updated Co' })] });
    const result = await upsertBusinessProfile('user-1', { companyName: 'Updated Co' });
    expect(result.company_name).toBe('Updated Co');
    expect(result.user_id).toBe('user-1');
  });
});

describe('getBankDetailsForInvoice', () => {
  it('returns the typed bank-details shape when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await getBankDetailsForInvoice('user-1');
    expect(result).not.toBeNull();
    expect(result?.companyName).toBe('Acme Plumbing');
    expect(result?.bankAccountNumber).toBe('12-3456-7890123-00');
    expect(result?.defaultPaymentTerms).toBe(20);
    expect(result?.invoicePrefix).toBe('INV');
  });

  it('returns null when no profile exists', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getBankDetailsForInvoice('user-1')).toBeNull();
  });
});
