/**
 * Recurring Invoices Service
 * Monthly invoice templates with fixed/variable line items
 */

import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import invoicesService from './invoices.js';
import * as productsService from './products.js';
import {
  RecurringInvoice,
  ProductType,
  RecurringInvoiceCreateInput,
  RecurringInvoiceUpdateInput,
} from '../types/index.js';

/**
 * Transform DB row to RecurringInvoice type
 */
function transformRecurring(row: Record<string, unknown>): RecurringInvoice {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    customerId: row.customer_id as string,
    name: row.name as string,
    recurrence: row.recurrence as 'monthly',
    dayOfMonth: row.day_of_month as number,
    isAutoGenerate: row.is_auto_generate as boolean,
    includeGst: row.include_gst as boolean,
    paymentTerms: row.payment_terms as number,
    notes: row.notes as string | null,
    isActive: row.is_active as boolean,
    lastGeneratedAt: row.last_generated_at as Date | null,
    nextGenerationDate: row.next_generation_date as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(rec: RecurringInvoice): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: rec.id,
    user_id: rec.userId,
    customer_id: rec.customerId,
    name: rec.name,
    recurrence: rec.recurrence,
    day_of_month: rec.dayOfMonth,
    is_auto_generate: rec.isAutoGenerate,
    include_gst: rec.includeGst,
    payment_terms: rec.paymentTerms,
    notes: rec.notes,
    is_active: rec.isActive,
    last_generated_at: rec.lastGeneratedAt,
    next_generation_date: rec.nextGenerationDate,
    created_at: rec.createdAt,
    updated_at: rec.updatedAt,
  };

  if (rec.customer) {
    result.customer = {
      id: rec.customer.id,
      name: rec.customer.name,
      email: rec.customer.email,
      phone: rec.customer.phone,
    };
  }

  if (rec.lineItems) {
    result.line_items = rec.lineItems.map((li) => ({
      id: li.id,
      recurring_invoice_id: li.recurringInvoiceId,
      product_service_id: li.productServiceId,
      description: li.description,
      unit_price: li.unitPrice,
      quantity: li.quantity,
      type: li.type,
      sort_order: li.sortOrder,
      product_name: li.productName,
    }));
  }

  return result;
}

/**
 * Compute next generation date from day_of_month.
 *
 * When dayOfMonth exceeds the number of days in the target month (e.g. day 31
 * in April, or day 29–31 in February), clamp to the last day of that month so
 * the invoice still fires on the closest valid date rather than producing an
 * invalid date string that PostgreSQL would reject.
 */
