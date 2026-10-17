/**
 * Teams Service Unit Tests
 *
 * Covers the full team management lifecycle:
 *   - createTeam: validation, duplicate ownership guard, DB writes, owner membership
 *   - getTeam: membership guard, found/not-found
 *   - getMyTeam: no membership returns null, team + members returned
 *   - updateTeam: role guard (owner/admin), validation, not-found
 *   - listMembers: membership guard, member rows with user details
 *   - inviteMember: role guard, email validation, owner-role block, duplicate/pending guards,
 *                   invite code generation, pre-existing user creates pending member
 *   - acceptInvite: not-found, already-accepted, expired, email-mismatch, success + primary-team set
 *   - declineInvite: not-found, email-mismatch, success
 *   - listInvites: role guard, pending invites returned
 *   - getMyPendingInvites: user not found returns [], invites returned
 *   - removeMember: role guard, self-removal, owner removal, admin-remove-admin block, success
 *   - updateMemberRole: owner-only, owner-role block, self-change block, member-not-found, success
 *   - cancelInvite: role guard, not-found, success cleans up pending member
 *   - leaveTeam: not-a-member, owner-cannot-leave, success clears team_id
 *   - getUserRole: returns role or null
 *   - getUserTeamInfo: returns team info or null
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports so Jest hoisting works correctly
// ---------------------------------------------------------------------------

const mockDbQuery = jest.fn();
const mockSendTeamInviteEmail = jest.fn().mockResolvedValue({ messageId: 'msg-test' });
jest.mock('../../services/email.js', () => ({
  sendTeamInviteEmail: (...args: unknown[]) => mockSendTeamInviteEmail(...args),
}));

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (callback: (client: unknown) => unknown) => callback({
      query: (sql: string, ...args: unknown[]) => {
        if (sql.includes('FOR UPDATE') || sql.startsWith('DELETE FROM team_invites')) return Promise.resolve({ rows: [] });
        return mockDbQuery(sql, ...args);
      },
    }),
  },
}));

jest.mock('../../middleware/error.js', () => ({
  createError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));


// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import teamsService from '../../services/teams.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-01-15T10:00:00Z');
const FUTURE = new Date('2027-06-01T00:00:00Z'); // well in the future

function makeTeamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-1',
    name: 'Test Team',
    owner_id: 'user-owner',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    team_id: 'team-1',
    user_id: 'user-owner',
    role: 'owner',
    invite_status: 'accepted',
    invited_by: null,
    invited_email: null,
    invited_at: NOW,
    accepted_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeMemberRowWithUser(overrides: Record<string, unknown> = {}) {
  return {
    ...makeMemberRow(overrides),
    user_name: 'Owner Name',
    user_email: 'owner@example.com',
    ...overrides,
  };
}

function makeInviteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    team_id: 'team-1',
    email: 'newmember@example.com',
    role: 'worker',
    invited_by: 'user-owner',
    invite_code: 'abc123def456abc123def456abc123de',
    expires_at: FUTURE,
    accepted_at: null,
    created_at: NOW,
    team_name: 'Test Team',
    invited_by_name: 'Owner Name',
    ...overrides,
  };
}

/** Shorthand: mock a single resolved db.query response */
function mockQuery(rows: unknown[]) {
  mockDbQuery.mockResolvedValueOnce({ rows });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();
  mockSendTeamInviteEmail.mockResolvedValue({ messageId: 'msg-test' });
});

// ===========================================================================
// createTeam
// ===========================================================================

