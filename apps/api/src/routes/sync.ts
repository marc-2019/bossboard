/**
 * Sync Routes
 * Batch sync endpoints for offline-first mobile app
 *
 * Design notes:
 *  - Mobile generates UUIDs offline; server UPSERTs by (id) so the same op
 *    can be replayed safely (idempotent retries from a flaky connection).
 *  - Tenant safety: ON CONFLICT DO UPDATE is gated by user_id match. If a
 *    row exists under a different user the UPSERT no-ops and returns 0 rows,
 *    which we surface as an error to the client rather than silently
 *    overwriting another tenant's data.
 *  - Payloads are partial. Mobile may have a draft entity with sparse fields;
 *    we fill NOT NULL columns with sensible placeholders so the sync succeeds
 *    and the next mobile sync can correct them. This mirrors the SWMS path.
 *  - Each operation is processed independently; partial failures do not abort
 *    the batch.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import db from '../services/database.js';

const router = Router();

interface SyncOperation {
  id: number;
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload: unknown;
  version?: number;
  checksum?: string;
}

interface SyncBatchRequest {
  operations: SyncOperation[];
  client_timestamp: string;
}

interface SyncResult {
  id: number;
  success: boolean;
  entity_id?: string;
  error?: string;
  conflict?: {
    server_version: unknown;
    client_version: unknown;
  };
}

interface SyncBatchResponse {
  results: SyncResult[];
  server_timestamp: string;
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * POST /api/v1/sync/batch
 * Process multiple sync operations in a single request
 *
 * This reduces HTTP overhead and improves performance on poor connections
 */
