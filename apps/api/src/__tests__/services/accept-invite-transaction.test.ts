// Use the real database transaction helper with a single mocked PostgreSQL client.
const mockQuery = jest.fn();
const mockPoolQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({
  on: jest.fn(), connect: mockConnect, query: mockPoolQuery,
})) }));
jest.mock('../../config/index.js', () => ({ config: { nodeEnv: 'test' } }));
jest.mock('../../services/email.js', () => ({ sendTeamInviteEmail: jest.fn() }));
import teamsService from '../../services/teams.js';

beforeEach(() => {
  jest.resetAllMocks();
  mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
});

it.each([false, true])('accept uses one transaction client (write failure: %s)', async (fail) => {
  const invite = {
    id: 'invite-1', team_id: 'team-1', email: 'member@example.com', role: 'worker',
    expires_at: new Date('2099-01-01'), accepted_at: null,
  };
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM team_invites')) return { rows: [invite] };
    if (sql.includes('SELECT email FROM users')) return { rows: [{ email: invite.email }] };
    if (sql.includes('INSERT INTO team_members')) {
      if (fail) throw new Error('write failed');
      return { rows: [{ id: 'member-1', team_id: 'team-1', user_id: 'user-1', role: 'worker',
        invite_status: 'accepted', invited_at: new Date(), created_at: new Date(), updated_at: new Date() }] };
    }
    return { rows: [] };
  });
  const result = teamsService.acceptInvite('user-1', 'test-code');
  if (fail) await expect(result).rejects.toThrow('write failed');
  else await expect(result).resolves.toMatchObject({ teamId: 'team-1' });
  const sql = mockQuery.mock.calls.map(call => call[0] as string);
  expect(mockPoolQuery).not.toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalledTimes(1);
  expect(sql[0]).toBe('BEGIN');
  expect(sql[1]).toContain('SELECT team_id, email FROM team_invites');
  expect(sql[2]).toContain('pg_advisory_xact_lock');
  expect(sql[3]).toContain('FOR UPDATE');
  expect(sql[4]).toContain('SELECT email FROM users');
  expect(sql[5]).toContain('UPDATE team_invites SET accepted_at');
  expect(sql[6]).toContain('INSERT INTO team_members');
  if (!fail) expect(sql[7]).toContain('UPDATE users SET team_id');
  expect(sql).toHaveLength(fail ? 8 : 9);
  expect(sql[sql.length - 1]).toBe(fail ? 'ROLLBACK' : 'COMMIT');
  expect(mockRelease).toHaveBeenCalledTimes(1);
});
