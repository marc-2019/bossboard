/**
 * Teams Service
 * Multi-user / team support with owner, admin, worker roles
 * Flat team model - no hierarchies
 */

import crypto from 'crypto';
import { sendTeamInviteEmail } from './email.js';
import { config } from '../config/index.js';
import db from './database.js';
import {
  Team,
  TeamMember,
  TeamInvite,
  TeamInviteResult,
  TeamRole,
  TeamCreateInput,
  TeamInviteMemberInput,
} from '../types/index.js';
import { createError } from '../middleware/error.js';

// =============================================================================
// TEAM CRUD
// =============================================================================

/**
 * Create a new team. The creator becomes the owner.
 */
async function createTeam(userId: string, input: TeamCreateInput): Promise<{ team: Team; membership: TeamMember }> {
  const { name } = input;

  if (!name || name.trim().length === 0) {
    throw createError('Team name is required', 400, 'VALIDATION_ERROR');
  }

  // Check if user already owns a team
  const existingTeam = await db.query<{ id: string }>(
    'SELECT id FROM teams WHERE owner_id = $1',
    [userId]
  );

  if (existingTeam.rows.length > 0) {
    throw createError('You already own a team. Each user can own one team.', 400, 'TEAM_EXISTS');
  }

  // Create the team
  const teamResult = await db.query<{
    id: string;
    name: string;
    owner_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO teams (name, owner_id)
     VALUES ($1, $2)
     RETURNING id, name, owner_id, created_at, updated_at`,
    [name.trim(), userId]
  );

  const teamRow = teamResult.rows[0];
  const team: Team = {
    id: teamRow.id,
    name: teamRow.name,
    ownerId: teamRow.owner_id,
    createdAt: teamRow.created_at,
    updatedAt: teamRow.updated_at,
  };

  // Add the owner as a team member with 'accepted' status
  const memberResult = await db.query<{
    id: string;
    team_id: string;
    user_id: string;
    role: string;
    invite_status: string;
    invited_by: string | null;
    invited_email: string | null;
    invited_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO team_members (team_id, user_id, role, invite_status, accepted_at)
     VALUES ($1, $2, 'owner', 'accepted', NOW())
     RETURNING id, team_id, user_id, role, invite_status, invited_by, invited_email,
               invited_at, accepted_at, created_at, updated_at`,
    [team.id, userId]
  );

  const memberRow = memberResult.rows[0];
  const membership = mapMemberRow(memberRow);

  // Set this team as the user's primary team
  await db.query(
    'UPDATE users SET team_id = $1 WHERE id = $2',
    [team.id, userId]
  );

  return { team, membership };
}

/**
 * Get team by ID (only if user is a member)
 */