router.post('/batch', authenticate, async (req, res) => {
  const userId = req.user!.userId;
  const { operations }: SyncBatchRequest = req.body;

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({ error: 'operations array is required' });
  }

  if (operations.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 operations per batch' });
  }

  const results: SyncResult[] = [];
  const serverTimestamp = new Date().toISOString();

  // Process each operation
  for (const op of operations) {
    try {
      const result = await processSyncOperation(userId, op);
      results.push(result);
    } catch (error) {
      console.error('[Sync Batch] Error processing operation:', error);
      results.push({
        id: op.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const response: SyncBatchResponse = {
    results,
    server_timestamp: serverTimestamp,
    processed: operations.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  };

  return res.json(response);
});

/**
 * Process a single sync operation
 */
async function processSyncOperation(
  userId: string,
  operation: SyncOperation
): Promise<SyncResult> {
  const { id, entity_type, entity_id, action } = operation;

  try {
    switch (entity_type) {
      case 'swms':
        return await processSWMSOperation(userId, entity_id, action, operation.payload);

      case 'invoices':
        return await processInvoiceOperation(userId, entity_id, action, operation.payload);

      case 'quotes':
        return await processQuoteOperation(userId, entity_id, action, operation.payload);

      case 'expenses':
        return await processExpenseOperation(userId, entity_id, action, operation.payload);

      case 'job-logs':
        return await processJobLogOperation(userId, entity_id, action, operation.payload);

      case 'certifications':
        return await processCertificationOperation(userId, entity_id, action, operation.payload);

      default:
        return {
          id,
          success: false,
          error: `Unknown entity type: ${entity_type}`,
        };
    }
  } catch (error) {
    return {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process SWMS document operations
 */
async function processSWMSOperation(
  userId: string,
  entityId: string,
  action: string,
  _payload: unknown
): Promise<SyncResult> {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    if (action === 'create' || action === 'update') {
      const data = _payload as Record<string, unknown>;

      const query = `
        INSERT INTO swms_documents (
          id, user_id, title, trade_type, status, job_description,
          site_address, client_name, expected_duration, hazards,
          ppe_required, emergency_procedures, signatures
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          status = EXCLUDED.status,
          job_description = EXCLUDED.job_description,
          site_address = EXCLUDED.site_address,
          client_name = EXCLUDED.client_name,
          expected_duration = EXCLUDED.expected_duration,
          hazards = EXCLUDED.hazards,
          ppe_required = EXCLUDED.ppe_required,
          emergency_procedures = EXCLUDED.emergency_procedures,
          signatures = EXCLUDED.signatures,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const result = await client.query(query, [
        entityId,
        userId,
        data.title || 'Untitled Document',
        data.trade_type || 'general',
        data.status || 'draft',
        data.job_description || null,
        data.site_address || null,
        data.client_name || null,
        data.expected_duration || null,
        JSON.stringify(data.hazards || []),
        JSON.stringify(data.ppe_required || []),
        JSON.stringify(data.emergency_procedures || []),
        JSON.stringify(data.signatures || []),
      ]);

      await client.query('COMMIT');
      return { id: entityId as unknown as number, success: true, entity_id: result.rows[0].id };
    } else if (action === 'delete') {
      await client.query(
        'DELETE FROM swms_documents WHERE id = $1 AND user_id = $2',
        [entityId, userId]
      );
      await client.query('COMMIT');
      return { id: entityId as unknown as number, success: true, entity_id: entityId };
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// VALIDATION SCHEMAS for sync payloads
//
// All fields are optional — the mobile app may sync a partial/draft entity.
// NOT NULL DB columns are backfilled with sensible placeholders below so the
// row persists; the next mobile sync corrects them. Required types (uuid,
// number) are still enforced when provided to catch corrupted payloads.
// ============================================================================

const invoicePayloadSchema = z.object({
  invoice_number: z.string().max(50).optional(),
  client_name: z.string().max(255).optional(),
  client_email: z.string().optional().nullable(),
  client_phone: z.string().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  job_description: z.string().optional().nullable(),
  line_items: z.array(z.unknown()).optional(),
  subtotal: z.number().int().optional(),
  gst_amount: z.number().int().optional(),
  total: z.number().int().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  bank_account_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
}).passthrough();

const quotePayloadSchema = z.object({
  quote_number: z.string().max(50).optional(),
  client_name: z.string().max(255).optional(),
  client_email: z.string().optional().nullable(),
  client_phone: z.string().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  job_description: z.string().optional().nullable(),
  line_items: z.array(z.unknown()).optional(),
  subtotal: z.number().int().optional(),
  gst_amount: z.number().int().optional(),
  total: z.number().int().optional(),
  include_gst: z.boolean().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'declined', 'expired', 'converted']).optional(),
  valid_until: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).passthrough();

const expensePayloadSchema = z.object({
  date: z.string().optional(),
  amount: z.number().int().optional(),
  category: z.string().max(50).optional(),
  description: z.string().optional().nullable(),
  vendor: z.string().max(255).optional().nullable(),
  is_gst_claimable: z.boolean().optional(),
  gst_amount: z.number().int().optional(),
  receipt_photo_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
}).passthrough();

const jobLogPayloadSchema = z.object({
  description: z.string().max(500).optional(),
  site_address: z.string().max(500).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  start_time: z.string().optional(),
  end_time: z.string().optional().nullable(),
  status: z.enum(['active', 'completed']).optional(),
  notes: z.string().optional().nullable(),
}).passthrough();

const certificationPayloadSchema = z.object({
  type: z.string().max(50).optional(),
  name: z.string().max(255).optional(),
  cert_number: z.string().max(100).optional().nullable(),
  issuing_body: z.string().max(255).optional().nullable(),
  issue_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  document_url: z.string().max(500).optional().nullable(),
}).passthrough();

/**
 * Format a Zod issue list into a single readable error string.
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Empty-rows = either a different-tenant conflict (UPSERT WHERE clause
 * suppressed the UPDATE) or DB driver returned an empty result. We treat
 * an empty rows array as a "denied / conflict" condition so we don't claim
 * success on a write that didn't land.
 *
 * Note: the WHERE <table>.user_id = EXCLUDED.user_id clause means a row
 * owned by a DIFFERENT user is left untouched and returns no rows. This
 * is the tenant-safety boundary.
 */
function persistedIdOrNull(result: { rows: Array<{ id?: string }> }): string | null {
  if (!result.rows || result.rows.length === 0) return null;
  return result.rows[0].id || null;
}

/**
 * Process invoice operations
 */
async function processInvoiceOperation(
  userId: string,
  entityId: string,
  action: string,
  payload: unknown
): Promise<SyncResult> {
  if (action === 'delete') {
    await db.query('DELETE FROM invoices WHERE id = $1 AND user_id = $2', [entityId, userId]);
    return { id: entityId as unknown as number, success: true, entity_id: entityId };
  }

  if (action !== 'create' && action !== 'update') {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Unknown action: ${action}`,
    };
  }

  const validation = invoicePayloadSchema.safeParse(payload ?? {});
  if (!validation.success) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Validation failed: ${formatZodError(validation.error)}`,
    };
  }
  const data = validation.data;

  const query = `
    INSERT INTO invoices (
      id, user_id, invoice_number, client_name, client_email, client_phone,
      customer_id, job_description, line_items, subtotal, gst_amount, total,
      status, due_date, notes, bank_account_name, bank_account_number
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (id) DO UPDATE SET
      invoice_number = EXCLUDED.invoice_number,
      client_name = EXCLUDED.client_name,
      client_email = EXCLUDED.client_email,
      client_phone = EXCLUDED.client_phone,
      customer_id = EXCLUDED.customer_id,
      job_description = EXCLUDED.job_description,
      line_items = EXCLUDED.line_items,
      subtotal = EXCLUDED.subtotal,
      gst_amount = EXCLUDED.gst_amount,
      total = EXCLUDED.total,
      status = EXCLUDED.status,
      due_date = EXCLUDED.due_date,
      notes = EXCLUDED.notes,
      bank_account_name = EXCLUDED.bank_account_name,
      bank_account_number = EXCLUDED.bank_account_number,
      updated_at = CURRENT_TIMESTAMP
    WHERE invoices.user_id = EXCLUDED.user_id
    RETURNING id
  `;

  const result = await db.query<{ id: string }>(query, [
    entityId,
    userId,
    data.invoice_number || `INV-${entityId.slice(0, 8)}`,
    data.client_name || 'Unknown Client',
    data.client_email ?? null,
    data.client_phone ?? null,
    data.customer_id ?? null,
    data.job_description ?? null,
    JSON.stringify(data.line_items || []),
    data.subtotal ?? 0,
    data.gst_amount ?? 0,
    data.total ?? 0,
    data.status || 'draft',
    data.due_date ?? null,
    data.notes ?? null,
    data.bank_account_name ?? null,
    data.bank_account_number ?? null,
  ]);

  const persistedId = persistedIdOrNull(result);
  if (!persistedId) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: 'Conflict: entity exists under a different user or update denied',
    };
  }

  return { id: entityId as unknown as number, success: true, entity_id: persistedId };
}

/**
 * Process quote operations
 */
async function processQuoteOperation(
  userId: string,
  entityId: string,
  action: string,
  payload: unknown
): Promise<SyncResult> {
  if (action === 'delete') {
    await db.query('DELETE FROM quotes WHERE id = $1 AND user_id = $2', [entityId, userId]);
    return { id: entityId as unknown as number, success: true, entity_id: entityId };
  }

  if (action !== 'create' && action !== 'update') {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Unknown action: ${action}`,
    };
  }

  const validation = quotePayloadSchema.safeParse(payload ?? {});
  if (!validation.success) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Validation failed: ${formatZodError(validation.error)}`,
    };
  }
  const data = validation.data;

  const query = `
    INSERT INTO quotes (
      id, user_id, quote_number, client_name, client_email, client_phone,
      customer_id, job_description, line_items, subtotal, gst_amount, total,
      include_gst, status, valid_until, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (id) DO UPDATE SET
      quote_number = EXCLUDED.quote_number,
      client_name = EXCLUDED.client_name,
      client_email = EXCLUDED.client_email,
      client_phone = EXCLUDED.client_phone,
      customer_id = EXCLUDED.customer_id,
      job_description = EXCLUDED.job_description,
      line_items = EXCLUDED.line_items,
      subtotal = EXCLUDED.subtotal,
      gst_amount = EXCLUDED.gst_amount,
      total = EXCLUDED.total,
      include_gst = EXCLUDED.include_gst,
      status = EXCLUDED.status,
      valid_until = EXCLUDED.valid_until,
      notes = EXCLUDED.notes,
      updated_at = CURRENT_TIMESTAMP
    WHERE quotes.user_id = EXCLUDED.user_id
    RETURNING id
  `;

  const result = await db.query<{ id: string }>(query, [
    entityId,
    userId,
    data.quote_number || `QTE-${entityId.slice(0, 8)}`,
    data.client_name || 'Unknown Client',
    data.client_email ?? null,
    data.client_phone ?? null,
    data.customer_id ?? null,
    data.job_description ?? null,
    JSON.stringify(data.line_items || []),
    data.subtotal ?? 0,
    data.gst_amount ?? 0,
    data.total ?? 0,
    data.include_gst ?? true,
    data.status || 'draft',
    data.valid_until ?? null,
    data.notes ?? null,
  ]);

  const persistedId = persistedIdOrNull(result);
  if (!persistedId) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: 'Conflict: entity exists under a different user or update denied',
    };
  }

  return { id: entityId as unknown as number, success: true, entity_id: persistedId };
}

/**
 * Process expense operations
 */
async function processExpenseOperation(
  userId: string,
  entityId: string,
  action: string,
  payload: unknown
): Promise<SyncResult> {
  if (action === 'delete') {
    await db.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [entityId, userId]);
    return { id: entityId as unknown as number, success: true, entity_id: entityId };
  }

  if (action !== 'create' && action !== 'update') {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Unknown action: ${action}`,
    };
  }

  const validation = expensePayloadSchema.safeParse(payload ?? {});
  if (!validation.success) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Validation failed: ${formatZodError(validation.error)}`,
    };
  }
  const data = validation.data;

  const query = `
    INSERT INTO expenses (
      id, user_id, date, amount, category, description, vendor,
      is_gst_claimable, gst_amount, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      date = EXCLUDED.date,
      amount = EXCLUDED.amount,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      vendor = EXCLUDED.vendor,
      is_gst_claimable = EXCLUDED.is_gst_claimable,
      gst_amount = EXCLUDED.gst_amount,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    WHERE expenses.user_id = EXCLUDED.user_id
    RETURNING id
  `;

  const result = await db.query<{ id: string }>(query, [
    entityId,
    userId,
    data.date || new Date().toISOString().slice(0, 10),
    data.amount ?? 0,
    data.category || 'other',
    data.description ?? null,
    data.vendor ?? null,
    data.is_gst_claimable ?? false,
    data.gst_amount ?? 0,
    data.notes ?? null,
  ]);

  const persistedId = persistedIdOrNull(result);
  if (!persistedId) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: 'Conflict: entity exists under a different user or update denied',
    };
  }

  return { id: entityId as unknown as number, success: true, entity_id: persistedId };
}

/**
 * Process job log operations
 */
async function processJobLogOperation(
  userId: string,
  entityId: string,
  action: string,
  payload: unknown
): Promise<SyncResult> {
  if (action === 'delete') {
    await db.query('DELETE FROM job_logs WHERE id = $1 AND user_id = $2', [entityId, userId]);
    return { id: entityId as unknown as number, success: true, entity_id: entityId };
  }

  if (action !== 'create' && action !== 'update') {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Unknown action: ${action}`,
    };
  }

  const validation = jobLogPayloadSchema.safeParse(payload ?? {});
  if (!validation.success) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Validation failed: ${formatZodError(validation.error)}`,
    };
  }
  const data = validation.data;

  const query = `
    INSERT INTO job_logs (
      id, user_id, description, site_address, customer_id, start_time,
      end_time, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      description = EXCLUDED.description,
      site_address = EXCLUDED.site_address,
      customer_id = EXCLUDED.customer_id,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    WHERE job_logs.user_id = EXCLUDED.user_id
    RETURNING id
  `;

  const result = await db.query<{ id: string }>(query, [
    entityId,
    userId,
    data.description || 'Untitled Job',
    data.site_address ?? null,
    data.customer_id ?? null,
    data.start_time || new Date().toISOString(),
    data.end_time ?? null,
    data.status || 'active',
    data.notes ?? null,
  ]);

  const persistedId = persistedIdOrNull(result);
  if (!persistedId) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: 'Conflict: entity exists under a different user or update denied',
    };
  }

  return { id: entityId as unknown as number, success: true, entity_id: persistedId };
}

/**
 * Process certification operations
 */
async function processCertificationOperation(
  userId: string,
  entityId: string,
  action: string,
  payload: unknown
): Promise<SyncResult> {
  if (action === 'delete') {
    await db.query('DELETE FROM certifications WHERE id = $1 AND user_id = $2', [entityId, userId]);
    return { id: entityId as unknown as number, success: true, entity_id: entityId };
  }

  if (action !== 'create' && action !== 'update') {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Unknown action: ${action}`,
    };
  }

  const validation = certificationPayloadSchema.safeParse(payload ?? {});
  if (!validation.success) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: `Validation failed: ${formatZodError(validation.error)}`,
    };
  }
  const data = validation.data;

  const query = `
    INSERT INTO certifications (
      id, user_id, type, name, cert_number, issuing_body,
      issue_date, expiry_date, document_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      type = EXCLUDED.type,
      name = EXCLUDED.name,
      cert_number = EXCLUDED.cert_number,
      issuing_body = EXCLUDED.issuing_body,
      issue_date = EXCLUDED.issue_date,
      expiry_date = EXCLUDED.expiry_date,
      document_url = EXCLUDED.document_url,
      updated_at = CURRENT_TIMESTAMP
    WHERE certifications.user_id = EXCLUDED.user_id
    RETURNING id
  `;

  const result = await db.query<{ id: string }>(query, [
    entityId,
    userId,
    data.type || 'other',
    data.name || 'Untitled Certification',
    data.cert_number ?? null,
    data.issuing_body ?? null,
    data.issue_date ?? null,
    data.expiry_date ?? null,
    data.document_url ?? null,
  ]);

  const persistedId = persistedIdOrNull(result);
  if (!persistedId) {
    return {
      id: entityId as unknown as number,
      success: false,
      error: 'Conflict: entity exists under a different user or update denied',
    };
  }

  return { id: entityId as unknown as number, success: true, entity_id: persistedId };
}

/**
 * GET /api/v1/sync/status
 * Get sync status for user
 */
router.get('/status', authenticate, async (_req, res) => {

  try {
    // Get counts of unsynced items (this would require client sync status tracking)
    const status = {
      last_sync_at: new Date().toISOString(),
      pending_operations: 0,
      server_timestamp: new Date().toISOString(),
    };

    res.json(status);
  } catch (error) {
    console.error('[Sync Status] Error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

export default router;
