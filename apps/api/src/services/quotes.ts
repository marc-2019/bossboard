/**
 * Quotes Service
 * Quote/estimate creation, management, and conversion to invoices
 */

import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import {
  Quote,
  QuoteStatus,
  QuoteCreateInput,
  QuoteUpdateInput,
  InvoiceLineItem,
} from '../types/index.js';
import { createError } from '../middleware/error.js';
import { getBankDetailsForInvoice } from './business-profile.js';
import { createInvoice } from './invoices.js';
import { decryptField } from '../utils/field-crypto.js';

const GST_RATE = 0.15; // NZ GST rate

/**
 * Generate next quote number for user using business profile prefix
 * (e.g., QTE-0001, QTE-0002)
 */
export async function getNextQuoteNumber(userId: string): Promise<string> {
  return db.transaction(async (client) => {
    // Get prefix from business profile (defaults to 'QTE' for quotes)
    const profileResult = await client.query<{ invoice_prefix: string }>(
      'SELECT invoice_prefix FROM business_profiles WHERE user_id = $1',
      [userId]
    );
    // Use QTE prefix instead of invoice prefix for quotes
    const basePrefix = profileResult.rows.length > 0
      ? profileResult.rows[0].invoice_prefix
      : 'INV';
    const prefix = basePrefix.replace(/^INV/, 'QTE') === basePrefix
      ? 'QTE' // If prefix doesn't start with INV, just use QTE
      : basePrefix.replace(/^INV/, 'QTE');

    // Get the highest existing quote number with FOR UPDATE to prevent race conditions
    // Note: FOR UPDATE cannot be used with aggregate functions (MAX), so we select the actual row
    const result = await client.query<{ quote_number: string }>(
      `SELECT quote_number FROM quotes WHERE user_id = $1 ORDER BY quote_number DESC LIMIT 1 FOR UPDATE`,
      [userId]
    );

    let nextNum = 1;
    const maxNum = result.rows.length > 0 ? result.rows[0].quote_number : null;
    if (maxNum) {
      // Extract the numeric portion after the prefix (e.g., "QTE-0042" -> 42)
      const match = maxNum.match(/-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  });
}

/**
 * Calculate quote totals from line items
 */
function calculateTotals(
  lineItems: { description: string; amount: number }[],
  includeGst: boolean = true
): { subtotal: number; gstAmount: number; total: number } {
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gstAmount = includeGst ? Math.round(subtotal * GST_RATE) : 0;
  const total = subtotal + gstAmount;
  return { subtotal, gstAmount, total };
}

/**
 * Create a new quote
 * Auto-populates bank details and company info from business profile if not provided
 */
export async function createQuote(
  userId: string,
  input: QuoteCreateInput
): Promise<Quote> {
  const quoteNumber = await getNextQuoteNumber(userId);
  const quoteId = uuidv4();

  // Auto-populate from business profile if bank/company details not provided
  let bankAccountName = input.bankAccountName || null;
  let bankAccountNumber = input.bankAccountNumber || null;
  let intlBankAccountName = input.intlBankAccountName || null;
  let intlIban = input.intlIban || null;
  let intlSwiftBic = input.intlSwiftBic || null;
  let intlBankName = input.intlBankName || null;
  let intlBankAddress = input.intlBankAddress || null;
  let companyName = input.companyName || null;
  let companyAddress = input.companyAddress || null;
  let irdNumber = input.irdNumber || null;
  let gstNumber = input.gstNumber || null;
  let includeGst = input.includeGst;

  // If no bank details provided, try to fetch from business profile
  if (!bankAccountName && !bankAccountNumber) {
    try {
      const profileDetails = await getBankDetailsForInvoice(userId);
      if (profileDetails) {
        bankAccountName = bankAccountName || profileDetails.bankAccountName;
        bankAccountNumber = bankAccountNumber || profileDetails.bankAccountNumber;
        intlBankAccountName = intlBankAccountName || profileDetails.intlBankAccountName;
        intlIban = intlIban || profileDetails.intlIban;
        intlSwiftBic = intlSwiftBic || profileDetails.intlSwiftBic;
        intlBankName = intlBankName || profileDetails.intlBankName;
        intlBankAddress = intlBankAddress || profileDetails.intlBankAddress;
        companyName = companyName || profileDetails.companyName;
        companyAddress = companyAddress || profileDetails.companyAddress;
        irdNumber = irdNumber || profileDetails.irdNumber;
        gstNumber = gstNumber || profileDetails.gstNumber;
        // Use profile's GST registration as default if not specified
        if (includeGst === undefined) {
          includeGst = profileDetails.isGstRegistered;
        }
      }
    } catch {
      // Business profile not set up yet — continue without auto-populate
    }
  }

  // Default includeGst to true if still not set
  if (includeGst === undefined) {
    includeGst = true;
  }

  // Add IDs to line items
  const lineItems: InvoiceLineItem[] = input.lineItems.map((item) => ({
    id: uuidv4(),
    description: item.description,
    amount: item.amount,
  }));

  // Calculate totals
  const { subtotal, gstAmount, total } = calculateTotals(
    input.lineItems,
    includeGst
  );

  const result = await db.query(
    `INSERT INTO quotes (
      id, user_id, quote_number,
      client_name, client_email, client_phone,
      customer_id, job_description,
      line_items, subtotal, gst_amount, total,
      status, valid_until, include_gst,
      bank_account_name, bank_account_number, notes,
      intl_bank_account_name, intl_iban, intl_swift_bic,
      intl_bank_name, intl_bank_address,
      company_name, company_address, ird_number, gst_number
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft',
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
            $23, $24, $25, $26)
    RETURNING *`,
    [
      quoteId,
      userId,
      quoteNumber,
      input.clientName,
      input.clientEmail || null,
      input.clientPhone || null,
      input.customerId || null,
      input.jobDescription || null,
      JSON.stringify(lineItems),
      subtotal,
      gstAmount,
      total,
      input.validUntil || null,
      includeGst,
      bankAccountName,
      bankAccountNumber,
      input.notes || null,
      intlBankAccountName,
      intlIban,
      intlSwiftBic,
      intlBankName,
      intlBankAddress,
      companyName,
      companyAddress,
      irdNumber,
      gstNumber,
    ]
  );

  return transformQuote(result.rows[0]);
}

/**
 * Transform DB row to Quote type with proper casing
 */
function transformQuote(row: Record<string, unknown>): Quote {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    quoteNumber: row.quote_number as string,
    clientName: row.client_name as string,
    clientEmail: row.client_email as string | null,
    clientPhone: row.client_phone as string | null,
    customerId: row.customer_id as string | null,
    jobDescription: row.job_description as string | null,
    lineItems: typeof row.line_items === 'string'
      ? JSON.parse(row.line_items)
      : (row.line_items as InvoiceLineItem[]) || [],
    subtotal: row.subtotal as number,
    gstAmount: row.gst_amount as number,
    total: row.total as number,
    includeGst: (row.include_gst as boolean) ?? true,
    status: row.status as QuoteStatus,
    validUntil: row.valid_until as string | null,
    convertedInvoiceId: row.converted_invoice_id as string | null,
    bankAccountName: decryptField(row.bank_account_name as string | null),
    bankAccountNumber: decryptField(row.bank_account_number as string | null),
    intlBankAccountName: decryptField(row.intl_bank_account_name as string | null),
    intlIban: decryptField(row.intl_iban as string | null),
    intlSwiftBic: decryptField(row.intl_swift_bic as string | null),
    intlBankName: decryptField(row.intl_bank_name as string | null),
    intlBankAddress: decryptField(row.intl_bank_address as string | null),
    companyName: row.company_name as string | null,
    companyAddress: decryptField(row.company_address as string | null),
    irdNumber: decryptField(row.ird_number as string | null),
    gstNumber: decryptField(row.gst_number as string | null),
    notes: row.notes as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(quote: Quote): Record<string, unknown> {
  return {
    id: quote.id,
    user_id: quote.userId,
    quote_number: quote.quoteNumber,
    client_name: quote.clientName,
    client_email: quote.clientEmail,
    client_phone: quote.clientPhone,
    customer_id: quote.customerId,
    job_description: quote.jobDescription,
    line_items: quote.lineItems,
    subtotal: quote.subtotal,
    gst_amount: quote.gstAmount,
    total: quote.total,
    include_gst: quote.includeGst,
    status: quote.status,
    valid_until: quote.validUntil,
    converted_invoice_id: quote.convertedInvoiceId,
    bank_account_name: quote.bankAccountName,
    bank_account_number: quote.bankAccountNumber,
    intl_bank_account_name: quote.intlBankAccountName,
    intl_iban: quote.intlIban,
    intl_swift_bic: quote.intlSwiftBic,
    intl_bank_name: quote.intlBankName,
    intl_bank_address: quote.intlBankAddress,
    company_name: quote.companyName,
    company_address: quote.companyAddress,
    ird_number: quote.irdNumber,
    gst_number: quote.gstNumber,
    notes: quote.notes,
    created_at: quote.createdAt,
    updated_at: quote.updatedAt,
  };
}

/**
 * Get quote by ID (returns typed Quote for internal use)
 */
export async function getQuoteByIdRaw(
  quoteId: string,
  userId: string
): Promise<Quote | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM quotes WHERE id = $1 AND user_id = $2`,
    [quoteId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformQuote(result.rows[0]);
}

/**
 * Get quote by ID (returns mobile-formatted response)
 */
export async function getQuoteById(
  quoteId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const quote = await getQuoteByIdRaw(quoteId, userId);
  if (!quote) return null;
  return transformForMobile(quote);
}

/**
 * List quotes for user
 */
export async function listQuotes(
  userId: string,
  options: { status?: QuoteStatus; limit?: number; offset?: number } = {}
): Promise<{ quotes: Record<string, unknown>[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let whereClause = 'user_id = $1';
  const params: unknown[] = [userId];

  if (status) {
    whereClause += ' AND status = $2';
    params.push(status);
  }

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM quotes WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get items
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM quotes
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const quotes = result.rows.map((row) => transformForMobile(transformQuote(row)));

  return { quotes, total };
}

/**
 * Update quote (only draft quotes can be edited)
 */
export async function updateQuote(
  quoteId: string,
  userId: string,
  updates: QuoteUpdateInput
): Promise<Record<string, unknown> | null> {
  // First check if quote exists and is draft
  const existing = await db.query<Record<string, unknown>>(
    'SELECT status FROM quotes WHERE id = $1 AND user_id = $2',
    [quoteId, userId]
  );

  if (existing.rows.length === 0) {
    return null;
  }

  if (existing.rows[0].status !== 'draft') {
    throw createError('Can only edit draft quotes', 400, 'QUOTE_NOT_EDITABLE');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    clientName: 'client_name',
    clientEmail: 'client_email',
    clientPhone: 'client_phone',
    customerId: 'customer_id',
    jobDescription: 'job_description',
    validUntil: 'valid_until',
    bankAccountName: 'bank_account_name',
    bankAccountNumber: 'bank_account_number',
    notes: 'notes',
    intlBankAccountName: 'intl_bank_account_name',
    intlIban: 'intl_iban',
    intlSwiftBic: 'intl_swift_bic',
    intlBankName: 'intl_bank_name',
    intlBankAddress: 'intl_bank_address',
    companyName: 'company_name',
    companyAddress: 'company_address',
    irdNumber: 'ird_number',
    gstNumber: 'gst_number',
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'lineItems' && value !== undefined) {
      // Recalculate totals when line items change
      const lineItems = (value as { description: string; amount: number }[]).map((item) => ({
        id: uuidv4(),
        description: item.description,
        amount: item.amount,
      }));
      const { subtotal, gstAmount, total } = calculateTotals(
        value as { description: string; amount: number }[],
        updates.includeGst !== false
      );

      fields.push(`line_items = $${paramIndex++}`);
      values.push(JSON.stringify(lineItems));
      fields.push(`subtotal = $${paramIndex++}`);
      values.push(subtotal);
      fields.push(`gst_amount = $${paramIndex++}`);
      values.push(gstAmount);
      fields.push(`total = $${paramIndex++}`);
      values.push(total);
    } else if (key === 'includeGst' && value !== undefined) {
      fields.push(`include_gst = $${paramIndex++}`);
      values.push(value);
    } else if (fieldMap[key] && value !== undefined) {
      fields.push(`${fieldMap[key]} = $${paramIndex++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    return getQuoteById(quoteId, userId);
  }

  fields.push('updated_at = NOW()');
  values.push(quoteId, userId);

  await db.query(
    `UPDATE quotes SET ${fields.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
    values
  );

  return getQuoteById(quoteId, userId);
}

/**
 * Delete quote
 */
export async function deleteQuote(quoteId: string, userId: string): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM quotes WHERE id = $1 AND user_id = $2',
    [quoteId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Mark quote as sent
 */
export async function markAsSent(
  quoteId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE quotes SET status = 'sent', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'draft'
     RETURNING *`,
    [quoteId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformQuote(result.rows[0]));
}

/**
 * Mark quote as accepted
 */
export async function markAsAccepted(
  quoteId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE quotes SET status = 'accepted', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'sent'
     RETURNING *`,
    [quoteId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformQuote(result.rows[0]));
}

/**
 * Mark quote as declined
 */
export async function markAsDeclined(
  quoteId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE quotes SET status = 'declined', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'sent'
     RETURNING *`,
    [quoteId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformQuote(result.rows[0]));
}

/**
 * Convert quote to invoice
 * Creates a new invoice from the quote data and marks the quote as converted
 */
export async function convertToInvoice(
  quoteId: string,
  userId: string
): Promise<{ quote: Record<string, unknown>; invoice: Record<string, unknown> } | null> {
  // Get the quote
  const quote = await getQuoteByIdRaw(quoteId, userId);
  if (!quote) return null;

  // Only accepted or sent quotes can be converted
  if (!['accepted', 'sent'].includes(quote.status)) {
    throw createError(
      'Only accepted or sent quotes can be converted to invoices',
      400,
      'QUOTE_NOT_CONVERTIBLE'
    );
  }

  // Already converted?
  if (quote.convertedInvoiceId) {
    throw createError(
      'Quote has already been converted to an invoice',
      400,
      'QUOTE_ALREADY_CONVERTED'
    );
  }

  // Create the invoice from quote data
  const invoice = await createInvoice(userId, {
    clientName: quote.clientName,
    clientEmail: quote.clientEmail || undefined,
    clientPhone: quote.clientPhone || undefined,
    customerId: quote.customerId || undefined,
    jobDescription: quote.jobDescription || undefined,
    lineItems: quote.lineItems.map((item) => ({
      description: item.description,
      amount: item.amount,
    })),
    includeGst: quote.includeGst,
    bankAccountName: quote.bankAccountName || undefined,
    bankAccountNumber: quote.bankAccountNumber || undefined,
    intlBankAccountName: quote.intlBankAccountName || undefined,
    intlIban: quote.intlIban || undefined,
    intlSwiftBic: quote.intlSwiftBic || undefined,
    intlBankName: quote.intlBankName || undefined,
    intlBankAddress: quote.intlBankAddress || undefined,
    companyName: quote.companyName || undefined,
    companyAddress: quote.companyAddress || undefined,
    irdNumber: quote.irdNumber || undefined,
    gstNumber: quote.gstNumber || undefined,
    notes: quote.notes || undefined,
  });

  // Update the quote status and link to the invoice
  const updatedQuote = await db.query<Record<string, unknown>>(
    `UPDATE quotes SET
      status = 'converted',
      converted_invoice_id = $1,
      updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [invoice.id, quoteId, userId]
  );

  return {
    quote: transformForMobile(transformQuote(updatedQuote.rows[0])),
    invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber },
  };
}

/**
 * Get quote statistics for a user
 */
export async function getQuoteStats(userId: string): Promise<{
  total: number;
  pending: number;
  pendingAmount: number;
  accepted: number;
  thisMonth: number;
}> {
  const result = await db.query<{
    total: string;
    pending: string;
    pending_amount: string;
    accepted: string;
    this_month: string;
  }>(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'sent') as pending,
      COALESCE(SUM(total) FILTER (WHERE status = 'sent'), 0) as pending_amount,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as this_month
     FROM quotes WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    pending: parseInt(row.pending, 10),
    pendingAmount: parseInt(row.pending_amount, 10),
    accepted: parseInt(row.accepted, 10),
    thisMonth: parseInt(row.this_month, 10),
  };
}

export default {
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
};
