/**
 * Data-access audit log (customers, business profile).
 * Best-effort: never throws into the request path.
 */

import db from './database.js';

export type DataEntityType = 'customer' | 'business_profile';
export type DataAccessAction = 'create' | 'read' | 'list' | 'update' | 'delete';

export async function recordDataAccess(params: {
  entityType: DataEntityType;
  entityId?: string | null;
  action: DataAccessAction;
  actorUserId: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.query(
      `INSERT INTO data_access_audit_log
         (entity_type, entity_id, action, actor_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.entityType,
        params.entityId || null,
        params.action,
        params.actorUserId,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
    );
  } catch (err) {
    console.error(
      '[data-access-audit] write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

export default { recordDataAccess };
