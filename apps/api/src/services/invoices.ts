/**
 * Invoices Service
 * Invoice creation, management, and payment tracking
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from './database.js';
import {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  InvoiceCreateInput,
  InvoiceUpdateInput,
  InvoiceDiscountType,
  normalizePricedLineItem,
} from '../types/index.js';
import { createError } from '../middleware/error.js';
import { getBankDetailsForInvoice } from './business-profile.js';
import {
  decryptForDisplay,
  decryptField,
  encryptField,
  isEncryptedValue,
} from '../utils/field-crypto.js';

const GST_RATE = 0.15; // NZ GST rate

/** Parse line_items JSON preserving optional cost/marginPercent (internal). */
function parseLineItems(raw: unknown): InvoiceLineItem[] {
  const arr: unknown[] =
    typeof raw === 'string'
      ? (JSON.parse(raw) as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return arr.map((item) => {
    const row = item as Record<string, unknown>;
    const cost =
      row.cost != null && Number.isFinite(Number(row.cost))
        ? Math.round(Number(row.cost))
        : null;
    const marginPercent =
      row.marginPercent != null && Number.isFinite(Number(row.marginPercent))
        ? Number(row.marginPercent)
        : row.margin_percent != null && Number.isFinite(Number(row.margin_percent))
          ? Number(row.margin_percent)
          : null;
    const costIsAnnual = Boolean(
      row.costIsAnnual ?? row.cost_is_annual ?? false,
    );
    const annualCost =
      row.annualCost != null && Number.isFinite(Number(row.annualCost))
        ? Math.round(Number(row.annualCost))
        : row.annual_cost != null && Number.isFinite(Number(row.annual_cost))
          ? Math.round(Number(row.annual_cost))
          : null;
    return {
      id: String(row.id || uuidv4()),
      description: String(row.description || ''),
      amount: Math.round(Number(row.amount) || 0),
      cost,
      marginPercent,
      costIsAnnual: costIsAnnual || undefined,
      annualCost: annualCost,
    };
  });
}

export interface InvoiceTotalsInput {
  lineItems: { description: string; amount: number }[];
  includeGst?: boolean;
  discountType?: InvoiceDiscountType | null;
  /** Cents if fixed; whole percent 0–100 if percent */
  discountValue?: number | null;
}

export interface InvoiceTotals {
  subtotal: number;
  discountType: InvoiceDiscountType;
  discountValue: number;
  discountAmount: number;
  gstAmount: number;
  total: number;
}

/**
 * Generate next invoice number for user using business profile prefix
 * (e.g., INV-0001, INV-0002, or custom prefix like INST-0001)
 */
export async function getNextInvoiceNumber(userId: string): Promise<string> {
  return db.transaction(async (client) => {
    // Get prefix from business profile (defaults to 'INV' if not set)
    const profileResult = await client.query<{ invoice_prefix: string }>(
      'SELECT invoice_prefix FROM business_profiles WHERE user_id = $1',
      [userId]
    );
    const prefix = profileResult.rows.length > 0
      ? profileResult.rows[0].invoice_prefix
      : 'INV';

    // Get the highest existing invoice number with FOR UPDATE to prevent race conditions
    // Note: FOR UPDATE cannot be used with aggregate functions (MAX), so we select the actual row
    const result = await client.query<{ invoice_number: string }>(
      `SELECT invoice_number FROM invoices WHERE user_id = $1 ORDER BY invoice_number DESC LIMIT 1 FOR UPDATE`,
      [userId]
    );

    let nextNum = 1;
    const maxNum = result.rows.length > 0 ? result.rows[0].invoice_number : null;
    if (maxNum) {
      // Extract the numeric portion after the prefix (e.g., "INV-0042" -> 42)
      const match = maxNum.match(/-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  });
}

/**
 * Calculate invoice totals from line items + optional discount (before GST).
 * Discount is capped at subtotal so total never goes negative.
 */
export function calculateTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const lineItems = input.lineItems ?? [];
  const includeGst = input.includeGst !== false;
  const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  let discountType: InvoiceDiscountType = input.discountType || 'none';
  let discountValue = Math.max(0, Math.round(input.discountValue ?? 0));
  if (discountType !== 'fixed' && discountType !== 'percent') {
    discountType = 'none';
    discountValue = 0;
  }
  if (discountType === 'percent') {
    discountValue = Math.min(100, discountValue);
  }

  let discountAmount = 0;
  if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = Math.min(discountValue, subtotal);
  } else if (discountType === 'percent' && discountValue > 0) {
    discountAmount = Math.min(
      Math.round((subtotal * discountValue) / 100),
      subtotal
    );
  } else {
    discountType = 'none';
    discountValue = 0;
    discountAmount = 0;
  }

  const taxable = subtotal - discountAmount;
  const gstAmount = includeGst ? Math.round(taxable * GST_RATE) : 0;
  const total = taxable + gstAmount;

  return {
    subtotal,
    discountType,
    discountValue,
    discountAmount,
    gstAmount,
    total,
  };
}

/**
 * Create a new invoice
 * Auto-populates bank details and company info from business profile if not provided
 */
export async function createInvoice(
  userId: string,
  input: InvoiceCreateInput
): Promise<Invoice> {
  const invoiceNumber = await getNextInvoiceNumber(userId);
  const invoiceId = uuidv4();

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

  // Store bank/PII encrypted at rest (plaintext from profile/client → encrypt)
  bankAccountName = encryptField(bankAccountName);
  bankAccountNumber = encryptField(bankAccountNumber);
  intlBankAccountName = encryptField(intlBankAccountName);
  intlIban = encryptField(intlIban);
  intlSwiftBic = encryptField(intlSwiftBic);
  intlBankName = encryptField(intlBankName);
  intlBankAddress = encryptField(intlBankAddress);
  companyAddress = encryptField(companyAddress);
  irdNumber = encryptField(irdNumber);
  gstNumber = encryptField(gstNumber);

  // Normalize line items: cost + margin% → sell amount; cost/margin internal only
  const lineItems: InvoiceLineItem[] = input.lineItems.map((item) => {
    const normalized = normalizePricedLineItem({
      description: item.description,
      amount: item.amount,
      cost: item.cost,
      marginPercent: item.marginPercent,
      costIsAnnual: item.costIsAnnual,
      annualCost: item.annualCost,
    });
    return {
      id: uuidv4(),
      description: normalized.description,
      amount: normalized.amount,
      cost: normalized.cost,
      marginPercent: normalized.marginPercent,
      costIsAnnual: normalized.costIsAnnual || undefined,
      annualCost: normalized.annualCost,
    };
  });

  const totals = calculateTotals({
    lineItems,
    includeGst,
    discountType: input.discountType,
    discountValue: input.discountValue,
  });

  const discountLabel =
    totals.discountAmount > 0
      ? (input.discountLabel?.trim() || null)
      : null;

  const result = await db.query(
    `INSERT INTO invoices (
      id, user_id, invoice_number,
      client_name, client_email, client_phone,
      swms_id, job_description,
      line_items, subtotal, gst_amount, total,
      status, due_date,
      bank_account_name, bank_account_number, notes, internal_memo,
      customer_id, recurring_invoice_id, include_gst,
      intl_bank_account_name, intl_iban, intl_swift_bic,
      intl_bank_name, intl_bank_address,
      company_name, company_address, ird_number, gst_number,
      discount_type, discount_value, discount_amount, discount_label
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft',
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
            $25, $26, $27, $28, $29, $30, $31, $32, $33)
    RETURNING *`,
    [
      invoiceId,
      userId,
      invoiceNumber,
      input.clientName,
      input.clientEmail || null,
      input.clientPhone || null,
      input.swmsId || null,
      input.jobDescription || null,
      JSON.stringify(lineItems),
      totals.subtotal,
      totals.gstAmount,
      totals.total,
      input.dueDate || null,
      bankAccountName,
      bankAccountNumber,
      input.notes || null,
      input.internalMemo || null,
      input.customerId || null,
      input.recurringInvoiceId || null,
      includeGst,
      intlBankAccountName,
      intlIban,
      intlSwiftBic,
      intlBankName,
      intlBankAddress,
      companyName,
      companyAddress,
      irdNumber,
      gstNumber,
      totals.discountType,
      totals.discountValue,
      totals.discountAmount,
      discountLabel,
    ]
  );

  return transformInvoice(result.rows[0]);
}

/**
 * Transform DB row to Invoice type with proper casing
 */
function transformInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    invoiceNumber: row.invoice_number as string,
    clientName: row.client_name as string,
    clientEmail: row.client_email as string | null,
    clientPhone: row.client_phone as string | null,
    swmsId: row.swms_id as string | null,
    jobDescription: row.job_description as string | null,
    lineItems: parseLineItems(row.line_items),
    subtotal: row.subtotal as number,
    discountType: ((row.discount_type as InvoiceDiscountType) || 'none') as InvoiceDiscountType,
    discountValue: (row.discount_value as number) ?? 0,
    discountAmount: (row.discount_amount as number) ?? 0,
    discountLabel: (row.discount_label as string | null) ?? null,
    gstAmount: row.gst_amount as number,
    total: row.total as number,
    status: row.status as InvoiceStatus,
    dueDate: row.due_date as string | null,
    paidAt: row.paid_at as Date | null,
    // Decrypt bank/PII (never surface enc:v1:… to UI/PDF/email)
    bankAccountName: decryptForDisplay(row.bank_account_name as string | null),
    bankAccountNumber: decryptForDisplay(row.bank_account_number as string | null),
    notes: row.notes as string | null,
    internalMemo: (row.internal_memo as string | null) ?? null,
    // Enhanced fields
    customerId: row.customer_id as string | null,
    recurringInvoiceId: row.recurring_invoice_id as string | null,
    includeGst: (row.include_gst as boolean) ?? true,
    intlBankAccountName: decryptForDisplay(row.intl_bank_account_name as string | null),
    intlIban: decryptForDisplay(row.intl_iban as string | null),
    intlSwiftBic: decryptForDisplay(row.intl_swift_bic as string | null),
    intlBankName: decryptForDisplay(row.intl_bank_name as string | null),
    intlBankAddress: decryptForDisplay(row.intl_bank_address as string | null),
    companyName: row.company_name as string | null,
    companyAddress: decryptForDisplay(row.company_address as string | null),
    irdNumber: decryptForDisplay(row.ird_number as string | null),
    gstNumber: decryptForDisplay(row.gst_number as string | null),
    shareToken: row.share_token as string | null,
    // Payment gateway fields (Phase 1 — Stripe Payment Links)
    paymentProvider: (row.payment_provider as Invoice['paymentProvider']) ?? null,
    paymentReference: (row.payment_reference as string | null) ?? null,
    paymentLinkUrl: (row.payment_link_url as string | null) ?? null,
    stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null,
    stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(invoice: Invoice): Record<string, unknown> {
  return {
    id: invoice.id,
    user_id: invoice.userId,
    invoice_number: invoice.invoiceNumber,
    client_name: invoice.clientName,
    client_email: invoice.clientEmail,
    client_phone: invoice.clientPhone,
    swms_id: invoice.swmsId,
    job_description: invoice.jobDescription,
    line_items: invoice.lineItems,
    subtotal: invoice.subtotal,
    discount_type: invoice.discountType,
    discount_value: invoice.discountValue,
    discount_amount: invoice.discountAmount,
    discount_label: invoice.discountLabel,
    gst_amount: invoice.gstAmount,
    total: invoice.total,
    status: invoice.status,
    due_date: invoice.dueDate,
    paid_at: invoice.paidAt,
    bank_account_name: invoice.bankAccountName,
    bank_account_number: invoice.bankAccountNumber,
    notes: invoice.notes,
    internal_memo: invoice.internalMemo,
    // Enhanced fields
    customer_id: invoice.customerId,
    recurring_invoice_id: invoice.recurringInvoiceId,
    include_gst: invoice.includeGst,
    intl_bank_account_name: invoice.intlBankAccountName,
    intl_iban: invoice.intlIban,
    intl_swift_bic: invoice.intlSwiftBic,
    intl_bank_name: invoice.intlBankName,
    intl_bank_address: invoice.intlBankAddress,
    company_name: invoice.companyName,
    company_address: invoice.companyAddress,
    ird_number: invoice.irdNumber,
    gst_number: invoice.gstNumber,
    share_token: invoice.shareToken,
    created_at: invoice.createdAt,
    updated_at: invoice.updatedAt,
  };
}

/**
 * Get invoice by ID (returns typed Invoice for internal use, e.g. PDF generation)
 */
export async function getInvoiceByIdRaw(
  invoiceId: string,
  userId: string
): Promise<Invoice | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM invoices WHERE id = $1 AND user_id = $2`,
    [invoiceId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  // Self-heal: if bank/PII still look encrypted after decrypt attempt fails,
  // re-copy plaintext from business profile and re-encrypt for storage.
  await maybeRepairEncryptedBankFields(row, userId);
  return transformInvoice(row);
}

/**
 * When invoice rows hold enc:v1:… bank details (legacy copy-from-profile bugs),
 * rewrite them from the business profile so PDF/email/UI show real account info.
 */
async function maybeRepairEncryptedBankFields(
  row: Record<string, unknown>,
  userId: string,
): Promise<void> {
  const bankCols = [
    'bank_account_name',
    'bank_account_number',
    'intl_bank_account_name',
    'intl_iban',
    'intl_swift_bic',
    'intl_bank_name',
    'intl_bank_address',
    'company_address',
    'ird_number',
    'gst_number',
  ] as const;

  const needsRepair = bankCols.some((c) =>
    isEncryptedValue(row[c] as string | null),
  );
  if (!needsRepair) return;

  // Prefer decrypting existing invoice values
  const repaired: Record<string, string | null> = {};
  let anyDecrypted = false;
  for (const c of bankCols) {
    const raw = row[c] as string | null;
    if (!isEncryptedValue(raw)) {
      repaired[c] = raw;
      continue;
    }
    const plain = decryptField(raw);
    if (plain) {
      repaired[c] = plain;
      anyDecrypted = true;
    } else {
      repaired[c] = null;
    }
  }

  // Fill gaps from business profile
  if (
    !repaired.bank_account_name ||
    !repaired.bank_account_number ||
    !anyDecrypted
  ) {
    try {
      const profile = await getBankDetailsForInvoice(userId);
      if (profile) {
        repaired.bank_account_name =
          repaired.bank_account_name || profile.bankAccountName;
        repaired.bank_account_number =
          repaired.bank_account_number || profile.bankAccountNumber;
        repaired.intl_bank_account_name =
          repaired.intl_bank_account_name || profile.intlBankAccountName;
        repaired.intl_iban = repaired.intl_iban || profile.intlIban;
        repaired.intl_swift_bic =
          repaired.intl_swift_bic || profile.intlSwiftBic;
        repaired.intl_bank_name =
          repaired.intl_bank_name || profile.intlBankName;
        repaired.intl_bank_address =
          repaired.intl_bank_address || profile.intlBankAddress;
        repaired.company_address =
          repaired.company_address || profile.companyAddress;
        repaired.ird_number = repaired.ird_number || profile.irdNumber;
        repaired.gst_number = repaired.gst_number || profile.gstNumber;
      }
    } catch {
      /* profile optional */
    }
  }

  // Persist re-encrypted values + update row in-memory for this request
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const c of bankCols) {
    if (repaired[c] === undefined) continue;
    const plain = repaired[c];
    // Never write ciphertext back as if it were plain
    if (plain && isEncryptedValue(plain)) continue;
    const stored = plain ? encryptField(plain) : null;
    sets.push(`${c} = $${i++}`);
    vals.push(stored);
    row[c] = stored;
  }
  if (sets.length === 0) return;
  vals.push(row.id, userId);
  try {
    await db.query(
      `UPDATE invoices SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${i++} AND user_id = $${i}`,
      vals,
    );
  } catch (err) {
    console.error(
      '[invoices] bank field repair failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Get invoice by ID (returns mobile-formatted response)
 */
export async function getInvoiceById(
  invoiceId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const invoice = await getInvoiceByIdRaw(invoiceId, userId);
  if (!invoice) return null;
  return transformForMobile(invoice);
}

/**
 * List invoices for user
 */
export async function listInvoices(
  userId: string,
  options: { status?: InvoiceStatus; limit?: number; offset?: number } = {}
): Promise<{ invoices: Record<string, unknown>[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let whereClause = 'user_id = $1';
  const params: unknown[] = [userId];

  if (status) {
    whereClause += ' AND status = $2';
    params.push(status);
  }

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM invoices WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get items
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM invoices
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const invoices = result.rows.map((row) => transformForMobile(transformInvoice(row)));

  return { invoices, total };
}

/**
 * Update invoice
 */
export async function updateInvoice(
  invoiceId: string,
  userId: string,
  updates: InvoiceUpdateInput
): Promise<Record<string, unknown> | null> {
  // First check if invoice exists and is draft (full row for recalculation baseline)
  const existing = await db.query<Record<string, unknown>>(
    'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
    [invoiceId, userId]
  );

  if (existing.rows.length === 0) {
    return null;
  }

  if (existing.rows[0].status !== 'draft') {
    throw createError('Can only edit draft invoices', 400, 'INVOICE_NOT_EDITABLE');
  }

  const current = transformInvoice(existing.rows[0]);
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    clientName: 'client_name',
    clientEmail: 'client_email',
    clientPhone: 'client_phone',
    swmsId: 'swms_id',
    jobDescription: 'job_description',
    dueDate: 'due_date',
    bankAccountName: 'bank_account_name',
    bankAccountNumber: 'bank_account_number',
    notes: 'notes',
    internalMemo: 'internal_memo',
    customerId: 'customer_id',
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

  let nextLineItems = current.lineItems;
  let lineItemsTouched = false;
  let includeGst = current.includeGst;
  let discountType: InvoiceDiscountType = current.discountType;
  let discountValue = current.discountValue;
  let discountLabel: string | null = current.discountLabel;
  let totalsTouched = false;

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'lineItems' && value !== undefined) {
      lineItemsTouched = true;
      totalsTouched = true;
      nextLineItems = (
        value as {
          description: string;
          amount: number;
          cost?: number | null;
          marginPercent?: number | null;
          costIsAnnual?: boolean | null;
          annualCost?: number | null;
        }[]
      ).map((item) => {
        const normalized = normalizePricedLineItem({
          description: item.description,
          amount: item.amount,
          cost: item.cost,
          marginPercent: item.marginPercent,
          costIsAnnual: item.costIsAnnual,
          annualCost: item.annualCost,
        });
        return {
          id: uuidv4(),
          description: normalized.description,
          amount: normalized.amount,
          cost: normalized.cost,
          marginPercent: normalized.marginPercent,
          costIsAnnual: normalized.costIsAnnual || undefined,
          annualCost: normalized.annualCost,
        };
      });
    } else if (key === 'includeGst' && value !== undefined) {
      totalsTouched = true;
      includeGst = Boolean(value);
      fields.push(`include_gst = $${paramIndex++}`);
      values.push(includeGst);
    } else if (key === 'discountType' && value !== undefined) {
      totalsTouched = true;
      discountType = value as InvoiceDiscountType;
    } else if (key === 'discountValue' && value !== undefined) {
      totalsTouched = true;
      discountValue = value as number;
    } else if (key === 'discountLabel') {
      // Allow clearing with null/empty
      discountLabel =
        value === null || value === undefined || value === ''
          ? null
          : String(value).trim() || null;
      totalsTouched = true;
    } else if (fieldMap[key] && value !== undefined) {
      fields.push(`${fieldMap[key]} = $${paramIndex++}`);
      // Encrypt bank/PII columns at rest
      const sensitive = new Set([
        'bankAccountName',
        'bankAccountNumber',
        'intlBankAccountName',
        'intlIban',
        'intlSwiftBic',
        'intlBankName',
        'intlBankAddress',
        'companyAddress',
        'irdNumber',
        'gstNumber',
      ]);
      if (sensitive.has(key)) {
        values.push(
          value === null || value === ''
            ? null
            : encryptField(String(value)),
        );
      } else {
        values.push(value);
      }
    }
  }

  if (lineItemsTouched) {
    fields.push(`line_items = $${paramIndex++}`);
    values.push(JSON.stringify(nextLineItems));
  }

  if (totalsTouched || lineItemsTouched) {
    const totals = calculateTotals({
      lineItems: nextLineItems,
      includeGst,
      discountType,
      discountValue,
    });
    const labelToStore =
      totals.discountAmount > 0 ? discountLabel : null;

    fields.push(`subtotal = $${paramIndex++}`);
    values.push(totals.subtotal);
    fields.push(`discount_type = $${paramIndex++}`);
    values.push(totals.discountType);
    fields.push(`discount_value = $${paramIndex++}`);
    values.push(totals.discountValue);
    fields.push(`discount_amount = $${paramIndex++}`);
    values.push(totals.discountAmount);
    fields.push(`discount_label = $${paramIndex++}`);
    values.push(labelToStore);
    fields.push(`gst_amount = $${paramIndex++}`);
    values.push(totals.gstAmount);
    fields.push(`total = $${paramIndex++}`);
    values.push(totals.total);
  }

  if (fields.length === 0) {
    return getInvoiceById(invoiceId, userId);
  }

  fields.push('updated_at = NOW()');
  values.push(invoiceId, userId);

  await db.query(
    `UPDATE invoices SET ${fields.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
    values
  );

  return getInvoiceById(invoiceId, userId);
}

