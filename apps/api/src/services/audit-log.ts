/**
 * Compliance Audit Log Service
 *
 * Append-only audit trail for compliance document changes (SWMS today;
 * risk assessments + WorkSafe checklists in future).
 *
 * WHY: WorkSafe NZ audits routinely ask "who changed this SWMS, when,
 * and what changed?" Without an audit trail, a tradie has no defensible
 * answer. Every create/update/delete/sign event flows through here.
 *
 * Design intent:
 * - Best-effort writes: a logging failure must NEVER block the user's
 *   primary operation (create/update/sign). Errors are logged to console
 *   and swallowed.
 * - JSONB diffs: only changed fields are recorded for UPDATE, so storage
 *   stays small and review is readable.
 * - PII-aware: signatures are large opaque strings — we record the role
 *   and timestamp but never the raw signature blob.
 */

import db from './database.js';

export type ComplianceEntityType = 'swms' | 'risk_assessment' | 'checklist';
export type ComplianceAuditAction = 'create' | 'update' | 'delete' | 'sign';

export interface AuditLogEntry {
  id: string;
  entityType: ComplianceEntityType;
  entityId: string;
  action: ComplianceAuditAction;
  actorUserId: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Field-level diff between two snapshots of the same entity.
 *
 * Returns only fields that differ. Skips: large opaque blobs (signatures),
 * timestamps that change every save (updated_at), and internal sync flags.
 */
export function diffEntity(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> {
  const SKIP_FIELDS = new Set([
    'updated_at',
    'updatedAt',
    'is_synced',
    'isSynced',
    'local_id',
    'localId',
    'worker_signature',
    'workerSignature',
    'supervisor_signature',
    'supervisorSignature',
  ]);

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    // JSON-compare to handle arrays/objects cleanly.
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }

  return diff;
}

/**
 * Write an audit log entry. Never throws — logging must not break primary ops.
 */
export async function record(params: {
  entityType: ComplianceEntityType;
  entityId: string;
  action: ComplianceAuditAction;
  actorUserId: string | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.query(
      `INSERT INTO compliance_audit_log
         (entity_type, entity_id, action, actor_user_id, changes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.entityType,
        params.entityId,
        params.action,
        params.actorUserId,
        params.changes ? JSON.stringify(params.changes) : null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
    );
  } catch (err) {
    // Best-effort: never break the primary operation if audit logging fails.
    console.error('[audit-log] Failed to record event (non-fatal):', {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Fetch audit log entries for a single entity, newest first.
 */
export async function listForEntity(
  entityType: ComplianceEntityType,
  entityId: string,
  limit = 100,
): Promise<AuditLogEntry[]> {
  const result = await db.query<{
    id: string;
    entity_type: ComplianceEntityType;
    entity_id: string;
    action: ComplianceAuditAction;
    actor_user_id: string | null;
    changes: Record<string, { old: unknown; new: unknown }> | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, entity_type, entity_id, action, actor_user_id,
            changes, metadata, created_at
     FROM compliance_audit_log
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit],
  );

  return result.rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    actorUserId: r.actor_user_id,
    changes: r.changes,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
}

export default {
  record,
  listForEntity,
  diffEntity,
};