export function computeNextGenerationDate(dayOfMonth: number, from?: Date): string {
  const now = from ?? new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  // If we've passed the day this month, schedule for next month
  if (now.getDate() >= dayOfMonth) {
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  // Clamp to the actual last day of the target month so we never produce an
  // invalid date (e.g. "2026-04-31" or "2026-02-30").
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(dayOfMonth, daysInMonth);

  // Format as YYYY-MM-DD
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Create a recurring invoice with line items (transaction)
 */
export async function createRecurringInvoice(
  userId: string,
  input: RecurringInvoiceCreateInput
): Promise<Record<string, unknown>> {
  const recurringId = uuidv4();
  const dayOfMonth = input.dayOfMonth ?? 1;
  const nextGen = computeNextGenerationDate(dayOfMonth);

  // Determine isAutoGenerate: true if ALL line items are 'fixed'
  const isAutoGenerate = input.lineItems.every((li) => li.type === 'fixed');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Insert recurring invoice
    await client.query<Record<string, unknown>>(
      `INSERT INTO recurring_invoices (
        id, user_id, customer_id, name, recurrence, day_of_month,
        is_auto_generate, include_gst, payment_terms, notes,
        next_generation_date
      )
      VALUES ($1, $2, $3, $4, 'monthly', $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        recurringId,
        userId,
        input.customerId,
        input.name,
        dayOfMonth,
        isAutoGenerate,
        input.includeGst ?? true,
        input.paymentTerms ?? 20,
        input.notes || null,
        nextGen,
      ]
    );

    // Insert line items
    for (let i = 0; i < input.lineItems.length; i++) {
      const li = input.lineItems[i];
      await client.query(
        `INSERT INTO recurring_line_items (
          id, recurring_invoice_id, product_service_id,
          description, unit_price, quantity, type, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          recurringId,
          li.productServiceId,
          li.description || null,
          li.unitPrice,
          li.quantity ?? 1,
          li.type,
          i,
        ]
      );
    }

    await client.query('COMMIT');

    // Fetch full detail to return
    return await getRecurringInvoiceById(recurringId, userId) as Record<string, unknown>;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get recurring invoice by ID with customer and line items
 */
export async function getRecurringInvoiceById(
  recurringId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT ri.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
     FROM recurring_invoices ri
     JOIN customers c ON c.id = ri.customer_id
     WHERE ri.id = $1 AND ri.user_id = $2`,
    [recurringId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const rec = transformRecurring(row);

  // Attach customer info
  rec.customer = {
    id: row.customer_id as string,
    userId: userId,
    name: row.customer_name as string,
    email: row.customer_email as string | null,
    phone: row.customer_phone as string | null,
    address: null,
    notes: null,
    defaultPaymentTerms: null,
    defaultIncludeGst: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Fetch line items with product names
  const liResult = await db.query<Record<string, unknown>>(
    `SELECT rli.*, ps.name as product_name
     FROM recurring_line_items rli
     JOIN products_services ps ON ps.id = rli.product_service_id
     WHERE rli.recurring_invoice_id = $1
     ORDER BY rli.sort_order ASC`,
    [recurringId]
  );

  rec.lineItems = liResult.rows.map((liRow) => ({
    id: liRow.id as string,
    recurringInvoiceId: liRow.recurring_invoice_id as string,
    productServiceId: liRow.product_service_id as string,
    description: liRow.description as string | null,
    unitPrice: liRow.unit_price as number,
    quantity: liRow.quantity as number,
    type: liRow.type as ProductType,
    sortOrder: liRow.sort_order as number,
    createdAt: liRow.created_at as Date,
    updatedAt: liRow.updated_at as Date,
    productName: liRow.product_name as string,
  }));

  return transformForMobile(rec);
}

/**
 * List recurring invoices for user
 */
export async function listRecurringInvoices(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ recurringInvoices: Record<string, unknown>[]; total: number }> {
  const { limit = 50, offset = 0 } = options;

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM recurring_invoices WHERE user_id = $1`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await db.query<Record<string, unknown>>(
    `SELECT ri.*, c.name as customer_name
     FROM recurring_invoices ri
     JOIN customers c ON c.id = ri.customer_id
     WHERE ri.user_id = $1
     ORDER BY ri.is_active DESC, ri.name ASC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const recurringInvoices = result.rows.map((row) => {
    const rec = transformRecurring(row);
    const mobile = transformForMobile(rec);
    mobile.customer_name = row.customer_name;
    return mobile;
  });

  return { recurringInvoices, total };
}

/**
 * Get pending recurring invoices split by auto-generate vs needs-input
 */
export async function getPendingRecurringInvoices(
  userId: string
): Promise<{ autoGenerate: Record<string, unknown>[]; needsInput: Record<string, unknown>[] }> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT ri.*, c.name as customer_name
     FROM recurring_invoices ri
     JOIN customers c ON c.id = ri.customer_id
     WHERE ri.user_id = $1
       AND ri.is_active = true
       AND ri.next_generation_date <= CURRENT_DATE
     ORDER BY ri.next_generation_date ASC`,
    [userId]
  );

  const autoGenerate: Record<string, unknown>[] = [];
  const needsInput: Record<string, unknown>[] = [];

  for (const row of result.rows) {
    const rec = transformRecurring(row);
    const mobile = transformForMobile(rec);
    mobile.customer_name = row.customer_name;

    if (rec.isAutoGenerate) {
      autoGenerate.push(mobile);
    } else {
      needsInput.push(mobile);
    }
  }

  return { autoGenerate, needsInput };
}

/**
 * Update recurring invoice (optionally replace line items)
 */
export async function updateRecurringInvoice(
  recurringId: string,
  userId: string,
  updates: RecurringInvoiceUpdateInput
): Promise<Record<string, unknown> | null> {
  // Verify ownership
  const existing = await db.query(
    'SELECT id FROM recurring_invoices WHERE id = $1 AND user_id = $2',
    [recurringId, userId]
  );
  if (existing.rows.length === 0) return null;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Build dynamic update for recurring_invoices fields
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      dayOfMonth: 'day_of_month',
      includeGst: 'include_gst',
      paymentTerms: 'payment_terms',
      notes: 'notes',
      isActive: 'is_active',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key] && value !== undefined) {
        fields.push(`${fieldMap[key]} = $${paramIndex++}`);
        values.push(value ?? null);
      }
    }

    // Handle line items replacement
    if (updates.lineItems) {
      // Delete existing
      await client.query(
        'DELETE FROM recurring_line_items WHERE recurring_invoice_id = $1',
        [recurringId]
      );

      // Insert new
      for (let i = 0; i < updates.lineItems.length; i++) {
        const li = updates.lineItems[i];
        await client.query(
          `INSERT INTO recurring_line_items (
            id, recurring_invoice_id, product_service_id,
            description, unit_price, quantity, type, sort_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uuidv4(),
            recurringId,
            li.productServiceId,
            li.description || null,
            li.unitPrice,
            li.quantity ?? 1,
            li.type,
            i,
          ]
        );
      }

      // Recompute is_auto_generate
      const isAutoGenerate = updates.lineItems.every((li) => li.type === 'fixed');
      fields.push(`is_auto_generate = $${paramIndex++}`);
      values.push(isAutoGenerate);
    }

    // Recompute next_generation_date if dayOfMonth changed
    if (updates.dayOfMonth !== undefined) {
      const nextGen = computeNextGenerationDate(updates.dayOfMonth);
      fields.push(`next_generation_date = $${paramIndex++}`);
      values.push(nextGen);
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      values.push(recurringId, userId);

      await client.query(
        `UPDATE recurring_invoices SET ${fields.join(', ')}
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
        values
      );
    }

    await client.query('COMMIT');
    return await getRecurringInvoiceById(recurringId, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete recurring invoice (hard delete, cascades to line items)
 */
export async function deleteRecurringInvoice(
  recurringId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM recurring_invoices WHERE id = $1 AND user_id = $2',
    [recurringId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Generate a draft invoice from a recurring invoice config
 */
export async function generateInvoiceFromRecurring(
  recurringId: string,
  userId: string,
  variableAmounts?: Record<string, number>
): Promise<Record<string, unknown>> {
  // Fetch recurring config with customer + line items
  const recResult = await db.query<Record<string, unknown>>(
    `SELECT ri.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
     FROM recurring_invoices ri
     JOIN customers c ON c.id = ri.customer_id
     WHERE ri.id = $1 AND ri.user_id = $2`,
    [recurringId, userId]
  );

  if (recResult.rows.length === 0) {
    throw new Error('Recurring invoice not found');
  }

  const recRow = recResult.rows[0];

  // Fetch line items
  const liResult = await db.query<Record<string, unknown>>(
    `SELECT rli.*, ps.name as product_name
     FROM recurring_line_items rli
     JOIN products_services ps ON ps.id = rli.product_service_id
     WHERE rli.recurring_invoice_id = $1
     ORDER BY rli.sort_order ASC`,
    [recurringId]
  );

  // Build invoice line items
  const invoiceLineItems = liResult.rows.map((li) => {
    const liId = li.id as string;
    const quantity = li.quantity as number;
    const storedPrice = li.unit_price as number;
    const type = li.type as string;

    let amount: number;
    if (type === 'variable' && variableAmounts && variableAmounts[liId] !== undefined) {
      amount = variableAmounts[liId];
    } else {
      amount = storedPrice * quantity;
    }

    const description = (li.description as string) || (li.product_name as string);
    return { description, amount };
  });

  // Calculate due date from payment terms
  const paymentTerms = recRow.payment_terms as number;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + paymentTerms);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  // Create the invoice via existing service
  const invoice = await invoicesService.createInvoice(userId, {
    clientName: recRow.customer_name as string,
    clientEmail: (recRow.customer_email as string) || undefined,
    clientPhone: (recRow.customer_phone as string) || undefined,
    lineItems: invoiceLineItems,
    includeGst: recRow.include_gst as boolean,
    dueDate: dueDateStr,
    notes: (recRow.notes as string) || undefined,
    customerId: recRow.customer_id as string,
    recurringInvoiceId: recurringId,
  });

  // Update last_generated_at and next_generation_date
  const dayOfMonth = recRow.day_of_month as number;
  const nextGen = computeNextGenerationDate(dayOfMonth);

  await db.query(
    `UPDATE recurring_invoices
     SET last_generated_at = NOW(), next_generation_date = $1, updated_at = NOW()
     WHERE id = $2`,
    [nextGen, recurringId]
  );

  return invoice as unknown as Record<string, unknown>;
}

/**
 * Get last invoice amounts for a recurring invoice (for reference when entering variable amounts)
 */
export async function getLastAmounts(
  recurringId: string,
  userId: string
): Promise<Record<string, unknown>[]> {
  // Find the most recent invoice generated from this recurring config
  const invoiceResult = await db.query<Record<string, unknown>>(
    `SELECT line_items FROM invoices
     WHERE recurring_invoice_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [recurringId, userId]
  );

  if (invoiceResult.rows.length === 0) {
    return [];
  }

  const lineItems = invoiceResult.rows[0].line_items;
  const parsed = typeof lineItems === 'string' ? JSON.parse(lineItems) : lineItems;
  return parsed || [];
}

// ---------------------------------------------------------------------------
// Create recurring template FROM an existing invoice
// ---------------------------------------------------------------------------

export interface FromInvoiceOptions {
  name?: string;
  dayOfMonth?: number;
  paymentTerms?: number;
  includeGst?: boolean;
  notes?: string;
}

interface InvoiceLineRaw {
  description?: string;
  amount?: number;
}

function parseQtyFromDescription(description: string): number {
  // "… × 2" or "x2" or "(3 hours …)"
  const mult = description.match(/[×x]\s*(\d+)/i);
  if (mult) {
    const n = parseInt(mult[1], 10);
    if (n >= 1 && n <= 999) return n;
  }
  const hours = description.match(/\((\d+)\s*hours?\b/i);
  if (hours) {
    const n = parseInt(hours[1], 10);
    if (n >= 1 && n <= 999) return n;
  }
  return 1;
}

function matchProduct(
  products: { id: string; name: string; unit_price: number; type: string }[],
  description: string
): { id: string; name: string; unit_price: number; type: string } | null {
  const desc = description.toLowerCase().trim();
  if (!desc) return null;

  // Prefer longest product name contained in the description (or vice versa)
  let best: { id: string; name: string; unit_price: number; type: string } | null = null;
  let bestLen = 0;
  for (const p of products) {
    const n = (p.name || '').toLowerCase().trim();
    if (!n) continue;
    if (desc === n || desc.startsWith(n) || desc.includes(n) || n.includes(desc)) {
      if (n.length > bestLen) {
        best = p;
        bestLen = n.length;
      }
    }
  }
  return best;
}

/**
 * Turn a one-off invoice into a monthly recurring template.
 * Requires invoice.customer_id. Line items are matched to products by name;
 * unmatched lines get a catalog product auto-created so recurring schema is happy.
 */
export async function createRecurringFromInvoice(
  userId: string,
  invoiceId: string,
  options: FromInvoiceOptions = {}
): Promise<Record<string, unknown>> {
  const invResult = await db.query<Record<string, unknown>>(
    `SELECT * FROM invoices WHERE id = $1 AND user_id = $2`,
    [invoiceId, userId]
  );
  if (invResult.rows.length === 0) {
    throw Object.assign(new Error('Invoice not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  const inv = invResult.rows[0];
  const customerId = inv.customer_id as string | null;
  if (!customerId) {
    throw Object.assign(
      new Error(
        'Invoice has no linked client. Attach a customer on the invoice first, then make it recurring.'
      ),
      { statusCode: 400, code: 'CUSTOMER_REQUIRED' }
    );
  }

  let rawLines = inv.line_items as InvoiceLineRaw[] | string | null;
  if (typeof rawLines === 'string') {
    try {
      rawLines = JSON.parse(rawLines) as InvoiceLineRaw[];
    } catch {
      rawLines = [];
    }
  }
  const lines = Array.isArray(rawLines) ? rawLines : [];
  if (lines.length === 0) {
    throw Object.assign(new Error('Invoice has no line items to copy'), {
      statusCode: 400,
      code: 'NO_LINE_ITEMS',
    });
  }

  const productsResult = await db.query<{
    id: string;
    name: string;
    unit_price: number;
    type: string;
  }>(
    `SELECT id, name, unit_price, type FROM products_services
     WHERE user_id = $1 AND is_active = true`,
    [userId]
  );
  const products = productsResult.rows;

  const lineItems: {
    productServiceId: string;
    description?: string;
    unitPrice: number;
    quantity: number;
    type: 'fixed' | 'variable';
  }[] = [];

  for (const line of lines) {
    const description = (line.description || 'Line item').trim();
    const amount = Math.max(0, Math.round(Number(line.amount) || 0));
    const quantity = parseQtyFromDescription(description);
    // Prefer invoice-derived unit price so the template matches this bill
    const unitFromInvoice = quantity > 1 ? Math.round(amount / quantity) : amount;

    let product = matchProduct(products, description);
    if (!product) {
      // Auto-create catalog entry so recurring_line_items FK is satisfied
      const created = await productsService.createProduct(userId, {
        name: description.slice(0, 255),
        description: `Auto-created from invoice ${inv.invoice_number as string}`,
        unitPrice: unitFromInvoice,
        type: 'fixed',
        isGstApplicable: true,
      });
      product = {
        id: created.id as string,
        name: created.name as string,
        unit_price: created.unit_price as number,
        type: (created.type as string) || 'fixed',
      };
      products.push(product);
    }

    const pType: 'fixed' | 'variable' =
      product.type === 'variable' ? 'variable' : 'fixed';

    // Variable lines (e.g. Google ads): qty 1, amount = this period's figure
    // Fixed multi-qty (e.g. O365 × 2): split unit × qty from invoice
    lineItems.push({
      productServiceId: product.id,
      description,
      unitPrice: pType === 'variable' ? amount : unitFromInvoice,
      quantity: pType === 'variable' ? 1 : quantity,
      type: pType,
    });
  }

  const clientName =
    (inv.client_name as string) ||
    (await db.query<{ name: string }>(`SELECT name FROM customers WHERE id = $1`, [customerId]))
      .rows[0]?.name ||
    'Client';
  const invNum = (inv.invoice_number as string) || '';
  const name =
    (options.name && options.name.trim()) ||
    `${clientName} — monthly (from ${invNum || 'invoice'})`;

  const dayOfMonth =
    options.dayOfMonth ??
    Math.min(28, Math.max(1, new Date(inv.created_at as string | Date).getDate() || 1));

  return createRecurringInvoice(userId, {
    customerId,
    name,
    dayOfMonth,
    includeGst:
      options.includeGst !== undefined
        ? options.includeGst
        : ((inv.include_gst as boolean) ?? true),
    paymentTerms: options.paymentTerms ?? 20,
    notes:
      options.notes !== undefined
        ? options.notes
        : ((inv.notes as string) || undefined),
    lineItems,
  });
}

export default {
  createRecurringInvoice,
  getRecurringInvoiceById,
  listRecurringInvoices,
  getPendingRecurringInvoices,
  updateRecurringInvoice,
  deleteRecurringInvoice,
  generateInvoiceFromRecurring,
  getLastAmounts,
  createRecurringFromInvoice,
};