/**
 * Delete invoice
 * Only draft invoices can be deleted. Sent/paid invoices must be voided instead.
 */
export async function deleteInvoice(invoiceId: string, userId: string): Promise<boolean> {
  // Safety guard: only allow deletion of draft invoices
  const invoice = await db.query<{ status: string }>(
    'SELECT status FROM invoices WHERE id = $1 AND user_id = $2',
    [invoiceId, userId]
  );

  if (invoice.rows.length === 0) {
    return false;
  }

  if (invoice.rows[0].status !== 'draft') {
    throw Object.assign(new Error('Only draft invoices can be deleted. Sent or paid invoices cannot be removed.'), {
      statusCode: 400,
      code: 'INVOICE_NOT_DELETABLE',
    });
  }

  const result = await db.query(
    'DELETE FROM invoices WHERE id = $1 AND user_id = $2 AND status = \'draft\'',
    [invoiceId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Mark invoice as sent
 */
export async function markAsSent(
  invoiceId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE invoices SET status = 'sent', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'draft'
     RETURNING *`,
    [invoiceId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformInvoice(result.rows[0]));
}

/**
 * Mark invoice as paid
 */
export async function markAsPaid(
  invoiceId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('sent', 'overdue')
     RETURNING *`,
    [invoiceId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformInvoice(result.rows[0]));
}

/**
 * Get invoice statistics for a user
 */
export async function getInvoiceStats(userId: string): Promise<{
  total: number;
  unpaid: number;
  unpaidAmount: number;
  thisMonth: number;
}> {
  const result = await db.query<{
    total: string;
    unpaid: string;
    unpaid_amount: string;
    this_month: string;
  }>(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status IN ('sent', 'overdue')) as unpaid,
      COALESCE(SUM(total) FILTER (WHERE status IN ('sent', 'overdue')), 0) as unpaid_amount,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) as this_month
     FROM invoices WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    unpaid: parseInt(row.unpaid, 10),
    unpaidAmount: parseInt(row.unpaid_amount, 10),
    thisMonth: parseInt(row.this_month, 10),
  };
}

/**
 * Generate a share token for an invoice (for public shareable link).
 * Sharing a draft auto-marks it as **sent** (same idea as email) so the
 * tradie’s workflow matches a real client-facing handoff.
 */
export async function generateShareToken(invoiceId: string, userId: string): Promise<string | null> {
  // First check invoice exists and belongs to user
  const existing = await db.query<{
    id: string;
    share_token: string | null;
    status: string;
  }>(
    'SELECT id, share_token, status FROM invoices WHERE id = $1 AND user_id = $2',
    [invoiceId, userId]
  );

  if (existing.rows.length === 0) return null;

  // Public share = client handoff: draft → sent (email path already does this)
  if (existing.rows[0].status === 'draft') {
    await db.query(
      `UPDATE invoices SET status = 'sent', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'draft'`,
      [invoiceId, userId]
    );
  }

  // Return existing token if already generated
  if (existing.rows[0].share_token) {
    return existing.rows[0].share_token;
  }

  // Generate a new unique token
  const token = crypto.randomBytes(32).toString('hex');

  await db.query(
    'UPDATE invoices SET share_token = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
    [token, invoiceId, userId]
  );

  return token;
}

/**
 * Mark invoice as paid from a payment-gateway webhook.
 *
 * Differs from markAsPaid:
 *  - Webhook is system-initiated → no user_id scope (any invoice may match).
 *  - Looked up by stripe_checkout_session_id rather than (id, user_id).
 *  - Idempotent: an already-paid invoice returns the row without re-flipping
 *    paid_at, so Stripe's retries don't churn the timestamp.
 *  - Captures the gateway reference + payment_intent_id for reconciliation.
 *
 * Returns the (possibly already-paid) invoice if found, or null if the
 * session_id doesn't match any invoice. Callers should treat null as a 200
 * acknowledgement to the webhook — Stripe sometimes fires for sessions we
 * never created (e.g. subscription checkouts hit this handler too).
 */
export async function markAsPaidFromWebhookBySession(params: {
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  paymentReference: string;
}): Promise<Invoice | null> {
  const lookup = await db.query<Record<string, unknown>>(
    'SELECT * FROM invoices WHERE stripe_checkout_session_id = $1',
    [params.stripeCheckoutSessionId]
  );

  if (lookup.rows.length === 0) {
    return null;
  }

  const existing = transformInvoice(lookup.rows[0]);

  // Idempotency: don't churn paid_at or audit metadata on Stripe retries.
  if (existing.status === 'paid') {
    return existing;
  }

  const result = await db.query<Record<string, unknown>>(
    `UPDATE invoices
        SET status = 'paid',
            paid_at = NOW(),
            payment_provider = 'stripe',
            payment_reference = $2,
            stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
            updated_at = NOW()
      WHERE stripe_checkout_session_id = $1
        AND status IN ('draft', 'sent', 'overdue')
      RETURNING *`,
    [
      params.stripeCheckoutSessionId,
      params.paymentReference,
      params.stripePaymentIntentId,
    ]
  );

  if (result.rows.length === 0) {
    // Race: somebody else flipped it between SELECT and UPDATE. Re-fetch.
    return getInvoiceByStripeSessionId(params.stripeCheckoutSessionId);
  }

  return transformInvoice(result.rows[0]);
}

/**
 * Fetch an invoice by its Stripe Checkout Session ID (system-scoped, no user_id).
 * Used by the webhook handler when matching incoming events back to invoices.
 */
export async function getInvoiceByStripeSessionId(
  sessionId: string
): Promise<Invoice | null> {
  const result = await db.query<Record<string, unknown>>(
    'SELECT * FROM invoices WHERE stripe_checkout_session_id = $1',
    [sessionId]
  );
  if (result.rows.length === 0) return null;
  return transformInvoice(result.rows[0]);
}

/**
 * Attach a Stripe Checkout Session (Payment Link) to an invoice.
 * Persists the session_id + hosted URL so subsequent renders of the public
 * invoice page reuse the same link instead of churning new sessions.
 */
export async function attachStripePaymentLink(params: {
  invoiceId: string;
  userId: string;
  stripeCheckoutSessionId: string;
  paymentLinkUrl: string;
}): Promise<Invoice | null> {
  const result = await db.query<Record<string, unknown>>(
    `UPDATE invoices
        SET stripe_checkout_session_id = $1,
            payment_link_url = $2,
            payment_provider = 'stripe',
            updated_at = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING *`,
    [
      params.stripeCheckoutSessionId,
      params.paymentLinkUrl,
      params.invoiceId,
      params.userId,
    ]
  );
  if (result.rows.length === 0) return null;
  return transformInvoice(result.rows[0]);
}

/**
 * Get invoice by share token (public access, no user auth required)
 */
export async function getInvoiceByShareToken(token: string): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT i.*,
            bp.company_name AS bp_company_name,
            bp.company_address AS bp_company_address,
            bp.company_phone AS bp_company_phone,
            bp.company_email AS bp_company_email,
            bp.ird_number AS bp_ird_number,
            bp.gst_number AS bp_gst_number,
            bp.logo_url AS bp_logo_url,
            bp.intl_bank_account_name AS bp_intl_bank_account_name,
            bp.intl_iban AS bp_intl_iban,
            bp.intl_swift_bic AS bp_intl_swift_bic,
            bp.intl_bank_name AS bp_intl_bank_name
     FROM invoices i
     LEFT JOIN business_profiles bp ON bp.user_id = i.user_id
     WHERE i.share_token = $1`,
    [token]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const invoice = transformInvoice(row);
  // Public share payload: decrypted invoice + optional profile overlay
  return {
    ...transformForMobile(invoice),
    company_name: invoice.companyName || (row.bp_company_name as string | null),
    company_address:
      invoice.companyAddress ||
      decryptForDisplay(row.bp_company_address as string | null),
    company_phone: decryptForDisplay(row.bp_company_phone as string | null),
    company_email: decryptForDisplay(row.bp_company_email as string | null),
    ird_number:
      invoice.irdNumber || decryptForDisplay(row.bp_ird_number as string | null),
    gst_number:
      invoice.gstNumber || decryptForDisplay(row.bp_gst_number as string | null),
    logo_url: row.bp_logo_url as string | null,
    intl_bank_account_name:
      invoice.intlBankAccountName ||
      decryptForDisplay(row.bp_intl_bank_account_name as string | null),
    intl_iban:
      invoice.intlIban || decryptForDisplay(row.bp_intl_iban as string | null),
    intl_swift_bic:
      invoice.intlSwiftBic ||
      decryptForDisplay(row.bp_intl_swift_bic as string | null),
    intl_bank_name:
      invoice.intlBankName ||
      decryptForDisplay(row.bp_intl_bank_name as string | null),
  };
}

export default {
  getNextInvoiceNumber,
  createInvoice,
  getInvoiceByIdRaw,
  getInvoiceById,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  markAsSent,
  markAsPaid,
  getInvoiceStats,
  generateShareToken,
  getInvoiceByShareToken,
};
