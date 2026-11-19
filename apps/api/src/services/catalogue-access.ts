/**
 * Team catalogue scope.
 *
 * Visible: team product on the user's current team when their level is view
 * or edit (owner and admin are always edit), or a solo product (team_id null)
 * owned by that user.
 * Editable: solo owner of a team_id-null product, team owner/admin, or a
 * member with level edit.
 *
 * productVisibleTo, productEditableBy, canReadTeamCatalogue,
 * canEditTeamCatalogue, and callerMaySetCatalogueAccess are the scope checks.
 * MUST-FAIL tests fail if these allow a refusal case.
 */

import db from './database.js';
import { createError } from '../middleware/error.js';
import type { CatalogueAccess, TeamRole } from '../types/index.js';

export interface CatalogueActor {
  userId: string;
  teamId: string | null;
  role: TeamRole | null;
  /** null means no current accepted team (solo). */
  level: CatalogueAccess | null;
}

export interface CatalogueProductScope {
  team_id?: string | null;
  user_id?: string | null;
}

function isTeamRole(value: string | null | undefined): value is TeamRole {
  return value === 'owner' || value === 'admin' || value === 'worker';
}

export function effectiveCatalogueLevel(
  role: TeamRole,
  stored: string | null | undefined,
): CatalogueAccess {
  if (role === 'owner' || role === 'admin') return 'edit';
  if (stored === 'none' || stored === 'edit') return stored;
  return 'view';
}

export function actorFromRow(
  userId: string,
  row: {
    team_id?: string | null;
    role?: string | null;
    catalogue_access?: string | null;
  } | undefined,
): CatalogueActor {
  const teamId = row?.team_id ?? null;
  const rawRole = row?.role ?? null;
  if (!teamId || !isTeamRole(rawRole)) {
    return { userId, teamId: null, role: null, level: null };
  }
  return {
    userId,
    teamId,
    role: rawRole,
    level: effectiveCatalogueLevel(rawRole, row?.catalogue_access),
  };
}

/** SCOPE CHECK — team catalogue read. */
export function canReadTeamCatalogue(actor: CatalogueActor): boolean {
  return actor.teamId != null && (actor.level === 'view' || actor.level === 'edit');
}

/** SCOPE CHECK — team catalogue create/update/delete. */
export function canEditTeamCatalogue(actor: CatalogueActor): boolean {
  return actor.teamId != null && actor.level === 'edit';
}

/** SCOPE CHECK — who may set team_members.catalogue_access. */
export function callerMaySetCatalogueAccess(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** SCOPE CHECK — row visibility, including rows a query failed to filter. */
export function productVisibleTo(
  actor: CatalogueActor,
  product: CatalogueProductScope,
): boolean {
  const teamId = product.team_id ?? null;
  if (teamId == null) {
    return product.user_id === actor.userId;
  }
  return actor.teamId === teamId && canReadTeamCatalogue(actor);
}

/** SCOPE CHECK — row edit, including rows a query failed to filter. */
export function productEditableBy(
  actor: CatalogueActor,
  product: CatalogueProductScope,
): boolean {
  const teamId = product.team_id ?? null;
  if (teamId == null) {
    return product.user_id === actor.userId;
  }
  return actor.teamId === teamId && canEditTeamCatalogue(actor);
}

export function catalogueVisibilitySql(
  userParam: number,
  canReadParam: number,
  teamParam: number,
): string {
  return `(
    (team_id IS NULL AND user_id = $${userParam})
    OR ($${canReadParam}::boolean IS TRUE AND team_id = $${teamParam}::uuid)
  )`;
}

export function catalogueEditableSql(
  userParam: number,
  canEditParam: number,
  teamParam: number,
): string {
  return `(
    (team_id IS NULL AND user_id = $${userParam})
    OR ($${canEditParam}::boolean IS TRUE AND team_id = $${teamParam}::uuid)
  )`;
}

export async function loadCatalogueActor(userId: string): Promise<CatalogueActor> {
  const result = await db.query<{
    team_id: string | null;
    role: string | null;
    catalogue_access: string | null;
  }>(
    `SELECT u.team_id, tm.role, tm.catalogue_access
     FROM users u
     LEFT JOIN team_members tm
       ON tm.user_id = u.id
      AND tm.team_id = u.team_id
      AND tm.invite_status = 'accepted'
     WHERE u.id = $1`,
    [userId],
  );
  return actorFromRow(userId, result.rows[0]);
}

export function catalogueForbidden(): Error {
  return createError(
    'You do not have edit access to the team catalogue',
    403,
    'CATALOGUE_FORBIDDEN',
  );
}