async function getTeam(userId: string, teamId: string): Promise<Team | null> {
  // Verify membership
  await requireMembership(userId, teamId);

  const result = await db.query<{
    id: string;
    name: string;
    owner_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    'SELECT id, name, owner_id, created_at, updated_at FROM teams WHERE id = $1',
    [teamId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get team for current user (their primary team)
 */
async function getMyTeam(userId: string): Promise<{ team: Team; role: TeamRole; members: TeamMember[] } | null> {
  // Find accepted team membership
  const memberResult = await db.query<{
    team_id: string;
    role: string;
  }>(
    `SELECT team_id, role FROM team_members
     WHERE user_id = $1 AND invite_status = 'accepted'
     ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );

  if (memberResult.rows.length === 0) return null;

  const { team_id: teamId, role } = memberResult.rows[0];

  const teamResult = await db.query<{
    id: string;
    name: string;
    owner_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    'SELECT id, name, owner_id, created_at, updated_at FROM teams WHERE id = $1',
    [teamId]
  );

  if (teamResult.rows.length === 0) return null;

  const teamRow = teamResult.rows[0];
  const team: Team = {
    id: teamRow.id,
    name: teamRow.name,
    ownerId: teamRow.owner_id,
    createdAt: teamRow.created_at,
    updatedAt: teamRow.updated_at,
  };

  const members = await listMembers(userId, teamId);

  return { team, role: role as TeamRole, members };
}

/**
 * Update team name (owner/admin only)
 */
async function updateTeam(userId: string, teamId: string, name: string): Promise<Team> {
  await requireRole(userId, teamId, ['owner', 'admin']);

  if (!name || name.trim().length === 0) {
    throw createError('Team name is required', 400, 'VALIDATION_ERROR');
  }

  const result = await db.query<{
    id: string;
    name: string;
    owner_id: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE teams SET name = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, owner_id, created_at, updated_at`,
    [name.trim(), teamId]
  );

  if (result.rows.length === 0) {
    throw createError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// TEAM MEMBERS
// =============================================================================

/**
 * List team members (accepted members only, unless owner/admin)
 */
async function listMembers(userId: string, teamId: string): Promise<TeamMember[]> {
  await requireMembership(userId, teamId);

  const result = await db.query<{
    id: string;
    team_id: string;
    user_id: string;
    role: string;
    invite_status: string;
    invited_by: string | null;
    invited_email: string | null;
    invited_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    updated_at: Date;
    user_name: string | null;
    user_email: string;
  }>(
    `SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.invite_status,
            tm.invited_by, tm.invited_email, tm.invited_at, tm.accepted_at,
            tm.created_at, tm.updated_at,
            u.name as user_name, u.email as user_email
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.role = 'owner' DESC, tm.role = 'admin' DESC, tm.created_at ASC`,
    [teamId]
  );

  return result.rows.map(row => ({
    ...mapMemberRow(row),
    userName: row.user_name || undefined,
    userEmail: row.user_email,
  }));
}

/**
 * Invite a new member to the team by email
 * Creates a team_invite record with a unique invite code
 */
async function inviteMember(
  userId: string,
  teamId: string,
  input: TeamInviteMemberInput
): Promise<TeamInviteResult> {
  await requireRole(userId, teamId, ['owner', 'admin']);

  const { email, role = 'worker' } = input;

  if (!email || !email.includes('@')) {
    throw createError('Valid email is required', 400, 'VALIDATION_ERROR');
  }

  // Can't invite someone as owner
  if (role === 'owner') {
    throw createError('Cannot invite someone as owner', 400, 'INVALID_ROLE');
  }

  const normalizedEmail = email.toLowerCase().trim();

  const row = await db.transaction(async (client) => {
    // Serialize invitations for a team, including when no invite row exists yet.
    await client.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [teamId]);
    const existingMember = await client.query(
      `SELECT tm.id FROM team_members tm JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND lower(u.email) = $2 AND tm.invite_status = 'accepted'`,
      [teamId, normalizedEmail]
    );
    if (existingMember.rows.length) {
      throw createError('This user is already a member', 400, 'ALREADY_MEMBER');
    }
    const existingInvite = await client.query(
      `SELECT id FROM team_invites WHERE team_id = $1 AND email = $2
       AND accepted_at IS NULL AND expires_at > NOW()`, [teamId, normalizedEmail]
    );
    if (existingInvite.rows.length) {
      throw createError('An invite is already pending for this email', 400, 'INVITE_PENDING');
    }
    await client.query(
      'DELETE FROM team_invites WHERE team_id = $1 AND email = $2',
      [teamId, normalizedEmail]
    );
    // Generate invite code (URL-safe)
    const inviteCode = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

    const result = await client.query<{
      id: string;
      team_id: string;
      email: string;
      role: string;
      invited_by: string;
      invite_code: string;
      expires_at: Date;
      accepted_at: Date | null;
      created_at: Date;
    }>(
      `INSERT INTO team_invites (team_id, email, role, invited_by, invite_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, team_id, email, role, invited_by, invite_code, expires_at, accepted_at, created_at`,
      [teamId, normalizedEmail, role, userId, inviteCode, expiresAt]
    );

    const row = result.rows[0];

    // Also check if the user already exists - if so, create a pending team_member entry
    const existingUser = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 AND is_active = true',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      const invitedUserId = existingUser.rows[0].id;
      await client.query(
        `INSERT INTO team_members (team_id, user_id, role, invite_status, invited_by, invited_email)
         VALUES ($1, $2, $3, 'pending', $4, $5)
         ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role,
         invite_status = 'pending', invited_by = EXCLUDED.invited_by, invited_at = NOW(), updated_at = NOW()`,
        [teamId, invitedUserId, role, userId, normalizedEmail]
      );
    }

    return row;
  });

  let emailSent = false;
  try {
    const context = await db.query<{ team_name: string; name: string | null; email: string }>(
      `SELECT t.name AS team_name, u.name, u.email FROM teams t
       JOIN users u ON u.id = $2 WHERE t.id = $1`, [teamId, userId]
    );
    const inviter = context.rows[0];
    const { messageId } = await sendTeamInviteEmail(row.email, {
      teamName: inviter.team_name, inviterName: inviter.name, inviterEmail: inviter.email,
      acceptUrl: `${config.webUrl.replace(/\/$/, '')}/invite/${row.invite_code}`,
    });
    console.log('[Teams] Invite email sent', { messageId });
    emailSent = true;
  } catch {
    console.error('[Teams] Invite email delivery failed', { inviteId: row.id });
  }
  return {
    emailSent,
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role as TeamRole,
    invitedBy: row.invited_by,
    inviteCode: row.invite_code,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

async function getInviteInfo(inviteCode: string, userId: string) {
  const result = await db.query<{ team_name: string; email: string; accepted_at: Date | null; expires_at: Date }>(
    `SELECT t.name AS team_name, ti.email, ti.accepted_at, ti.expires_at
     FROM team_invites ti JOIN teams t ON t.id = ti.team_id WHERE ti.invite_code = $1`, [inviteCode]
  );
  const invite = result.rows[0];
  if (!invite) throw createError('Invalid invite code', 404, 'INVITE_NOT_FOUND');
  if (invite.accepted_at || new Date(invite.expires_at) <= new Date()) {
    throw createError('Invitation is no longer available', 410, 'INVITE_UNAVAILABLE');
  }
  const user = await db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  return { teamName: invite.team_name, invitedEmail: invite.email,
    matchesEmail: user.rows[0]?.email.toLowerCase() === invite.email.toLowerCase() };
}

/**
 * Accept a team invite using invite code
 */
async function acceptInvite(userId: string, inviteCode: string): Promise<TeamMember> {
  // Find the invite
  const inviteResult = await db.query<{
    id: string;
    team_id: string;
    email: string;
    role: string;
    expires_at: Date;
    accepted_at: Date | null;
  }>(
    `SELECT id, team_id, email, role, expires_at, accepted_at
     FROM team_invites
     WHERE invite_code = $1`,
    [inviteCode]
  );

  if (inviteResult.rows.length === 0) {
    throw createError('Invalid invite code', 404, 'INVITE_NOT_FOUND');
  }

  const invite = inviteResult.rows[0];

  if (invite.accepted_at) {
    throw createError('This invite has already been accepted', 400, 'INVITE_ALREADY_ACCEPTED');
  }

  if (new Date() > invite.expires_at) {
    throw createError('This invite has expired', 400, 'INVITE_EXPIRED');
  }

  // Verify the user's email matches the invite email
  const userResult = await db.query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (userResult.rows[0].email.toLowerCase() !== invite.email.toLowerCase()) {
    throw createError('This invite was sent to a different email address', 403, 'EMAIL_MISMATCH');
  }

  // Mark the invite as accepted
  await db.query(
    'UPDATE team_invites SET accepted_at = NOW() WHERE id = $1',
    [invite.id]
  );

  // Upsert team member (may already exist as pending)
  const memberResult = await db.query<{
    id: string;
    team_id: string;
    user_id: string;
    role: string;
    invite_status: string;
    invited_by: string | null;
    invited_email: string | null;
    invited_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO team_members (team_id, user_id, role, invite_status, invited_email, accepted_at)
     VALUES ($1, $2, $3, 'accepted', $4, NOW())
     ON CONFLICT (team_id, user_id)
     DO UPDATE SET invite_status = 'accepted', role = $3, accepted_at = NOW(), updated_at = NOW()
     RETURNING id, team_id, user_id, role, invite_status, invited_by, invited_email,
               invited_at, accepted_at, created_at, updated_at`,
    [invite.team_id, userId, invite.role, invite.email]
  );

  // Set this team as the user's primary team if they don't have one
  await db.query(
    'UPDATE users SET team_id = $1 WHERE id = $2 AND team_id IS NULL',
    [invite.team_id, userId]
  );

  return mapMemberRow(memberResult.rows[0]);
}

/**
 * Decline a team invite
 */
async function declineInvite(userId: string, inviteCode: string): Promise<void> {
  const inviteResult = await db.query<{ id: string; team_id: string; email: string }>(
    `SELECT id, team_id, email FROM team_invites WHERE invite_code = $1 AND accepted_at IS NULL`,
    [inviteCode]
  );

  if (inviteResult.rows.length === 0) {
    throw createError('Invalid or already used invite code', 404, 'INVITE_NOT_FOUND');
  }

  const invite = inviteResult.rows[0];

  // Verify user email matches
  const userResult = await db.query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows[0]?.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw createError('This invite was sent to a different email address', 403, 'EMAIL_MISMATCH');
  }

  // Update member status if it exists
  await db.query(
    `UPDATE team_members SET invite_status = 'declined', updated_at = NOW()
     WHERE team_id = $1 AND user_id = $2 AND invite_status = 'pending'`,
    [invite.team_id, userId]
  );

  // Remove the invite
  await db.query('DELETE FROM team_invites WHERE id = $1', [invite.id]);
}

/**
 * List pending invites for a team (owner/admin only)
 */
async function listInvites(userId: string, teamId: string): Promise<TeamInvite[]> {
  await requireRole(userId, teamId, ['owner', 'admin']);

  const result = await db.query<{
    id: string;
    team_id: string;
    email: string;
    role: string;
    invited_by: string;
    invite_code: string;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    team_name: string;
    invited_by_name: string | null;
  }>(
    `SELECT ti.id, ti.team_id, ti.email, ti.role, ti.invited_by, ti.invite_code,
            ti.expires_at, ti.accepted_at, ti.created_at,
            t.name as team_name, u.name as invited_by_name
     FROM team_invites ti
     JOIN teams t ON t.id = ti.team_id
     JOIN users u ON u.id = ti.invited_by
     WHERE ti.team_id = $1 AND ti.accepted_at IS NULL AND ti.expires_at > NOW()
     ORDER BY ti.created_at DESC`,
    [teamId]
  );

  return result.rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role as TeamRole,
    invitedBy: row.invited_by,
    inviteCode: row.invite_code,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    teamName: row.team_name,
    invitedByName: row.invited_by_name || undefined,
  }));
}

/**
 * Get pending invites for the current user (by email)
 */
async function getMyPendingInvites(userId: string): Promise<TeamInvite[]> {
  const userResult = await db.query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) return [];

  const result = await db.query<{
    id: string;
    team_id: string;
    email: string;
    role: string;
    invited_by: string;
    invite_code: string;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    team_name: string;
    invited_by_name: string | null;
  }>(
    `SELECT ti.id, ti.team_id, ti.email, ti.role, ti.invited_by, ti.invite_code,
            ti.expires_at, ti.accepted_at, ti.created_at,
            t.name as team_name, u.name as invited_by_name
     FROM team_invites ti
     JOIN teams t ON t.id = ti.team_id
     JOIN users u ON u.id = ti.invited_by
     WHERE ti.email = $1 AND ti.accepted_at IS NULL AND ti.expires_at > NOW()
     ORDER BY ti.created_at DESC`,
    [userResult.rows[0].email.toLowerCase()]
  );

  return result.rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role as TeamRole,
    invitedBy: row.invited_by,
    inviteCode: row.invite_code,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    teamName: row.team_name,
    invitedByName: row.invited_by_name || undefined,
  }));
}

/**
 * Remove a member from the team (owner/admin only)
 * Owner cannot be removed
 */
async function removeMember(userId: string, teamId: string, memberId: string): Promise<void> {
  await requireRole(userId, teamId, ['owner', 'admin']);

  // Can't remove yourself
  if (memberId === userId) {
    throw createError('Cannot remove yourself from the team', 400, 'CANNOT_REMOVE_SELF');
  }

  // Check the target member
  const memberResult = await db.query<{ role: string }>(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, memberId]
  );

  if (memberResult.rows.length === 0) {
    throw createError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  // Can't remove the owner
  if (memberResult.rows[0].role === 'owner') {
    throw createError('Cannot remove the team owner', 400, 'CANNOT_REMOVE_OWNER');
  }

  // Admins can only remove workers, not other admins
  const callerRole = await getUserRole(userId, teamId);
  if (callerRole === 'admin' && memberResult.rows[0].role === 'admin') {
    throw createError('Admins cannot remove other admins', 403, 'INSUFFICIENT_ROLE');
  }

  // Remove the member
  await db.query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, memberId]
  );

  // Clear their team_id if it was this team
  await db.query(
    'UPDATE users SET team_id = NULL WHERE id = $1 AND team_id = $2',
    [memberId, teamId]
  );
}

/**
 * Update a member's role (owner only)
 */
async function updateMemberRole(
  userId: string,
  teamId: string,
  memberId: string,
  newRole: TeamRole
): Promise<TeamMember> {
  await requireRole(userId, teamId, ['owner']);

  if (newRole === 'owner') {
    throw createError('Cannot assign owner role. Transfer ownership instead.', 400, 'INVALID_ROLE');
  }

  // Can't change own role
  if (memberId === userId) {
    throw createError('Cannot change your own role', 400, 'CANNOT_CHANGE_OWN_ROLE');
  }

  const result = await db.query<{
    id: string;
    team_id: string;
    user_id: string;
    role: string;
    invite_status: string;
    invited_by: string | null;
    invited_email: string | null;
    invited_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE team_members SET role = $1, updated_at = NOW()
     WHERE team_id = $2 AND user_id = $3 AND role != 'owner'
     RETURNING id, team_id, user_id, role, invite_status, invited_by, invited_email,
               invited_at, accepted_at, created_at, updated_at`,
    [newRole, teamId, memberId]
  );

  if (result.rows.length === 0) {
    throw createError('Member not found or is the owner', 404, 'MEMBER_NOT_FOUND');
  }

  return mapMemberRow(result.rows[0]);
}

/**
 * Cancel a pending invite (owner/admin only)
 */
async function cancelInvite(userId: string, teamId: string, inviteId: string): Promise<void> {
  await requireRole(userId, teamId, ['owner', 'admin']);

  const result = await db.query<{ id: string; email: string }>(
    `DELETE FROM team_invites
     WHERE id = $1 AND team_id = $2 AND accepted_at IS NULL
     RETURNING id, email`,
    [inviteId, teamId]
  );

  if (result.rows.length === 0) {
    throw createError('Invite not found or already accepted', 404, 'INVITE_NOT_FOUND');
  }

  // Also remove any pending team_member entry for this email
  const email = result.rows[0].email;
  await db.query(
    `DELETE FROM team_members
     WHERE team_id = $1 AND invited_email = $2 AND invite_status = 'pending'`,
    [teamId, email]
  );
}

/**
 * Leave a team (member removes themselves)
 * Owner cannot leave without transferring ownership
 */
async function leaveTeam(userId: string, teamId: string): Promise<void> {
  const role = await getUserRole(userId, teamId);

  if (!role) {
    throw createError('You are not a member of this team', 404, 'NOT_A_MEMBER');
  }

  if (role === 'owner') {
    throw createError('Owner cannot leave the team. Transfer ownership or delete the team.', 400, 'OWNER_CANNOT_LEAVE');
  }

  await db.query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );

  await db.query(
    'UPDATE users SET team_id = NULL WHERE id = $1 AND team_id = $2',
    [userId, teamId]
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get user's role in a team (or null if not a member)
 */
async function getUserRole(userId: string, teamId: string): Promise<TeamRole | null> {
  const result = await db.query<{ role: string }>(
    `SELECT role FROM team_members
     WHERE team_id = $1 AND user_id = $2 AND invite_status = 'accepted'`,
    [teamId, userId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].role as TeamRole;
}

/**
 * Get user's team info for JWT enrichment
 */
async function getUserTeamInfo(userId: string): Promise<{ teamId: string; teamRole: TeamRole } | null> {
  const result = await db.query<{ team_id: string; role: string }>(
    `SELECT team_id, role FROM team_members
     WHERE user_id = $1 AND invite_status = 'accepted'
     ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  return {
    teamId: result.rows[0].team_id,
    teamRole: result.rows[0].role as TeamRole,
  };
}

/**
 * Require that the user is a member (accepted) of the team
 */
async function requireMembership(userId: string, teamId: string): Promise<void> {
  const role = await getUserRole(userId, teamId);
  if (!role) {
    throw createError('You are not a member of this team', 403, 'NOT_A_MEMBER');
  }
}

/**
 * Require that the user has one of the specified roles
 */
async function requireRole(userId: string, teamId: string, roles: TeamRole[]): Promise<void> {
  const role = await getUserRole(userId, teamId);
  if (!role) {
    throw createError('You are not a member of this team', 403, 'NOT_A_MEMBER');
  }
  if (!roles.includes(role)) {
    throw createError(`This action requires one of: ${roles.join(', ')}`, 403, 'INSUFFICIENT_ROLE');
  }
}

/**
 * Map a database row to a TeamMember object
 */
function mapMemberRow(row: {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  invite_status: string;
  invited_by: string | null;
  invited_email: string | null;
  invited_at: Date;
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): TeamMember {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role as TeamRole,
    inviteStatus: row.invite_status as 'pending' | 'accepted' | 'declined',
    invitedBy: row.invited_by,
    invitedEmail: row.invited_email,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default {
  createTeam,
  getTeam,
  getMyTeam,
  updateTeam,
  listMembers,
  inviteMember,
  getInviteInfo,
  acceptInvite,
  declineInvite,
  listInvites,
  getMyPendingInvites,
  removeMember,
  updateMemberRole,
  cancelInvite,
  leaveTeam,
  getUserRole,
  getUserTeamInfo,
};