describe('createTeam', () => {
  it('throws VALIDATION_ERROR when name is empty', async () => {
    await expect(teamsService.createTeam('user-1', { name: '' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR when name is only whitespace', async () => {
    await expect(teamsService.createTeam('user-1', { name: '   ' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws TEAM_EXISTS when user already owns a team', async () => {
    mockQuery([{ id: 'existing-team' }]); // SELECT teams WHERE owner_id
    await expect(teamsService.createTeam('user-1', { name: 'My Team' }))
      .rejects.toMatchObject({ code: 'TEAM_EXISTS', statusCode: 400 });
  });

  it('creates team, owner membership, and sets primary team', async () => {
    const teamRow = makeTeamRow();
    const memberRow = makeMemberRow();

    mockQuery([]);        // SELECT teams WHERE owner_id (no existing team)
    mockQuery([teamRow]); // INSERT INTO teams
    mockQuery([memberRow]); // INSERT INTO team_members
    mockQuery([]);          // UPDATE users SET team_id

    const result = await teamsService.createTeam('user-owner', { name: '  Test Team  ' });

    expect(result.team).toMatchObject({
      id: 'team-1',
      name: 'Test Team',
      ownerId: 'user-owner',
    });
    expect(result.membership).toMatchObject({
      teamId: 'team-1',
      userId: 'user-owner',
      role: 'owner',
      inviteStatus: 'accepted',
    });

    // Verify INSERT was called with trimmed name
    const insertCall = mockDbQuery.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO teams');
    expect(insertCall[1]).toContain('Test Team');

    // Verify primary team was set
    const updateCall = mockDbQuery.mock.calls[3];
    expect(updateCall[0]).toContain('UPDATE users SET team_id');
    expect(updateCall[1]).toEqual(['team-1', 'user-owner']);
  });
});

// ===========================================================================
// getTeam
// ===========================================================================

describe('getTeam', () => {
  it('throws NOT_A_MEMBER when user is not a team member', async () => {
    mockQuery([]); // getUserRole -> no role
    await expect(teamsService.getTeam('user-1', 'team-1'))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('returns null when team does not exist', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    mockQuery([]);                    // SELECT teams WHERE id
    const result = await teamsService.getTeam('user-1', 'team-1');
    expect(result).toBeNull();
  });

  it('returns team when user is a member', async () => {
    const teamRow = makeTeamRow();
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([teamRow]);            // SELECT teams WHERE id

    const result = await teamsService.getTeam('user-owner', 'team-1');
    expect(result).toMatchObject({
      id: 'team-1',
      name: 'Test Team',
      ownerId: 'user-owner',
    });
  });
});

// ===========================================================================
// getMyTeam
// ===========================================================================

describe('getMyTeam', () => {
  it('returns null when user has no accepted team membership', async () => {
    mockQuery([]); // SELECT team_members WHERE user_id AND accepted
    const result = await teamsService.getMyTeam('user-1');
    expect(result).toBeNull();
  });

  it('returns null when team row is missing', async () => {
    mockQuery([{ team_id: 'team-1', role: 'admin' }]); // accepted membership
    mockQuery([]);                                       // SELECT teams WHERE id
    const result = await teamsService.getMyTeam('user-1');
    expect(result).toBeNull();
  });

  it('returns team, role, and members for valid membership', async () => {
    const teamRow = makeTeamRow();
    const memberRow = makeMemberRowWithUser();

    mockQuery([{ team_id: 'team-1', role: 'owner' }]); // first accepted membership
    mockQuery([teamRow]);                                // SELECT teams
    mockQuery([{ role: 'owner' }]);                     // getUserRole for requireMembership in listMembers
    mockQuery([memberRow]);                              // listMembers query

    const result = await teamsService.getMyTeam('user-owner');
    expect(result).not.toBeNull();
    expect(result!.team.id).toBe('team-1');
    expect(result!.role).toBe('owner');
    expect(result!.members).toHaveLength(1);
    expect(result!.members[0]).toMatchObject({ role: 'owner', userId: 'user-owner' });
  });
});

// ===========================================================================
// updateTeam
// ===========================================================================

describe('updateTeam', () => {
  it('throws NOT_A_MEMBER when user has no role', async () => {
    mockQuery([]); // getUserRole
    await expect(teamsService.updateTeam('user-1', 'team-1', 'New Name'))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('throws INSUFFICIENT_ROLE for worker', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    await expect(teamsService.updateTeam('user-worker', 'team-1', 'New Name'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
  });

  it('throws VALIDATION_ERROR for empty name', async () => {
    mockQuery([{ role: 'admin' }]); // getUserRole
    await expect(teamsService.updateTeam('user-admin', 'team-1', ''))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws TEAM_NOT_FOUND when team does not exist', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([]);                   // UPDATE returns nothing
    await expect(teamsService.updateTeam('user-owner', 'team-1', 'New Name'))
      .rejects.toMatchObject({ code: 'TEAM_NOT_FOUND', statusCode: 404 });
  });

  it('updates team name and returns updated team (owner)', async () => {
    const updatedRow = makeTeamRow({ name: 'New Name' });
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([updatedRow]);         // UPDATE teams

    const result = await teamsService.updateTeam('user-owner', 'team-1', '  New Name  ');
    expect(result.name).toBe('New Name');

    // Verify trimmed name was passed to DB
    const updateCall = mockDbQuery.mock.calls[1];
    expect(updateCall[1][0]).toBe('New Name');
  });

  it('allows admin to update team name', async () => {
    const updatedRow = makeTeamRow({ name: 'Admin Update' });
    mockQuery([{ role: 'admin' }]); // getUserRole
    mockQuery([updatedRow]);

    const result = await teamsService.updateTeam('user-admin', 'team-1', 'Admin Update');
    expect(result.name).toBe('Admin Update');
  });
});

// ===========================================================================
// listMembers
// ===========================================================================

describe('listMembers', () => {
  it('throws NOT_A_MEMBER when user is not in team', async () => {
    mockQuery([]); // getUserRole
    await expect(teamsService.listMembers('user-1', 'team-1'))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('returns members with user details', async () => {
    const ownerRow = makeMemberRowWithUser();
    const workerRow = makeMemberRowWithUser({
      id: 'member-2',
      user_id: 'user-worker',
      role: 'worker',
      user_name: 'Worker Name',
      user_email: 'worker@example.com',
    });

    mockQuery([{ role: 'owner' }]);        // getUserRole (requireMembership)
    mockQuery([ownerRow, workerRow]);       // SELECT team_members JOIN users

    const members = await teamsService.listMembers('user-owner', 'team-1');
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ role: 'owner', userEmail: 'owner@example.com' });
    expect(members[1]).toMatchObject({ role: 'worker', userEmail: 'worker@example.com' });
  });

  it('returns empty array when team has no members', async () => {
    mockQuery([{ role: 'admin' }]); // getUserRole
    mockQuery([]);                   // members query

    const members = await teamsService.listMembers('user-admin', 'team-1');
    expect(members).toEqual([]);
  });
});

// ===========================================================================
// inviteMember
// ===========================================================================

describe('inviteMember', () => {
  it('throws NOT_A_MEMBER when inviter is not in team', async () => {
    mockQuery([]); // getUserRole
    await expect(teamsService.inviteMember('user-1', 'team-1', { email: 'a@b.com' }))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('throws INSUFFICIENT_ROLE when inviter is a worker', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    await expect(teamsService.inviteMember('user-worker', 'team-1', { email: 'a@b.com' }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
  });

  it('throws VALIDATION_ERROR for invalid email (no @)', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    await expect(teamsService.inviteMember('user-owner', 'team-1', { email: 'notanemail' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('throws VALIDATION_ERROR for empty email', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    await expect(teamsService.inviteMember('user-owner', 'team-1', { email: '' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws INVALID_ROLE when inviting as owner', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    await expect(teamsService.inviteMember('user-owner', 'team-1', { email: 'a@b.com', role: 'owner' }))
      .rejects.toMatchObject({ code: 'INVALID_ROLE', statusCode: 400 });
  });

  it('throws ALREADY_MEMBER when email is already a member', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([{ id: 'tm-1' }]);    // SELECT team_members (existing member check)

    await expect(teamsService.inviteMember('user-owner', 'team-1', { email: 'existing@example.com' }))
      .rejects.toMatchObject({ code: 'ALREADY_MEMBER', statusCode: 400 });
  });

  it('throws INVITE_PENDING when a pending invite already exists', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([]);                   // no existing member
    mockQuery([{ id: 'inv-1' }]);   // pending invite exists

    await expect(teamsService.inviteMember('user-owner', 'team-1', { email: 'new@example.com' }))
      .rejects.toMatchObject({ code: 'INVITE_PENDING', statusCode: 400 });
  });

  it('creates invite with normalised email and default worker role', async () => {
    const inviteRow = makeInviteRow();

    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([]);                   // no existing member
    mockQuery([]);                   // no pending invite
    mockQuery([inviteRow]);          // INSERT INTO team_invites
    mockQuery([]);                   // SELECT users (email not found — no pre-existing user)

    mockQuery([{ team_name: 'Test Team', name: 'Owner', email: 'owner@example.com' }]);
    const invite = await teamsService.inviteMember('user-owner', 'team-1', {
      email: '  NewMember@Example.com  ',
    });

    expect(invite).toMatchObject({
      id: 'invite-1',
      teamId: 'team-1',
      email: 'newmember@example.com',
      role: 'worker',
    });

    // Verify email was normalised in the INSERT call
    const insertCall = mockDbQuery.mock.calls[3];
    expect(insertCall[1][1]).toBe('newmember@example.com');
  });

  it('creates pending team_member when invited user already exists', async () => {
    const inviteRow = makeInviteRow();

    mockQuery([{ role: 'admin' }]);           // getUserRole
    mockQuery([]);                             // no existing member
    mockQuery([]);                             // no pending invite
    mockQuery([inviteRow]);                    // INSERT INTO team_invites
    mockQuery([{ id: 'existing-user-id' }]);  // SELECT users WHERE email (user exists)
    mockQuery([]);                             // INSERT INTO team_members ON CONFLICT DO NOTHING

    mockQuery([{ team_name: 'Test Team', name: 'Owner', email: 'owner@example.com' }]);
    await teamsService.inviteMember('user-admin', 'team-1', { email: 'newmember@example.com' });

    // Last call should be the team_members insert
    const lastCall = mockDbQuery.mock.calls[5];
    expect(lastCall[0]).toContain('INSERT INTO team_members');
    expect(lastCall[1]).toContain('existing-user-id');
  });

  it('keeps the created invite when email delivery throws', async () => {
    mockQuery([{ role: 'owner' }]);
    mockQuery([]);
    mockQuery([]);
    mockQuery([makeInviteRow()]);
    mockQuery([]);
    mockQuery([{ team_name: 'Test Team', name: 'Owner', email: 'owner@example.com' }]);
    mockSendTeamInviteEmail.mockRejectedValueOnce(new Error('Email unavailable'));
    const invite = await teamsService.inviteMember('user-owner', 'team-1', { email: 'newmember@example.com' });
    expect(invite.id).toBe('invite-1');
    expect(invite.emailSent).toBe(false);
    expect(mockSendTeamInviteEmail).toHaveBeenCalledTimes(1);
    expect(mockDbQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO team_invites'))).toBe(true);
  });

  it('creates invite with admin role when specified', async () => {
    const inviteRow = makeInviteRow({ role: 'admin' });

    mockQuery([{ role: 'owner' }]);
    mockQuery([]);
    mockQuery([]);
    mockQuery([inviteRow]);
    mockQuery([]);

    mockQuery([{ team_name: 'Test Team', name: 'Owner', email: 'owner@example.com' }]);
    const invite = await teamsService.inviteMember('user-owner', 'team-1', {
      email: 'newadmin@example.com',
      role: 'admin',
    });

    expect(invite.role).toBe('admin');
    expect(invite.emailSent).toBe(true);
    expect(mockSendTeamInviteEmail).toHaveBeenCalledWith(invite.email, expect.objectContaining({ acceptUrl: expect.stringContaining(`/invite/${invite.inviteCode}`) }));
  });
});

// ===========================================================================
// acceptInvite
// ===========================================================================

describe('acceptInvite', () => {
  it('throws INVITE_NOT_FOUND for unknown invite code', async () => {
    mockQuery([]); // SELECT team_invites
    await expect(teamsService.acceptInvite('user-1', 'bad-code'))
      .rejects.toMatchObject({ code: 'INVITE_NOT_FOUND', statusCode: 404 });
  });

  it('throws INVITE_ALREADY_ACCEPTED when invite already used', async () => {
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'a@b.com', role: 'worker',
                  expires_at: FUTURE, accepted_at: NOW }]);
    await expect(teamsService.acceptInvite('user-1', 'code'))
      .rejects.toMatchObject({ code: 'INVITE_ALREADY_ACCEPTED', statusCode: 400 });
  });

  it('throws INVITE_EXPIRED when invite has passed expiry', async () => {
    const pastDate = new Date('2025-01-01T00:00:00Z');
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'a@b.com', role: 'worker',
                  expires_at: pastDate, accepted_at: null }]);
    await expect(teamsService.acceptInvite('user-1', 'code'))
      .rejects.toMatchObject({ code: 'INVITE_EXPIRED', statusCode: 400 });
  });

  it('throws USER_NOT_FOUND when user record missing', async () => {
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'a@b.com', role: 'worker',
                  expires_at: FUTURE, accepted_at: null }]);
    mockQuery([]); // SELECT users WHERE id
    await expect(teamsService.acceptInvite('user-1', 'code'))
      .rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
  });

  it('throws EMAIL_MISMATCH when user email does not match invite', async () => {
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'invited@example.com', role: 'worker',
                  expires_at: FUTURE, accepted_at: null }]);
    mockQuery([{ email: 'different@example.com' }]); // user's actual email

    await expect(teamsService.acceptInvite('user-1', 'code'))
      .rejects.toMatchObject({ code: 'EMAIL_MISMATCH', statusCode: 403 });
  });

  it('accepts invite and creates team membership', async () => {
    const memberRow = makeMemberRow({ role: 'worker', user_id: 'user-new' });
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'newmember@example.com', role: 'worker',
                  expires_at: FUTURE, accepted_at: null }]);
    mockQuery([{ email: 'newmember@example.com' }]); // user email matches
    mockQuery([]);                                    // UPDATE team_invites SET accepted_at
    mockQuery([memberRow]);                           // UPSERT team_members
    mockQuery([]);                                    // UPDATE users SET team_id WHERE team_id IS NULL

    const member = await teamsService.acceptInvite('user-new', 'valid-code');
    expect(member).toMatchObject({
      teamId: 'team-1',
      userId: 'user-new',
      role: 'worker',
      inviteStatus: 'accepted',
    });
  });

  it('email comparison is case-insensitive', async () => {
    const memberRow = makeMemberRow({ role: 'worker', user_id: 'user-new' });
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'User@Example.COM', role: 'worker',
                  expires_at: FUTURE, accepted_at: null }]);
    mockQuery([{ email: 'user@example.com' }]); // lowercase matches upper in invite
    mockQuery([]);
    mockQuery([memberRow]);
    mockQuery([]);

    const member = await teamsService.acceptInvite('user-new', 'code');
    expect(member.inviteStatus).toBe('accepted');
  });
});

