/**
 * Business documents — user-uploaded contracts / T&Cs.
 * Storage + ownership only; legal content is the user's responsibility.
 */

import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import db from './database.js';

export type DocumentScope = 'company' | 'customer' | 'invoice';
export type DocumentKind = 'terms' | 'contract' | 'other';

export const DOCUMENT_DISCLAIMER =
  'Documents are uploaded and controlled by the business using BossBoard. ' +
  'BossBoard does not draft, review, or take responsibility for contracts, terms and conditions, or other legal content. ' +
  'The business is solely responsible for what they attach and send to clients.';

const UPLOAD_DIR = path.resolve('./uploads/documents');

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    /* exists */
  }
}
ensureUploadDir();

export function getDocumentsUploadDir(): string {
  return UPLOAD_DIR;
}

function transform(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    scope: row.scope as DocumentScope,
    customerId: (row.customer_id as string) || null,
    invoiceId: (row.invoice_id as string) || null,
    title: row.title as string,
    docKind: row.doc_kind as DocumentKind,
    filename: row.filename as string,
    originalFilename: (row.original_filename as string) || null,
    mimeType: row.mime_type as string,
    fileSize: (row.file_size as number) || null,
    includeOnInvoices: row.include_on_invoices as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    url: `/api/v1/documents/${row.id}/file`,
  };
}

export async function createDocument(
  userId: string,
  input: {
    scope: DocumentScope;
    customerId?: string | null;
    invoiceId?: string | null;
    title: string;
    docKind?: DocumentKind;
    filename: string;
    originalFilename?: string;
    mimeType: string;
    fileSize?: number;
    storagePath: string;
    includeOnInvoices?: boolean;
  },
) {
  // Ownership checks
  if (input.scope === 'customer' && input.customerId) {
    const c = await db.query(`SELECT id FROM customers WHERE id = $1 AND user_id = $2`, [
      input.customerId,
      userId,
    ]);
    if (c.rows.length === 0) throw Object.assign(new Error('Customer not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }
  if (input.scope === 'invoice' && input.invoiceId) {
    const inv = await db.query(`SELECT id FROM invoices WHERE id = $1 AND user_id = $2`, [
      input.invoiceId,
      userId,
    ]);
    if (inv.rows.length === 0) throw Object.assign(new Error('Invoice not found'), { statusCode: 404, code: 'NOT_FOUND' });
  }

  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO business_documents (
      id, user_id, scope, customer_id, invoice_id, title, doc_kind,
      filename, original_filename, mime_type, file_size, storage_path, include_on_invoices
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    [
      id,
      userId,
      input.scope,
      input.scope === 'customer' ? input.customerId || null : null,
      input.scope === 'invoice' ? input.invoiceId || null : null,
      input.title.trim(),
      input.docKind || 'terms',
      input.filename,
      input.originalFilename || null,
      input.mimeType,
      input.fileSize || null,
      input.storagePath,
      input.includeOnInvoices ?? true,
    ],
  );
  return transform(result.rows[0]);
}

export async function listDocuments(
  userId: string,
  opts: { scope?: DocumentScope; customerId?: string; invoiceId?: string } = {},
) {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];
  let i = 2;
  if (opts.scope) {
    conditions.push(`scope = $${i++}`);
    params.push(opts.scope);
  }
  if (opts.customerId) {
    conditions.push(`customer_id = $${i++}`);
    params.push(opts.customerId);
  }
  if (opts.invoiceId) {
    conditions.push(`invoice_id = $${i++}`);
    params.push(opts.invoiceId);
  }
  const result = await db.query(
    `SELECT * FROM business_documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return result.rows.map(transform);
}

/** Docs to show with an invoice: company defaults + this client + invoice-specific */
export async function listDocumentsForInvoice(
  userId: string,
  opts: { customerId?: string | null; invoiceId: string },
) {
  const result = await db.query(
    `SELECT * FROM business_documents
     WHERE user_id = $1
       AND (
         (scope = 'company' AND include_on_invoices = TRUE)
         OR (scope = 'customer' AND customer_id = $2 AND include_on_invoices = TRUE)
         OR (scope = 'invoice' AND invoice_id = $3)
       )
     ORDER BY
       CASE scope WHEN 'company' THEN 0 WHEN 'customer' THEN 1 ELSE 2 END,
       created_at DESC`,
    [userId, opts.customerId || null, opts.invoiceId],
  );
  return result.rows.map(transform);
}

export async function getDocument(id: string, userId: string) {
  const result = await db.query(`SELECT * FROM business_documents WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  if (result.rows.length === 0) return null;
  return { ...transform(result.rows[0]), storagePath: result.rows[0].storage_path as string };
}

export async function deleteDocument(id: string, userId: string): Promise<boolean> {
  const existing = await getDocument(id, userId);
  if (!existing) return false;
  await db.query(`DELETE FROM business_documents WHERE id = $1 AND user_id = $2`, [id, userId]);
  try {
    await fs.unlink(existing.storagePath);
  } catch {
    /* file may already be gone */
  }
  return true;
}

export async function updateDocument(
  id: string,
  userId: string,
  updates: { title?: string; includeOnInvoices?: boolean; docKind?: DocumentKind },
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (updates.title !== undefined) {
    fields.push(`title = $${i++}`);
    values.push(updates.title.trim());
  }
  if (updates.includeOnInvoices !== undefined) {
    fields.push(`include_on_invoices = $${i++}`);
    values.push(updates.includeOnInvoices);
  }
  if (updates.docKind !== undefined) {
    fields.push(`doc_kind = $${i++}`);
    values.push(updates.docKind);
  }
  if (fields.length === 0) return getDocument(id, userId);
  fields.push('updated_at = NOW()');
  values.push(id, userId);
  const result = await db.query(
    `UPDATE business_documents SET ${fields.join(', ')}
     WHERE id = $${i++} AND user_id = $${i}
     RETURNING *`,
    values,
  );
  if (result.rows.length === 0) return null;
  return transform(result.rows[0]);
}

export default {
  DOCUMENT_DISCLAIMER,
  getDocumentsUploadDir,
  createDocument,
  listDocuments,
  listDocumentsForInvoice,
  getDocument,
  deleteDocument,
  updateDocument,
};
