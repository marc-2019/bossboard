/**
 * PDF Generation Service Tests
 *
 * Covers the primary customer-facing deliverable: invoice and quote PDFs.
 *
 * Strategy: pdfkit is mocked to capture every doc.text() call rather than
 * parsing the binary PDF output. The mock emits a minimal %PDF buffer so
 * the Promise resolves, and all text written by the service is captured in
 * mockTextCalls for assertion.
 *
 * Tested:
 *   - generateInvoicePDF(): returns non-empty Buffer starting with %PDF
 *   - generateQuotePDF():   returns non-empty Buffer starting with %PDF
 *   - formatCurrency() (private helper): cents → "$X.XX" NZD strings
 *   - formatDate() (private helper): DD/MM/YYYY, null dueDate, valid dates
 *   - Optional fields: bank details, notes, company info present/absent
 *   - Edge cases: zero line items, many line items (pagination), minimal fields
 */

// ---------------------------------------------------------------------------
// Mock pdfkit — must declare before imports (jest hoisting)
// Variable MUST start with 'mock' for jest to allow use inside jest.mock()
// ---------------------------------------------------------------------------

const mockTextCalls: string[] = [];

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    // Chainable helpers used in stroke/fill chains
    const strokeable = { stroke: (): void => undefined };
    const lineWidthable = { lineWidth: (): typeof strokeable => strokeable };
    const lineable = { lineTo: (): typeof lineWidthable => lineWidthable };
    const fillable = { fill: (): typeof doc => doc };

    const doc: Record<string, unknown> = {
      // pdfkit properties read by the service
      page: {
        width: 595.28,
        height: 841.89,
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      },
      y: 100,

      // Event emitter
      on(event: string, cb: (...args: unknown[]) => void) {
        (handlers[event] ??= []).push(cb);
        return doc;
      },

      // Finalise: emit a minimal valid PDF buffer then fire 'end'
      end() {
        const minPdf = Buffer.from('%PDF-1.3\n%%EOF\n');
        (handlers['data'] ?? []).forEach(cb => cb(minPdf));
        (handlers['end'] ?? []).forEach(cb => cb());
      },

      // The primary assertion target — captures every string written to the PDF
      text(str: unknown) {
        if (typeof str === 'string') mockTextCalls.push(str);
        return doc;
      },

      // Drawing / style API — all return doc for method chaining
      fontSize: () => doc,
      font: () => doc,
      fill: () => doc,
      moveDown: () => doc,
      moveTo: () => lineable,
      rect: () => fillable,
      addPage: () => doc,
      widthOfString: () => 100,
      currentLineHeight: () => 14,
    };
    return doc;
  });
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateInvoicePDF, generateQuotePDF, generateSWMSPDF } from '../../services/pdf.js';
import type { SWMSPdfInput } from '../../services/pdf.js';
import type { Invoice, Quote, InvoiceLineItem } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLineItem(overrides: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: 'item-1',
    description: 'Labour - 2 hours',
    amount: 15000,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-uuid-1',
    userId: 'user-1',
    invoiceNumber: 'INV-001',
    clientName: 'Test Client',
    clientEmail: 'client@example.com',
    clientPhone: '021 000 0000',
    swmsId: null,
    jobDescription: 'Plumbing repair',
    lineItems: [makeLineItem()],
    subtotal: 15000,
    gstAmount: 1957,
    total: 16957,
    status: 'sent',
    dueDate: '2026-05-01',
    paidAt: null,
    bankAccountName: 'Test Tradie',
    bankAccountNumber: '12-3456-7890123-00',
    notes: 'Thank you for your business.',
    customerId: null,
    recurringInvoiceId: null,
    includeGst: true,
    intlBankAccountName: null,
    intlIban: null,
    intlSwiftBic: null,
    intlBankName: null,
    intlBankAddress: null,
    companyName: 'Test Co Ltd',
    companyAddress: '1 Main Street, Auckland',
    irdNumber: '123-456-789',
    gstNumber: '123-456-789',
    shareToken: null,
    paymentProvider: null,
    paymentReference: null,
    paymentLinkUrl: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-uuid-1',
    userId: 'user-1',
    quoteNumber: 'QTE-001',
    clientName: 'Quote Client',
    clientEmail: 'quote@example.com',
    clientPhone: null,
    customerId: null,
    jobDescription: 'Electrical work',
    lineItems: [makeLineItem({ description: 'Wiring install', amount: 50000 })],
    subtotal: 50000,
    gstAmount: 6522,
    total: 56522,
    includeGst: true,
    status: 'draft',
    validUntil: '2026-05-31',
    convertedInvoiceId: null,
    bankAccountName: null,
    bankAccountNumber: null,
    intlBankAccountName: null,
    intlIban: null,
    intlSwiftBic: null,
    intlBankName: null,
    intlBankAddress: null,
    companyName: null,
    companyAddress: null,
    irdNumber: null,
    gstNumber: null,
    notes: null,
    createdAt: new Date('2026-04-10T00:00:00Z'),
    updatedAt: new Date('2026-04-10T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup — clear captured text before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockTextCalls.length = 0;
});