// ===========================================================================
// declineInvite
// ===========================================================================

describe('declineInvite', () => {
  it('throws INVITE_NOT_FOUND for invalid or already-used code', async () => {
    mockQuery([]); // SELECT team_invites WHERE accepted_at IS NULL
    await expect(teamsService.declineInvite('user-1', 'bad-code'))
      .rejects.toMatchObject({ code: 'INVITE_NOT_FOUND', statusCode: 404 });
  });

  it('throws EMAIL_MISMATCH when user email does not match', async () => {
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'invited@example.com' }]);
    mockQuery([{ email: 'different@example.com' }]); // SELECT users

    await expect(teamsService.declineInvite('user-1', 'code'))
      .rejects.toMatchObject({ code: 'EMAIL_MISMATCH', statusCode: 403 });
  });

  it('declines invite and removes invite record', async () => {
    mockQuery([{ id: 'inv-1', team_id: 'team-1', email: 'newmember@example.com' }]);
    mockQuery([{ email: 'newmember@example.com' }]); // user email
    mockQuery([]);                                    // UPDATE team_members
    mockQuery([]);                                    // DELETE team_invites

    await expect(teamsService.declineInvite('user-1', 'code')).resolves.toBeUndefined();

    const deleteCall = mockDbQuery.mock.calls[3];
    expect(deleteCall[0]).toContain('DELETE FROM team_invites');
    expect(deleteCall[1][0]).toBe('inv-1');
  });
});

