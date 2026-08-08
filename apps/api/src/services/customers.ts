/**
 * Customers Service
 * Customer management with contact details and billing preferences.
 * Sensitive fields encrypted at rest when FIELD_ENCRYPTION_KEY is configured.
 */

import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import {
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
} from '../types/index.js';
import {
  encryptField,
  decryptField,
  blindIndex,
  looksLikeBankAccountDetails,
  BANK_DETAILS_IN_NOTES_MESSAGE,
} from '../utils/field-crypto.js';
import { recordDataAccess } from './data-access-audit.js';
import { createError } from '../middleware/error.js';

/**
 * Transform DB row to Customer type with proper casing (decrypted PII).
 */
function transformCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    email: decryptField(row.email as string | null),
    phone: decryptField(row.phone as string | null),
    address: decryptField(row.address as string | null),
    notes: decryptField(row.notes as string | null),
    defaultPaymentTerms: row.default_payment_terms as number | null,
    defaultIncludeGst: row.default_include_gst as boolean,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(customer: Customer): Record<string, unknown> {
  return {
    id: customer.id,
    user_id: customer.userId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
    default_payment_terms: customer.defaultPaymentTerms,
    default_include_gst: customer.defaultIncludeGst,
    is_active: customer.isActive,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}

function assertNoBankInNotes(notes: string | null | undefined): void {
  if (looksLikeBankAccountDetails(notes)) {
    throw createError(BANK_DETAILS_IN_NOTES_MESSAGE, 400, 'BANK_DETAILS_IN_NOTES');
  }
}

/**
 * Create a new customer
 */
export async function createCustomer(
  userId: string,
  input: CustomerCreateInput
): Promise<Record<string, unknown>> {
  assertNoBankInNotes(input.notes);

  const customerId = uuidv4();
  const emailPlain = input.email || null;
  const emailEnc = encryptField(emailPlain);
  const emailBlind = blindIndex(emailPlain);

  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO customers (
      id, user_id, name, email, email_blind, phone,
      address, notes, default_payment_terms, default_include_gst
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      customerId,
      userId,
      input.name,
      emailEnc,
      emailBlind,
      encryptField(input.phone || null),
      encryptField(input.address || null),
      encryptField(input.notes || null),
      input.defaultPaymentTerms || null,
      input.defaultIncludeGst ?? true,
    ]
  );

  const customer = transformForMobile(transformCustomer(result.rows[0]));
  await recordDataAccess({
    entityType: 'customer',
    entityId: customerId,
    action: 'create',
    actorUserId: userId,
    metadata: { name: input.name },
  });
  return customer;
}

/**
 * Get customer by ID
 */
export async function getCustomerById(
  customerId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM customers WHERE id = $1 AND user_id = $2`,
    [customerId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  await recordDataAccess({
    entityType: 'customer',
    entityId: customerId,
    action: 'read',
    actorUserId: userId,
  });

  return transformForMobile(transformCustomer(result.rows[0]));
}

/**
 * List customers for user
 */
export async function listCustomers(
  userId: string,
  options: { search?: string; limit?: number; offset?: number; includeInactive?: boolean } = {}
): Promise<{ customers: Record<string, unknown>[]; total: number }> {
  const { search, limit = 50, offset = 0, includeInactive = false } = options;

  const conditions: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (!includeInactive) {
    conditions.push('is_active = true');
  }

  if (search) {
    const q = search.trim();
    // Email is encrypted — exact match via blind index; name remains searchable
    if (q.includes('@')) {
      conditions.push(`email_blind = $${paramIndex}`);
      params.push(blindIndex(q));
      paramIndex++;
    } else {
      conditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${q}%`);
      paramIndex++;
    }
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM customers WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM customers
     WHERE ${whereClause}
     ORDER BY name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const customers = result.rows.map((row) =>
    transformForMobile(transformCustomer(row))
  );

  await recordDataAccess({
    entityType: 'customer',
    entityId: null,
    action: 'list',
    actorUserId: userId,
    metadata: { count: customers.length, total, search: search || null },
  });

  return { customers, total };
}

/**
 * Update customer
 */
export async function updateCustomer(
  customerId: string,
  userId: string,
  updates: CustomerUpdateInput
): Promise<Record<string, unknown> | null> {
  if (updates.notes !== undefined) {
    assertNoBankInNotes(updates.notes);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    name: 'name',
    email: 'email',
    phone: 'phone',
    address: 'address',
    notes: 'notes',
    defaultPaymentTerms: 'default_payment_terms',
    defaultIncludeGst: 'default_include_gst',
    isActive: 'is_active',
  };

  const sensitive = new Set(['email', 'phone', 'address', 'notes']);

  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key] && value !== undefined) {
      fields.push(`${fieldMap[key]} = $${paramIndex++}`);
      if (sensitive.has(key)) {
        values.push(value === null ? null : encryptField(String(value)));
      } else {
        values.push(value ?? null);
      }
      if (key === 'email') {
        fields.push(`email_blind = $${paramIndex++}`);
        values.push(value === null ? null : blindIndex(String(value)));
      }
    }
  }

  if (fields.length === 0) {
    return getCustomerById(customerId, userId);
  }

  fields.push('updated_at = NOW()');
  values.push(customerId, userId);

  const result = await db.query<Record<string, unknown>>(
    `UPDATE customers SET ${fields.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  await recordDataAccess({
    entityType: 'customer',
    entityId: customerId,
    action: 'update',
    actorUserId: userId,
    metadata: { fields: Object.keys(updates) },
  });

  return transformForMobile(transformCustomer(result.rows[0]));
}

/**
 * Soft-delete customer (set is_active = false)
 */
export async function deleteCustomer(
  customerId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    `UPDATE customers SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [customerId, userId]
  );
  const ok = (result.rowCount ?? 0) > 0;
  if (ok) {
    await recordDataAccess({
      entityType: 'customer',
      entityId: customerId,
      action: 'delete',
      actorUserId: userId,
    });
  }
  return ok;
}

export default {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  deleteCustomer,
};