// ===========================================================================
// generateInvoicePDF — buffer validity
// ===========================================================================

describe('generateInvoicePDF', () => {
  it('resolves to a non-empty Buffer', async () => {
    const buf = await generateInvoicePDF(makeInvoice());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('starts with PDF magic bytes (%PDF)', async () => {
    const buf = await generateInvoicePDF(makeInvoice());
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });
});

// ===========================================================================
// generateSWMSPDF — Safe Work Method Statement PDF (F-COMP-04)
// ===========================================================================

function makeSWMS(overrides: Partial<SWMSPdfInput> = {}): SWMSPdfInput {
  return {
    id: 'swms-uuid-1',
    title: 'Electrical Rewire — 12 Queen St',
    trade_type: 'electrician',
    status: 'draft',
    job_description: 'Full rewire of a two-storey villa',
    site_address: '12 Queen St, Auckland',
    client_name: 'Jane Client',
    expected_duration: '3 days',
    hazards: [
      {
        id: 'h1',
        hazard: 'Electric shock from live conductors',
        risk_level: 'high',
        control_measures: ['Isolate and lock out the circuit', 'Test for dead before work'],
        ppe_required: ['Insulated gloves'],
      },
    ],
    ppe_required: ['Safety boots', 'Hi-vis vest'],
    emergency_procedures: ['Call 111 for emergencies', 'First aid kit on site'],
    signatures: [],
    created_at: new Date('2026-04-01T00:00:00Z'),
    updated_at: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

describe('generateSWMSPDF', () => {
  it('resolves to a non-empty Buffer starting with %PDF', async () => {
    const buf = await generateSWMSPDF(makeSWMS());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('writes the document title banner and hazard text', async () => {
    await generateSWMSPDF(makeSWMS());
    expect(mockTextCalls).toContain('SAFE WORK METHOD STATEMENT');
    expect(mockTextCalls.some(t => t.includes('Electric shock from live conductors'))).toBe(true);
  });

  it('renders an explicit empty state when there are no hazards', async () => {
    await generateSWMSPDF(makeSWMS({ hazards: [] }));
    expect(mockTextCalls).toContain('No hazards recorded.');
  });

  it('shows "Not yet signed." when there are no signatures', async () => {
    await generateSWMSPDF(makeSWMS({ signatures: [] }));
    expect(mockTextCalls).toContain('Not yet signed.');
  });
});

// ===========================================================================
// generateInvoicePDF — formatCurrency (private helper tested via text calls)
// ===========================================================================

describe('generateInvoicePDF — currency formatting', () => {
  it('formats whole-dollar amounts as $X.00', async () => {
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ amount: 10000 })],
      subtotal: 10000,
      total: 10000,
      gstAmount: 0,
      includeGst: false,
    }));
    expect(mockTextCalls).toContain('$100.00');
  });

  it('formats cent amounts with two decimal places', async () => {
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ amount: 15099 })],
      subtotal: 15099,
      total: 15099,
      gstAmount: 0,
      includeGst: false,
    }));
    expect(mockTextCalls).toContain('$150.99');
  });

  it('formats zero cents as $0.00', async () => {
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ amount: 0, description: 'Free item' })],
      subtotal: 0,
      total: 0,
      gstAmount: 0,
      includeGst: false,
    }));
    expect(mockTextCalls).toContain('$0.00');
  });

  it('formats large amounts correctly', async () => {
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ amount: 1234567 })], // $12,345.67
      subtotal: 1234567,
      total: 1234567,
      gstAmount: 0,
      includeGst: false,
    }));
    expect(mockTextCalls).toContain('$12345.67');
  });

  it('includes GST amount when includeGst is true', async () => {
    // GST on $100 = $15.00; total = $115.00
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ amount: 10000 })],
      subtotal: 10000,
      gstAmount: 1500,
      total: 11500,
      includeGst: true,
    }));
    expect(mockTextCalls).toContain('$15.00');
    expect(mockTextCalls).toContain('$115.00');
  });

  it('does not emit GST line text when includeGst is false', async () => {
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ amount: 10000 })],
      subtotal: 10000,
      gstAmount: 0,
      total: 10000,
      includeGst: false,
    }));
    expect(mockTextCalls).not.toContain('GST (15%):');
  });
});