// ===========================================================================
// listInvites
// ===========================================================================

describe('listInvites', () => {
  it('throws INSUFFICIENT_ROLE for workers', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    await expect(teamsService.listInvites('user-worker', 'team-1'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
  });

  it('returns pending invites for admin', async () => {
    const inviteRow = makeInviteRow();
    mockQuery([{ role: 'admin' }]); // getUserRole
    mockQuery([inviteRow]);          // SELECT team_invites JOIN ...

    const invites = await teamsService.listInvites('user-admin', 'team-1');
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({
      id: 'invite-1',
      email: 'newmember@example.com',
      role: 'worker',
      teamName: 'Test Team',
    });
  });

  it('returns empty array when no pending invites', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([]);                   // no invites

    const invites = await teamsService.listInvites('user-owner', 'team-1');
    expect(invites).toEqual([]);
  });
});

// ===========================================================================
// getMyPendingInvites
// ===========================================================================

describe('getMyPendingInvites', () => {
  it('returns empty array when user not found', async () => {
    mockQuery([]); // SELECT users WHERE id
    const invites = await teamsService.getMyPendingInvites('user-ghost');
    expect(invites).toEqual([]);
  });

  it('returns pending invites for user email', async () => {
    const inviteRow = makeInviteRow({ email: 'me@example.com' });
    mockQuery([{ email: 'me@example.com' }]); // SELECT users
    mockQuery([inviteRow]);                    // SELECT team_invites WHERE email

    const invites = await teamsService.getMyPendingInvites('user-1');
    expect(invites).toHaveLength(1);
    expect(invites[0].teamName).toBe('Test Team');
  });

  it('returns empty array when no pending invites for user', async () => {
    mockQuery([{ email: 'me@example.com' }]);
    mockQuery([]);

    const invites = await teamsService.getMyPendingInvites('user-1');
    expect(invites).toEqual([]);
  });
});

