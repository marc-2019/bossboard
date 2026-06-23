/**
 * Auth Service — account management tests
 *
 * Covers the previously-untested branch-heavy functions:
 *   - completeOnboarding: success + not-found (404)
 *   - updateUser: each field branch, no-op (re-fetch), null on missing row
 *   - deleteAccount: transactional cascade incl. owned-team loop, empty-team path
 *   - resendVerification / forgotPassword email-dispatch error branches (best-effort)
 */

const mockDbQuery = jest.fn();
const mockDbTransaction = jest.fn();

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

const mockIsEmailConfigured = jest.fn();
const mockSendVerificationEmail = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('../../services/email.js', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

const mockGetUserTeamInfo = jest.fn();
jest.mock('../../services/teams.js', () => ({
  __esModule: true,
  default: { getUserTeamInfo: (...args: unknown[]) => mockGetUserTeamInfo(...args) },
}));

const mockBcryptHash = jest.fn();
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: (...args: unknown[]) => mockBcryptHash(...args),
    compare: jest.fn(),
  },
}));

jest.mock('../../config/index.js', () => ({
  config: { isDevelopment: false, jwt: { secret: 'x'.repeat(32), refreshSecret: 'y'.repeat(32), accessTokenExpiry: '15m', refreshTokenExpiry: '7d' } },
}));

import authService from '../../services/auth.js';
import { completeOnboarding, updateUser, resendVerification, forgotPassword } from '../../services/auth.js';

const USER_ROW = {
  id: 'user-1',
  email: 'a@b.com',
  name: 'Alice',
  tradeType: 'plumber',
  isVerified: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsEmailConfigured.mockReturnValue(false);
});

describe('completeOnboarding', () => {
  it('marks onboarding complete and returns the user', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ ...USER_ROW, onboardingCompleted: true }] });
    const user = await completeOnboarding('user-1');
    expect(user.id).toBe('user-1');
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('onboarding_completed = true');
  });

  it('throws 404 when the user is missing/inactive', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(completeOnboarding('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('updateUser', () => {
  it('builds an update for every supplied field', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [USER_ROW] });
    const result = await updateUser('user-1', {
      name: 'New',
      phone: '021',
      tradeType: 'electrician',
      businessName: 'Sparky Ltd',
    });
    expect(result).toEqual(USER_ROW);
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('name = $1');
    expect(sql).toContain('phone = $2');
    expect(sql).toContain('trade_type = $3');
    expect(sql).toContain('business_name = $4');
  });

  it('re-fetches via getUserById when no fields change', async () => {
    // getUserById does a SELECT; return the user row.
    mockDbQuery.mockResolvedValueOnce({ rows: [USER_ROW] });
    const result = await updateUser('user-1', {});
    expect(result).toEqual(USER_ROW);
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT');
  });

  it('returns null when the update matches no active row', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await updateUser('missing', { name: 'X' });
    expect(result).toBeNull();
  });
});

describe('resendVerification email-dispatch branch', () => {
  it('does not throw when the verification email fails to send', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendVerificationEmail.mockRejectedValueOnce(new Error('smtp down'));
    // 1) SELECT user (must be unverified) 2) UPDATE code
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'a@b.com', isVerified: false }] })
      .mockResolvedValueOnce({ rows: [{ email: 'a@b.com' }] });

    const result = await resendVerification('user-1');
    expect(result.verificationCode).toMatch(/^\d{6}$/);
    expect(mockSendVerificationEmail).toHaveBeenCalled();
  });
});

describe('forgotPassword email-dispatch branch', () => {
  it('sends a reset email when SMTP is configured', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPasswordResetEmail.mockResolvedValueOnce(undefined);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'a@b.com' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE code
    await forgotPassword('A@B.com');
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', expect.stringMatching(/^\d{6}$/));
  });

  it('swallows a reset-email send failure', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPasswordResetEmail.mockRejectedValueOnce(new Error('smtp down'));
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'a@b.com' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(forgotPassword('a@b.com')).resolves.toBeUndefined();
  });
});

describe('deleteAccount', () => {
  it('runs the cascade in a transaction and deletes owned teams', async () => {
    const clientQuery = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM teams')) {
        return Promise.resolve({ rows: [{ id: 'team-1' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockDbTransaction.mockImplementation(async (cb: (c: unknown) => Promise<void>) => {
      await cb({ query: clientQuery });
    });

    await authService.deleteAccount('user-1');

    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    const sqls = clientQuery.mock.calls.map((c) => c[0] as string);
    // Owned-team loop deletes invites/members/team for team-1
    expect(sqls).toContain('DELETE FROM team_invites WHERE team_id = $1');
    // Final user delete
    expect(sqls).toContain('DELETE FROM users WHERE id = $1');
  });

  it('handles a user that owns no teams', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockDbTransaction.mockImplementation(async (cb: (c: unknown) => Promise<void>) => {
      await cb({ query: clientQuery });
    });

    await authService.deleteAccount('user-2');
    const sqls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls).toContain('DELETE FROM users WHERE id = $1');
    // No per-team invite delete because there were no owned teams
    expect(sqls).not.toContain('DELETE FROM team_invites WHERE team_id = $1');
  });
});