// ===========================================================================
// generateInvoicePDF — formatDate (private helper tested via text calls)
// ===========================================================================

describe('generateInvoicePDF — date formatting', () => {
  it('formats a valid Date object as DD/MM/YYYY', async () => {
    // Use a UTC date that resolves unambiguously; local time may shift the day.
    // We just verify the year appears correctly formatted.
    await generateInvoicePDF(makeInvoice({
      createdAt: new Date('2026-04-15T12:00:00Z'),
    }));
    // At least one text call should match the NZ date format for 2026
    const datePattern = /^\d{2}\/\d{2}\/2026$/;
    expect(mockTextCalls.some(t => datePattern.test(t))).toBe(true);
  });

  it('formats a valid due date string as DD/MM/YYYY', async () => {
    await generateInvoicePDF(makeInvoice({ dueDate: '2026-05-20' }));
    expect(mockTextCalls).toContain('20/05/2026');
  });

  it('omits the Due Date label when dueDate is null', async () => {
    await generateInvoicePDF(makeInvoice({ dueDate: null }));
    expect(mockTextCalls).not.toContain('Due Date:');
  });
});

// ===========================================================================
// generateInvoicePDF — text content (labels, names, numbers)
// ===========================================================================

describe('generateInvoicePDF — content', () => {
  it('includes the invoice number', async () => {
    await generateInvoicePDF(makeInvoice({ invoiceNumber: 'INV-9999' }));
    expect(mockTextCalls).toContain('INV-9999');
  });

  it('includes the client name', async () => {
    await generateInvoicePDF(makeInvoice({ clientName: 'Acme Corporation' }));
    expect(mockTextCalls).toContain('Acme Corporation');
  });

  it('includes the line item description', async () => {
    await generateInvoicePDF(makeInvoice({
      lineItems: [makeLineItem({ description: 'Roof repair materials' })],
    }));
    expect(mockTextCalls).toContain('Roof repair materials');
  });

  it('uppercases the invoice status', async () => {
    await generateInvoicePDF(makeInvoice({ status: 'sent' }));
    expect(mockTextCalls).toContain('SENT');
  });

  it('includes company name when provided', async () => {
    await generateInvoicePDF(makeInvoice({ companyName: 'Best Plumbers Ltd' }));
    expect(mockTextCalls).toContain('Best Plumbers Ltd');
  });

  it('includes IRD number when provided', async () => {
    await generateInvoicePDF(makeInvoice({ irdNumber: '111-222-333' }));
    expect(mockTextCalls.join(' ')).toContain('111-222-333');
  });

  it('includes notes when provided', async () => {
    await generateInvoicePDF(makeInvoice({ notes: 'Payment due in 7 days.' }));
    expect(mockTextCalls).toContain('Payment due in 7 days.');
  });

  it('includes the Notes: label when notes is provided', async () => {
    await generateInvoicePDF(makeInvoice({ notes: 'Some note' }));
    expect(mockTextCalls).toContain('Notes:');
  });

  it('omits the Notes: label when notes is null', async () => {
    await generateInvoicePDF(makeInvoice({ notes: null }));
    expect(mockTextCalls).not.toContain('Notes:');
  });
});

// ===========================================================================
// generateInvoicePDF — bank details
// ===========================================================================