// ===========================================================================
// removeMember
// ===========================================================================

describe('removeMember', () => {
  it('throws NOT_A_MEMBER when caller is not in team', async () => {
    mockQuery([]); // getUserRole for requireRole
    await expect(teamsService.removeMember('user-1', 'team-1', 'user-target'))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('throws INSUFFICIENT_ROLE when caller is a worker', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    await expect(teamsService.removeMember('user-worker', 'team-1', 'user-target'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
  });

  it('throws CANNOT_REMOVE_SELF when attempting to remove self', async () => {
    mockQuery([{ role: 'admin' }]); // getUserRole
    await expect(teamsService.removeMember('user-admin', 'team-1', 'user-admin'))
      .rejects.toMatchObject({ code: 'CANNOT_REMOVE_SELF', statusCode: 400 });
  });

  it('throws MEMBER_NOT_FOUND when target is not in team', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole (requireRole)
    mockQuery([]);                   // SELECT team_members for target

    await expect(teamsService.removeMember('user-owner', 'team-1', 'user-ghost'))
      .rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND', statusCode: 404 });
  });

  it('throws CANNOT_REMOVE_OWNER when trying to remove owner', async () => {
    mockQuery([{ role: 'admin' }]);  // getUserRole (requireRole)
    mockQuery([{ role: 'owner' }]); // target member is owner

    await expect(teamsService.removeMember('user-admin', 'team-1', 'user-owner'))
      .rejects.toMatchObject({ code: 'CANNOT_REMOVE_OWNER', statusCode: 400 });
  });

  it('throws INSUFFICIENT_ROLE when admin tries to remove another admin', async () => {
    mockQuery([{ role: 'admin' }]);  // getUserRole (requireRole check)
    mockQuery([{ role: 'admin' }]); // target member is also admin
    mockQuery([{ role: 'admin' }]); // getUserRole (callerRole check)

    await expect(teamsService.removeMember('user-admin', 'team-1', 'user-admin2'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
  });

  it('allows owner to remove an admin', async () => {
    mockQuery([{ role: 'owner' }]);  // getUserRole (requireRole)
    mockQuery([{ role: 'admin' }]); // target member role
    mockQuery([{ role: 'owner' }]); // getUserRole (callerRole)
    mockQuery([]);                   // DELETE team_members
    mockQuery([]);                   // UPDATE users SET team_id = NULL

    await expect(teamsService.removeMember('user-owner', 'team-1', 'user-admin'))
      .resolves.toBeUndefined();

    const deleteCall = mockDbQuery.mock.calls[3];
    expect(deleteCall[0]).toContain('DELETE FROM team_members');
  });

  it('allows admin to remove a worker', async () => {
    mockQuery([{ role: 'admin' }]);  // getUserRole (requireRole)
    mockQuery([{ role: 'worker' }]); // target member role
    mockQuery([{ role: 'admin' }]);  // getUserRole (callerRole)
    mockQuery([]);                    // DELETE team_members
    mockQuery([]);                    // UPDATE users SET team_id = NULL

    await expect(teamsService.removeMember('user-admin', 'team-1', 'user-worker'))
      .resolves.toBeUndefined();
  });

  it('clears team_id from removed member', async () => {
    mockQuery([{ role: 'owner' }]);  // getUserRole (requireRole)
    mockQuery([{ role: 'worker' }]); // target member role
    mockQuery([{ role: 'owner' }]);  // getUserRole (callerRole)
    mockQuery([]);                    // DELETE team_members
    mockQuery([]);                    // UPDATE users SET team_id = NULL

    await teamsService.removeMember('user-owner', 'team-1', 'user-worker');

    const updateCall = mockDbQuery.mock.calls[4];
    expect(updateCall[0]).toContain('UPDATE users SET team_id = NULL');
    expect(updateCall[1]).toEqual(['user-worker', 'team-1']);
  });
});

// ===========================================================================
// updateMemberRole
// ===========================================================================

describe('updateMemberRole', () => {
  it('throws NOT_A_MEMBER when caller is not in team', async () => {
    mockQuery([]); // getUserRole
    await expect(teamsService.updateMemberRole('user-1', 'team-1', 'user-2', 'admin'))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('throws INSUFFICIENT_ROLE when caller is admin (not owner)', async () => {
    mockQuery([{ role: 'admin' }]); // getUserRole
    await expect(teamsService.updateMemberRole('user-admin', 'team-1', 'user-2', 'worker'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
  });

  it('throws INVALID_ROLE when trying to assign owner role', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    await expect(teamsService.updateMemberRole('user-owner', 'team-1', 'user-2', 'owner'))
      .rejects.toMatchObject({ code: 'INVALID_ROLE', statusCode: 400 });
  });

  it('throws CANNOT_CHANGE_OWN_ROLE when changing own role', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    await expect(teamsService.updateMemberRole('user-owner', 'team-1', 'user-owner', 'admin'))
      .rejects.toMatchObject({ code: 'CANNOT_CHANGE_OWN_ROLE', statusCode: 400 });
  });

  it('throws MEMBER_NOT_FOUND when target is owner (WHERE role != owner guard)', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([]);                   // UPDATE returns nothing (target was owner or not found)

    await expect(teamsService.updateMemberRole('user-owner', 'team-1', 'user-other-owner', 'admin'))
      .rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND', statusCode: 404 });
  });

  it('updates worker to admin', async () => {
    const updatedRow = makeMemberRow({ user_id: 'user-worker', role: 'admin' });
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([updatedRow]);         // UPDATE team_members

    const result = await teamsService.updateMemberRole('user-owner', 'team-1', 'user-worker', 'admin');
    expect(result.role).toBe('admin');
    expect(result.userId).toBe('user-worker');
  });

  it('updates admin to worker', async () => {
    const updatedRow = makeMemberRow({ user_id: 'user-admin', role: 'worker' });
    mockQuery([{ role: 'owner' }]); // getUserRole
    mockQuery([updatedRow]);

    const result = await teamsService.updateMemberRole('user-owner', 'team-1', 'user-admin', 'worker');
    expect(result.role).toBe('worker');
  });
});

// ===========================================================================
// cancelInvite
// ===========================================================================

describe('cancelInvite', () => {
  it('throws INSUFFICIENT_ROLE for worker', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    await expect(teamsService.cancelInvite('user-worker', 'team-1', 'inv-1'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
  });

  it('throws INVITE_NOT_FOUND when invite does not exist or already accepted', async () => {
    mockQuery([{ role: 'admin' }]); // getUserRole
    mockQuery([]);                   // DELETE returns nothing

    await expect(teamsService.cancelInvite('user-admin', 'team-1', 'inv-ghost'))
      .rejects.toMatchObject({ code: 'INVITE_NOT_FOUND', statusCode: 404 });
  });

  it('cancels invite and cleans up pending member entry', async () => {
    mockQuery([{ role: 'owner' }]);                              // getUserRole
    mockQuery([{ id: 'inv-1', email: 'pending@example.com' }]); // DELETE team_invites RETURNING
    mockQuery([]);                                                // DELETE team_members WHERE pending

    await expect(teamsService.cancelInvite('user-owner', 'team-1', 'inv-1'))
      .resolves.toBeUndefined();

    const cleanupCall = mockDbQuery.mock.calls[2];
    expect(cleanupCall[0]).toContain('DELETE FROM team_members');
    expect(cleanupCall[1]).toEqual(['team-1', 'pending@example.com']);
  });
});

// ===========================================================================
// leaveTeam
// ===========================================================================

describe('leaveTeam', () => {
  it('throws NOT_A_MEMBER when user is not in the team', async () => {
    mockQuery([]); // getUserRole returns null
    await expect(teamsService.leaveTeam('user-1', 'team-1'))
      .rejects.toMatchObject({ code: 'NOT_A_MEMBER', statusCode: 404 });
  });

  it('throws OWNER_CANNOT_LEAVE when owner tries to leave', async () => {
    mockQuery([{ role: 'owner' }]); // getUserRole
    await expect(teamsService.leaveTeam('user-owner', 'team-1'))
      .rejects.toMatchObject({ code: 'OWNER_CANNOT_LEAVE', statusCode: 400 });
  });

  it('removes admin member and clears team_id', async () => {
    mockQuery([{ role: 'admin' }]); // getUserRole
    mockQuery([]);                   // DELETE team_members
    mockQuery([]);                   // UPDATE users SET team_id = NULL

    await expect(teamsService.leaveTeam('user-admin', 'team-1')).resolves.toBeUndefined();

    const deleteCall = mockDbQuery.mock.calls[1];
    expect(deleteCall[0]).toContain('DELETE FROM team_members');
    expect(deleteCall[1]).toEqual(['team-1', 'user-admin']);

    const updateCall = mockDbQuery.mock.calls[2];
    expect(updateCall[0]).toContain('UPDATE users SET team_id = NULL');
    expect(updateCall[1]).toEqual(['user-admin', 'team-1']);
  });

  it('removes worker member and clears team_id', async () => {
    mockQuery([{ role: 'worker' }]); // getUserRole
    mockQuery([]);                    // DELETE team_members
    mockQuery([]);                    // UPDATE users SET team_id = NULL

    await expect(teamsService.leaveTeam('user-worker', 'team-1')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// getUserRole
// ===========================================================================

describe('getUserRole', () => {
  it('returns null when user is not an accepted member', async () => {
    mockQuery([]); // SELECT team_members
    const role = await teamsService.getUserRole('user-1', 'team-1');
    expect(role).toBeNull();
  });

  it('returns owner role', async () => {
    mockQuery([{ role: 'owner' }]);
    const role = await teamsService.getUserRole('user-owner', 'team-1');
    expect(role).toBe('owner');
  });

  it('returns admin role', async () => {
    mockQuery([{ role: 'admin' }]);
    const role = await teamsService.getUserRole('user-admin', 'team-1');
    expect(role).toBe('admin');
  });

  it('returns worker role', async () => {
    mockQuery([{ role: 'worker' }]);
    const role = await teamsService.getUserRole('user-worker', 'team-1');
    expect(role).toBe('worker');
  });

  it('queries only accepted memberships', async () => {
    mockQuery([]);
    await teamsService.getUserRole('user-1', 'team-1');

    const query = mockDbQuery.mock.calls[0][0] as string;
    expect(query).toContain("invite_status = 'accepted'");
  });
});

// ===========================================================================
// getUserTeamInfo
// ===========================================================================

describe('getUserTeamInfo', () => {
  it('returns null when user has no accepted membership', async () => {
    mockQuery([]);
    const info = await teamsService.getUserTeamInfo('user-1');
    expect(info).toBeNull();
  });

  it('returns teamId and teamRole for accepted membership', async () => {
    mockQuery([{ team_id: 'team-abc', role: 'admin' }]);
    const info = await teamsService.getUserTeamInfo('user-admin');
    expect(info).toEqual({ teamId: 'team-abc', teamRole: 'admin' });
  });

  it('returns first accepted membership (ordered by created_at ASC)', async () => {
    // Only first row matters — function uses LIMIT 1
    mockQuery([{ team_id: 'team-oldest', role: 'worker' }]);
    const info = await teamsService.getUserTeamInfo('user-1');
    expect(info!.teamId).toBe('team-oldest');
  });
});