describe('generateInvoicePDF — bank details', () => {
  it('includes Payment Details label when NZ bank account is present', async () => {
    await generateInvoicePDF(makeInvoice({
      bankAccountName: 'John Smith',
      bankAccountNumber: '02-0100-0123456-00',
    }));
    expect(mockTextCalls).toContain('Payment Details:');
  });

  it('includes the account name', async () => {
    await generateInvoicePDF(makeInvoice({
      bankAccountName: 'John Smith',
      bankAccountNumber: null,
    }));
    expect(mockTextCalls.join(' ')).toContain('John Smith');
  });

  it('omits Payment Details when no bank details provided', async () => {
    await generateInvoicePDF(makeInvoice({
      bankAccountName: null,
      bankAccountNumber: null,
      intlBankAccountName: null,
      intlIban: null,
    }));
    expect(mockTextCalls).not.toContain('Payment Details:');
  });

  it('includes International Payments label when intl bank is present', async () => {
    await generateInvoicePDF(makeInvoice({
      bankAccountName: null,
      bankAccountNumber: null,
      intlBankAccountName: 'Intl Corp',
      intlIban: 'GB29NWBK60161331926819',
    }));
    expect(mockTextCalls).toContain('International Payments:');
  });

  it('includes intl bank name when provided', async () => {
    await generateInvoicePDF(makeInvoice({
      bankAccountName: null,
      bankAccountNumber: null,
      intlBankAccountName: 'Intl Corp',
      intlBankName: 'NatWest',
    }));
    expect(mockTextCalls.join(' ')).toContain('NatWest');
  });
});

// ===========================================================================
// generateInvoicePDF — edge cases
// ===========================================================================

describe('generateInvoicePDF — edge cases', () => {
  it('handles zero line items without throwing', async () => {
    const buf = await generateInvoicePDF(makeInvoice({
      lineItems: [],
      subtotal: 0,
      gstAmount: 0,
      total: 0,
    }));
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('handles many line items (pagination path) without throwing', async () => {
    const buf = await generateInvoicePDF(makeInvoice({
      lineItems: Array.from({ length: 60 }, (_, i) =>
        makeLineItem({ id: `item-${i}`, description: `Task ${i + 1}`, amount: 500 })
      ),
      subtotal: 30000,
      gstAmount: 0,
      total: 30000,
      includeGst: false,
    }));
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('handles all-null optional fields without throwing', async () => {
    const minimal = makeInvoice({
      clientEmail: null,
      clientPhone: null,
      jobDescription: null,
      dueDate: null,
      bankAccountName: null,
      bankAccountNumber: null,
      intlBankAccountName: null,
      intlIban: null,
      intlSwiftBic: null,
      intlBankName: null,
      intlBankAddress: null,
      companyName: null,
      companyAddress: null,
      irdNumber: null,
      gstNumber: null,
      notes: null,
    });
    await expect(generateInvoicePDF(minimal)).resolves.toBeInstanceOf(Buffer);
  });
});

// ===========================================================================
// generateQuotePDF — buffer validity
// ===========================================================================

describe('generateQuotePDF', () => {
  it('resolves to a non-empty Buffer', async () => {
    const buf = await generateQuotePDF(makeQuote());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('starts with PDF magic bytes (%PDF)', async () => {
    const buf = await generateQuotePDF(makeQuote());
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('includes the quote number in the PDF', async () => {
    await generateQuotePDF(makeQuote({ quoteNumber: 'QTE-042' }));
    expect(mockTextCalls).toContain('QTE-042');
  });

  it('includes the client name in the PDF', async () => {
    await generateQuotePDF(makeQuote({ clientName: 'Big Build Ltd' }));
    expect(mockTextCalls).toContain('Big Build Ltd');
  });

  it('formats validUntil as DD/MM/YYYY via the due-date field', async () => {
    await generateQuotePDF(makeQuote({ validUntil: '2026-06-30' }));
    expect(mockTextCalls).toContain('30/06/2026');
  });

  it('handles null validUntil without throwing', async () => {
    const buf = await generateQuotePDF(makeQuote({ validUntil: null }));
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('handles zero line items without throwing', async () => {
    const buf = await generateQuotePDF(makeQuote({
      lineItems: [],
      subtotal: 0,
      gstAmount: 0,
      total: 0,
    }));
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('handles all-null optional fields without throwing', async () => {
    const minimal = makeQuote({
      clientEmail: null,
      clientPhone: null,
      jobDescription: null,
      validUntil: null,
      bankAccountName: null,
      bankAccountNumber: null,
      intlBankAccountName: null,
      intlIban: null,
      companyName: null,
      companyAddress: null,
      irdNumber: null,
      gstNumber: null,
      notes: null,
    });
    await expect(generateQuotePDF(minimal)).resolves.toBeInstanceOf(Buffer);
  });

  it('includes line item description in the PDF', async () => {
    await generateQuotePDF(makeQuote({
      lineItems: [makeLineItem({ description: 'Solar panel installation' })],
    }));
    expect(mockTextCalls).toContain('Solar panel installation');
  });
});
