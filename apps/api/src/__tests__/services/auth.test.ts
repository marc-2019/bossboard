/**
 * Auth Service Unit Tests
 *
 * Covers:
 *   - register: duplicate email rejection, bcrypt hashing, JWT payload correctness, email dispatch
 *   - login: bcrypt compare, invalid credentials (wrong password, user not found)
 *   - refreshToken: invalid JWT, revoked/expired token in DB, successful token rotation
 *   - logout: single-token revocation, all-tokens revocation
 *   - getUserById: returns user, returns null for missing/inactive user
 *   - verifyEmail: already-verified guard, expired code, wrong code, success
 *   - resendVerification: user not found, already verified, new code generated
 *   - forgotPassword: silent return for unknown email, code generation + email dispatch
 *   - resetPassword: expired code, wrong code, password update + refresh token revocation
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports so Jest hoisting works correctly
// ---------------------------------------------------------------------------

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
const mockAcceptInvite = jest.fn();

jest.mock('../../services/teams.js', () => ({
  __esModule: true,
  default: {
    getUserTeamInfo: (...args: unknown[]) => mockGetUserTeamInfo(...args),
    acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
  },
}));

const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: (...args: unknown[]) => mockBcryptHash(...args),
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
  },
}));

jest.mock('../../config/index.js', () => ({
  config: {
    isDevelopment: false, // suppress console.log dev branches unless testing them
    jwt: {
      secret: 'test_jwt_secret_32chars_minimum!x',
      refreshSecret: 'test_refresh_secret_32chars_min!x',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
    },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  register,
  login,
  refreshToken,
  logout,
  getUserById,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from '../../services/auth.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: 'user-uuid-1234',
  email: 'tradie@example.com',
  name: 'Bob Builder',
  phone: '021111222',
  tradeType: 'builder',
  businessName: 'Bob Builds Ltd',
  isVerified: false,
  onboardingCompleted: false,
  isActive: true,
  subscriptionTier: 'free',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const JWT_SECRET = 'test_jwt_secret_32chars_minimum!x';
const JWT_REFRESH_SECRET = 'test_refresh_secret_32chars_min!x';

/**
 * Sign a real refresh token with the test secret so refreshToken() can verify it.
 */
function makeRefreshToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// ---------------------------------------------------------------------------
// Common mock helpers
// ---------------------------------------------------------------------------

/** Set up db.query mock responses for register() (happy path). */
function setupRegisterSuccess(): void {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [] })              // SELECT — no existing user
    .mockResolvedValueOnce({ rows: [TEST_USER] })     // INSERT users — returns new user
    .mockResolvedValueOnce({ rows: [] });             // INSERT refresh_tokens
}

/** Set up db.query mock responses for login() (happy path). */
function setupLoginSuccess(passwordHash = '$2b$12$hashedpassword'): void {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [{ ...TEST_USER, password_hash: passwordHash }],
    })                                                // SELECT users with hash
    .mockResolvedValueOnce({ rows: [] });             // INSERT refresh_tokens
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no team info (keeps JWT payload minimal)
  mockGetUserTeamInfo.mockResolvedValue(null);
  // Default: email not configured (avoids noise in tests not concerned with email)
  mockIsEmailConfigured.mockReturnValue(false);
});

// ===========================================================================
// register()
// ===========================================================================

describe('register()', () => {
  const input = {
    email: 'Tradie@Example.com',
    password: 'StrongPass123!',
    name: 'Bob Builder',
  };

  it('throws USER_EXISTS (409) when email is already registered', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

    await expect(register(input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'USER_EXISTS',
    });

    // Only the SELECT query should run — no INSERT
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM users WHERE email'),
      ['tradie@example.com'] // lowercased
    );
  });

  it('normalises email to lowercase before checking duplicates', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

    await expect(register({ ...input, email: 'UPPER@EXAMPLE.COM' })).rejects.toMatchObject({
      code: 'USER_EXISTS',
    });

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.anything(),
      ['upper@example.com']
    );
  });

  it('hashes the password with bcrypt before storing it', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    setupRegisterSuccess();

    await register(input);

    expect(mockBcryptHash).toHaveBeenCalledWith('StrongPass123!', 12);

    // The INSERT should include the hashed value, not the plaintext
    const insertCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO users')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('$2b$12$fakehash');
  });

  it('returns JWT access token with correct userId and email in payload', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    setupRegisterSuccess();

    const { tokens } = await register(input);

    const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as {
      userId: string;
      email: string;
    };

    expect(decoded.userId).toBe(TEST_USER.id);
    expect(decoded.email).toBe(TEST_USER.email);
  });

  it('includes teamId and teamRole in JWT payload when user belongs to a team', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    mockGetUserTeamInfo.mockResolvedValue({
      teamId: 'team-abc',
      teamRole: 'worker',
    });
    setupRegisterSuccess();

    const { tokens } = await register(input);

    const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as {
      teamId: string;
      teamRole: string;
    };

    expect(decoded.teamId).toBe('team-abc');
    expect(decoded.teamRole).toBe('worker');
  });

  it('returns both accessToken and refreshToken with expiresIn = 900', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    setupRegisterSuccess();

    const { tokens } = await register(input);

    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(tokens.expiresIn).toBe(900); // 15 * 60
  });

  it('stores the refresh token in refresh_tokens table', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    setupRegisterSuccess();

    const { tokens } = await register(input);

    const storeCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO refresh_tokens')
    );
    expect(storeCall).toBeDefined();
    expect(storeCall![1]).toContain(tokens.refreshToken);
  });

  it('sends verification email when email is configured', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendVerificationEmail.mockResolvedValue({ messageId: 'msg-1' });
    setupRegisterSuccess();

    const { verificationCode } = await register(input);

    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      TEST_USER.email,
      verificationCode
    );
  });

  it('does not send email when email service is not configured', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    mockIsEmailConfigured.mockReturnValue(false);
    setupRegisterSuccess();

    await register(input);

    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });

  it('continues registration even if verification email dispatch fails', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendVerificationEmail.mockRejectedValue(new Error('SMTP timeout'));
    setupRegisterSuccess();

    // Should not throw — email failure is non-fatal
    await expect(register(input)).resolves.toBeDefined();
  });

  it('does not auto-accept a pending team invite or create membership while unverified', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    setupRegisterSuccess();

    const { user } = await register({
      email: 'invitee@example.com',
      password: 'StrongPass123!',
      name: 'Invitee',
    });

    expect(user.isVerified).toBe(false);
    expect(mockAcceptInvite).not.toHaveBeenCalled();

    const sql = mockDbQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).not.toMatch(/team_members/i);
    expect(sql).not.toMatch(/team_invites/i);
    expect(sql).not.toMatch(/invite_status/i);
  });
});

// ===========================================================================
// login()
// ===========================================================================

describe('login()', () => {
  const input = { email: 'Tradie@Example.com', password: 'StrongPass123!' };

  it('throws INVALID_CREDENTIALS (401) when email is not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await expect(login(input)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws INVALID_CREDENTIALS (401) when password does not match hash', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ ...TEST_USER, password_hash: '$2b$12$realHash' }],
    });
    mockBcryptCompare.mockResolvedValue(false);

    await expect(login(input)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('calls bcrypt.compare with the plaintext password and stored hash', async () => {
    setupLoginSuccess('$2b$12$storedHash');
    mockBcryptCompare.mockResolvedValue(true);

    await login(input);

    expect(mockBcryptCompare).toHaveBeenCalledWith('StrongPass123!', '$2b$12$storedHash');
  });

  it('returns user (without password_hash) and tokens on success', async () => {
    setupLoginSuccess();
    mockBcryptCompare.mockResolvedValue(true);

    const { user, tokens } = await login(input);

    expect(user).not.toHaveProperty('password_hash');
    expect(user.email).toBe(TEST_USER.email);
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
  });

  it('normalises email to lowercase before DB lookup', async () => {
    setupLoginSuccess();
    mockBcryptCompare.mockResolvedValue(true);

    await login({ email: 'TRADIE@EXAMPLE.COM', password: 'pass' });

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE email = $1'),
      ['tradie@example.com']
    );
  });

  it('JWT access token payload contains correct userId and email', async () => {
    setupLoginSuccess();
    mockBcryptCompare.mockResolvedValue(true);

    const { tokens } = await login(input);

    const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as {
      userId: string;
      email: string;
    };

    expect(decoded.userId).toBe(TEST_USER.id);
    expect(decoded.email).toBe(TEST_USER.email);
  });
});

// ===========================================================================
// refreshToken()
// ===========================================================================

describe('refreshToken()', () => {
  it('throws INVALID_REFRESH_TOKEN (401) for a completely invalid token string', async () => {
    await expect(refreshToken('not.a.valid.jwt')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN (401) for a token signed with the wrong secret', async () => {
    const badToken = jwt.sign(
      { userId: 'u1', email: 'x@x.com' },
      'wrong_secret'
    );

    await expect(refreshToken(badToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN (401) when token is not found or revoked in DB', async () => {
    const token = makeRefreshToken(TEST_USER.id, TEST_USER.email);
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // not in DB / revoked

    await expect(refreshToken(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws USER_NOT_FOUND (401) when user is deactivated after token was issued', async () => {
    const token = makeRefreshToken(TEST_USER.id, TEST_USER.email);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'rt-1', user_id: TEST_USER.id }] }) // token valid in DB
      .mockResolvedValueOnce({ rows: [] }); // user not found / inactive

    await expect(refreshToken(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'USER_NOT_FOUND',
    });
  });

  it('revokes the old refresh token and issues a new pair on success', async () => {
    const oldToken = makeRefreshToken(TEST_USER.id, TEST_USER.email);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'rt-1', user_id: TEST_USER.id }] }) // token in DB
      .mockResolvedValueOnce({ rows: [TEST_USER] })   // fetch user
      .mockResolvedValueOnce({ rows: [] })             // UPDATE revoke old token
      .mockResolvedValueOnce({ rows: [] });            // INSERT new refresh token

    const tokens = await refreshToken(oldToken);

    // Verify old token was revoked
    const revokeCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE refresh_tokens SET revoked_at')
    );
    expect(revokeCall).toBeDefined();
    expect(revokeCall![1]).toContain(oldToken);

    // New tokens issued and stored
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(tokens.expiresIn).toBe(900);

    // New refresh token was stored in DB
    const insertCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO refresh_tokens')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain(tokens.refreshToken);
  });

  it('new access token contains correct userId in payload', async () => {
    const oldToken = makeRefreshToken(TEST_USER.id, TEST_USER.email);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'rt-1', user_id: TEST_USER.id }] })
      .mockResolvedValueOnce({ rows: [TEST_USER] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const tokens = await refreshToken(oldToken);

    const decoded = jwt.verify(tokens.accessToken, JWT_SECRET) as { userId: string };
    expect(decoded.userId).toBe(TEST_USER.id);
  });
});

// ===========================================================================
// Same-second refresh token regressions (real JWTs, no live database)
// ===========================================================================

describe('same-second refresh token issuance', () => {
  const input = { email: TEST_USER.email, password: 'StrongPass123!' };
  type StoredToken = { id: string; user_id: string; expiresAt: Date; revoked: boolean };
  let stored: Map<string, StoredToken>;
  let currentUser = { ...TEST_USER };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-23T00:00:00.000Z'));
    stored = new Map();
    currentUser = { ...TEST_USER };
    mockBcryptHash.mockResolvedValue('$2b$12$fakehash');
    mockBcryptCompare.mockResolvedValue(true);

    // Model token uniqueness and revocation together. In particular, a duplicate
    // INSERT must leave an existing revoked row revoked (ON CONFLICT DO NOTHING).
    mockDbQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('SELECT id FROM users WHERE email')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO users') || sql.includes('FROM users')) {
        return { rows: [{ ...currentUser, password_hash: '$2b$12$fakehash' }] };
      }
      if (sql.includes('INSERT INTO refresh_tokens')) {
        const [id, userId, token, expiresAt] = params as [string, string, string, Date];
        // Match database/init.sql: token VARCHAR(500), including failed inserts.
        if (token.length > 500) {
          throw new Error('value too long for type character varying(500)');
        }
        if (!stored.has(token)) {
          stored.set(token, { id, user_id: userId, expiresAt, revoked: false });
        }
        return { rows: [] };
      }
      if (sql.includes('SELECT id, user_id FROM refresh_tokens')) {
        const row = stored.get(params[0] as string);
        return {
          rows: row && !row.revoked && row.expiresAt.getTime() > Date.now() ? [row] : [],
        };
      }
      if (sql.includes('UPDATE refresh_tokens SET revoked_at')) {
        for (const [token, row] of stored) {
          const matches = sql.includes('WHERE user_id = $1')
            ? row.user_id === params[0] && (params.length === 1 || token === params[1])
            : token === params[0];
          if (matches) row.revoked = true;
        }
        return { rows: [] };
      }
      throw new Error('Unexpected SQL in refresh token regression');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    mockDbQuery.mockReset();
  });

  function verifyRefresh(token: string): jwt.JwtPayload {
    return jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  }

  it('issues distinct refresh JWTs for register and repeated logins at the same instant', async () => {
    mockGetUserTeamInfo.mockResolvedValue({ teamId: 'team-abc', teamRole: 'worker' });
    const first = (await register(input)).tokens;
    const second = (await login(input)).tokens;
    const third = (await login(input)).tokens;
    const tokens = [first, second, third];

    expect(new Set(tokens.map((pair) => pair.refreshToken)).size).toBe(3);
    const claims = tokens.map((pair) => verifyRefresh(pair.refreshToken));
    expect(new Set(claims.map((claim) => claim.jti)).size).toBe(3);
    for (const claim of claims) {
      expect(claim.jti).toEqual(expect.any(String));
      expect(claim.jti).not.toBe('');
      expect(Object.keys(claim).sort()).toEqual(['exp', 'iat', 'jti', 'userId']);
      expect(claim).toMatchObject({
        userId: TEST_USER.id,
        iat: 1792713600,
        exp: 1792713600 + 7 * 24 * 60 * 60,
      });
    }
    expect(stored.size).toBe(3);
    for (const pair of tokens) {
      expect(stored.get(pair.refreshToken)?.revoked).toBe(false);
      const access = jwt.verify(pair.accessToken, JWT_SECRET) as jwt.JwtPayload;
      expect(access).toMatchObject({
        userId: TEST_USER.id, email: TEST_USER.email,
        teamId: 'team-abc', teamRole: 'worker',
      });
      expect(access.exp! - access.iat!).toBe(15 * 60);
      expect(access).not.toHaveProperty('jti');
      expect(pair.expiresIn).toBe(900);
    }
  });

  // Valid local/domain label lengths; the legacy JWT fits VARCHAR(500), while
  // adding a UUID jti to the old shared payload exceeds that storage boundary.
  const longEmail = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(47)}.com`;
  const longUserId = '12345678-1234-4123-8123-123456789abc';

  it.each(['register', 'login'])(
    'stores %s refresh JWTs within 500 characters for a long valid email',
    async (operation) => {
      expect(z.string().email().safeParse(longEmail).success).toBe(true);
      currentUser = { ...TEST_USER, id: longUserId, email: longEmail };
      const legacy = makeRefreshToken(currentUser.id, currentUser.email);
      expect(legacy.length).toBeLessThanOrEqual(500);
      const oversized = jwt.sign(
        { userId: currentUser.id, email: currentUser.email },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', jwtid: '12345678-1234-4123-8123-123456789abc' }
      );
      expect(oversized.length).toBeGreaterThan(500);

      const result = await (operation === 'register' ? register : login)({
        ...input, email: longEmail,
      });
      expect(result.tokens.refreshToken.length).toBeLessThanOrEqual(500);
      expect(stored.get(result.tokens.refreshToken)?.revoked).toBe(false);
      expect(verifyRefresh(result.tokens.refreshToken).userId).toBe(longUserId);
      const access = jwt.verify(result.tokens.accessToken, JWT_SECRET) as jwt.JwtPayload;
      expect(access.email).toBe(longEmail);
    }
  );

  it('rotates a stored legacy JWT within 500 characters using fresh DB user and team claims', async () => {
    expect(z.string().email().safeParse(longEmail).success).toBe(true);
    currentUser = { ...TEST_USER, id: longUserId, email: longEmail };
    const legacy = makeRefreshToken(longUserId, longEmail);
    expect(legacy.length).toBeLessThanOrEqual(500);
    stored.set(legacy, {
      id: 'long-email-legacy-row', user_id: longUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), revoked: false,
    });

    // Claims in the old JWT must not override the current database user/team.
    mockGetUserTeamInfo.mockResolvedValue({
      teamId: '12345678-1234-4123-8123-123456789abc', teamRole: 'owner',
    });
    // Keep the new email long enough to exercise storage during rotation too.
    currentUser.email = longEmail.replace(/^a/, 'd');
    const rotated = await refreshToken(legacy);
    expect(rotated.refreshToken.length).toBeLessThanOrEqual(500);
    expect(stored.get(legacy)?.revoked).toBe(true);
    expect(stored.get(rotated.refreshToken)?.revoked).toBe(false);
    expect(Object.keys(verifyRefresh(rotated.refreshToken)).sort()).toEqual(
      ['exp', 'iat', 'jti', 'userId']
    );
    const access = jwt.verify(rotated.accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(access).toMatchObject({
      userId: longUserId, email: currentUser.email,
      teamId: '12345678-1234-4123-8123-123456789abc', teamRole: 'owner',
    });
    await expect(refreshToken(legacy)).rejects.toMatchObject({
      statusCode: 401, code: 'INVALID_REFRESH_TOKEN',
    });
    await expect(refreshToken(rotated.refreshToken)).resolves.toHaveProperty('refreshToken');
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM users WHERE id = $1 AND is_active = true'),
      [longUserId]
    );
  });

  it.each(['single token', 'all tokens'])(
    'keeps a fresh login usable after %s logout in the same second',
    async (mode) => {
      const first = (await login(input)).tokens;
      await logout(TEST_USER.id, mode === 'single token' ? first.refreshToken : undefined);
      const second = (await login(input)).tokens;

      expect(stored.get(first.refreshToken)?.revoked).toBe(true);
      await expect(refreshToken(first.refreshToken)).rejects.toMatchObject({
        statusCode: 401, code: 'INVALID_REFRESH_TOKEN',
      });
      // A no-op conflicting INSERT would return a revoked token here.
      const rotated = await refreshToken(second.refreshToken);
      expect(new Set([first.refreshToken, second.refreshToken, rotated.refreshToken]).size).toBe(3);
      expect(stored.get(second.refreshToken)?.revoked).toBe(true);
      expect(stored.get(rotated.refreshToken)?.revoked).toBe(false);
    }
  );

  it('rotates twice within one second while rejecting replay of each consumed token', async () => {
    const first = (await login(input)).tokens;
    const second = await refreshToken(first.refreshToken);
    await expect(refreshToken(first.refreshToken)).rejects.toMatchObject({
      statusCode: 401, code: 'INVALID_REFRESH_TOKEN',
    });
    // Before the fix the first rotation returns the just-revoked JWT.
    const third = await refreshToken(second.refreshToken);
    await expect(refreshToken(second.refreshToken)).rejects.toMatchObject({
      statusCode: 401, code: 'INVALID_REFRESH_TOKEN',
    });

    expect(new Set([first.refreshToken, second.refreshToken, third.refreshToken]).size).toBe(3);
    expect(new Set([first, second, third].map((pair) => verifyRefresh(pair.refreshToken).jti)).size).toBe(3);
    expect(stored.size).toBe(3);
    expect(stored.get(first.refreshToken)?.revoked).toBe(true);
    expect(stored.get(second.refreshToken)?.revoked).toBe(true);
    expect(stored.get(third.refreshToken)?.revoked).toBe(false);
    await expect(refreshToken(third.refreshToken)).resolves.toHaveProperty('refreshToken');
  });

  it('still accepts a stored legacy refresh JWT without jti and revokes it on rotation', async () => {
    const legacy = makeRefreshToken(TEST_USER.id, TEST_USER.email);
    expect(verifyRefresh(legacy)).not.toHaveProperty('jti');
    stored.set(legacy, {
      id: 'legacy-row', user_id: TEST_USER.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), revoked: false,
    });

    const rotated = await refreshToken(legacy);
    await expect(refreshToken(legacy)).rejects.toMatchObject({
      statusCode: 401, code: 'INVALID_REFRESH_TOKEN',
    });
    expect(stored.get(legacy)?.revoked).toBe(true);
    expect(verifyRefresh(rotated.refreshToken).jti).toEqual(expect.any(String));
    expect(stored.get(rotated.refreshToken)?.revoked).toBe(false);
    await expect(refreshToken(rotated.refreshToken)).resolves.toHaveProperty('refreshToken');
  });
});

// ===========================================================================
// logout()
// ===========================================================================

describe('logout()', () => {
  it('revokes only the specified refresh token when token is provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await logout(TEST_USER.id, 'specific-refresh-token');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1 AND token = $2'),
      [TEST_USER.id, 'specific-refresh-token']
    );
  });

  it('revokes all active refresh tokens when no token is specified', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await logout(TEST_USER.id);

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1 AND revoked_at IS NULL'),
      [TEST_USER.id]
    );
  });
});

// ===========================================================================
// getUserById()
// ===========================================================================

describe('getUserById()', () => {
  it('returns the user object when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [TEST_USER] });

    const user = await getUserById(TEST_USER.id);

    expect(user).toEqual(TEST_USER);
  });

  it('returns null when user is not found or inactive', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const user = await getUserById('nonexistent-id');

    expect(user).toBeNull();
  });
});

// ===========================================================================
// verifyEmail()
// ===========================================================================

describe('verifyEmail()', () => {
  const userId = TEST_USER.id;

  it('throws USER_NOT_FOUND (404) when user does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await expect(verifyEmail(userId, '123456')).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });

  it('throws ALREADY_VERIFIED (400) when email is already verified', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          ...TEST_USER,
          isVerified: true,
          verification_code: '123456',
          verification_code_expires_at: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(verifyEmail(userId, '123456')).rejects.toMatchObject({
      statusCode: 400,
      code: 'ALREADY_VERIFIED',
    });
  });

  it('throws CODE_EXPIRED (400) when verification code has passed its expiry time', async () => {
    const expiredAt = new Date(Date.now() - 1); // 1ms in the past

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          ...TEST_USER,
          isVerified: false,
          verification_code: '123456',
          verification_code_expires_at: expiredAt,
        },
      ],
    });

    await expect(verifyEmail(userId, '123456')).rejects.toMatchObject({
      statusCode: 400,
      code: 'CODE_EXPIRED',
    });
  });

  it('throws INVALID_CODE (400) when code does not match', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          ...TEST_USER,
          isVerified: false,
          verification_code: '999999',
          verification_code_expires_at: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(verifyEmail(userId, '111111')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CODE',
    });
  });

  it('throws NO_CODE (400) when no verification code is stored', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          ...TEST_USER,
          isVerified: false,
          verification_code: null,
          verification_code_expires_at: null,
        },
      ],
    });

    await expect(verifyEmail(userId, '123456')).rejects.toMatchObject({
      statusCode: 400,
      code: 'NO_CODE',
    });
  });

  it('marks user as verified and clears code on success', async () => {
    const verifiedUser = { ...TEST_USER, isVerified: true };
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            ...TEST_USER,
            isVerified: false,
            verification_code: '654321',
            verification_code_expires_at: new Date(Date.now() + 60_000),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [verifiedUser] }); // UPDATE result

    const result = await verifyEmail(userId, '654321');

    expect(result.isVerified).toBe(true);

    const updateCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('is_verified = true')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain('verification_code = NULL');
  });
});

// ===========================================================================
// resendVerification()
// ===========================================================================

describe('resendVerification()', () => {
  it('throws USER_NOT_FOUND (404) when user does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await expect(resendVerification('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
  });

  it('throws ALREADY_VERIFIED (400) when email is already verified', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_USER.id, email: TEST_USER.email, isVerified: true }],
    });

    await expect(resendVerification(TEST_USER.id)).rejects.toMatchObject({
      statusCode: 400,
      code: 'ALREADY_VERIFIED',
    });
  });

  it('generates a new 6-digit code and updates the DB', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ id: TEST_USER.id, email: TEST_USER.email, isVerified: false }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const { verificationCode } = await resendVerification(TEST_USER.id);

    expect(verificationCode).toMatch(/^\d{6}$/);

    const updateCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE users SET verification_code')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][0]).toBe(verificationCode);
  });

  it('sends verification email when email is configured', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendVerificationEmail.mockResolvedValue({ messageId: 'msg-2' });
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ id: TEST_USER.id, email: TEST_USER.email, isVerified: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await resendVerification(TEST_USER.id);

    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      TEST_USER.email,
      expect.stringMatching(/^\d{6}$/)
    );
  });
});

// ===========================================================================
// forgotPassword()
// ===========================================================================

describe('forgotPassword()', () => {
  it('returns without error or email when email is not registered (prevents enumeration)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // user not found

    await expect(forgotPassword('nobody@example.com')).resolves.toBeUndefined();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('generates a reset code and stores it for a valid email', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_USER.id, email: TEST_USER.email }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE verification_code

    await forgotPassword(TEST_USER.email);

    const updateCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE users SET verification_code')
    );
    expect(updateCall).toBeDefined();

    const storedCode = updateCall![1][0] as string;
    expect(storedCode).toMatch(/^\d{6}$/);
  });

  it('sends password reset email when email is configured', async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendPasswordResetEmail.mockResolvedValue({ messageId: 'msg-3' });
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_USER.id, email: TEST_USER.email }] })
      .mockResolvedValueOnce({ rows: [] });

    await forgotPassword(TEST_USER.email);

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      TEST_USER.email,
      expect.stringMatching(/^\d{6}$/)
    );
  });

  it('does not send email when email service is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_USER.id, email: TEST_USER.email }] })
      .mockResolvedValueOnce({ rows: [] });

    await forgotPassword(TEST_USER.email);

    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('normalises email to lowercase before DB lookup', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await forgotPassword('TRADIE@EXAMPLE.COM');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.anything(),
      ['tradie@example.com']
    );
  });
});

// ===========================================================================
// resetPassword()
// ===========================================================================

describe('resetPassword()', () => {
  const email = 'tradie@example.com';
  const newPassword = 'NewSecurePass99!';

  it('throws INVALID_RESET (400) when email is not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await expect(resetPassword(email, '123456', newPassword)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_RESET',
    });
  });

  it('throws NO_CODE (400) when no reset code is stored', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: TEST_USER.id,
          verification_code: null,
          verification_code_expires_at: null,
        },
      ],
    });

    await expect(resetPassword(email, '123456', newPassword)).rejects.toMatchObject({
      statusCode: 400,
      code: 'NO_CODE',
    });
  });

  it('throws CODE_EXPIRED (400) when reset code has passed its expiry time', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: TEST_USER.id,
          verification_code: '123456',
          verification_code_expires_at: new Date(Date.now() - 1),
        },
      ],
    });

    await expect(resetPassword(email, '123456', newPassword)).rejects.toMatchObject({
      statusCode: 400,
      code: 'CODE_EXPIRED',
    });
  });

  it('throws INVALID_CODE (400) when submitted code does not match stored code', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: TEST_USER.id,
          verification_code: '999999',
          verification_code_expires_at: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(resetPassword(email, '111111', newPassword)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_CODE',
    });
  });

  it('hashes the new password with bcrypt before storing', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$newhashedpassword');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: TEST_USER.id,
            verification_code: '654321',
            verification_code_expires_at: new Date(Date.now() + 60_000),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE password_hash
      .mockResolvedValueOnce({ rows: [] }); // UPDATE refresh_tokens (revoke)

    await resetPassword(email, '654321', newPassword);

    expect(mockBcryptHash).toHaveBeenCalledWith(newPassword, 12);

    const updatePasswordCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('SET password_hash')
    );
    expect(updatePasswordCall).toBeDefined();
    expect(updatePasswordCall![1][0]).toBe('$2b$12$newhashedpassword');
  });

  it('revokes all active refresh tokens after a successful password reset', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$newhashedpassword');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: TEST_USER.id,
            verification_code: '654321',
            verification_code_expires_at: new Date(Date.now() + 60_000),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE password_hash
      .mockResolvedValueOnce({ rows: [] }); // UPDATE refresh_tokens

    await resetPassword(email, '654321', newPassword);

    const revokeCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE refresh_tokens SET revoked_at') &&
      (c[0] as string).includes('WHERE user_id = $1 AND revoked_at IS NULL')
    );
    expect(revokeCall).toBeDefined();
    expect(revokeCall![1]).toContain(TEST_USER.id);
  });

  it('clears the verification code after a successful reset', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$newhashedpassword');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: TEST_USER.id,
            verification_code: '654321',
            verification_code_expires_at: new Date(Date.now() + 60_000),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await resetPassword(email, '654321', newPassword);

    const updateCall = mockDbQuery.mock.calls.find((c) =>
      (c[0] as string).includes('SET password_hash')
    );
    expect(updateCall![0]).toContain('verification_code = NULL');
    expect(updateCall![0]).toContain('verification_code_expires_at = NULL');
  });

  it('resolves without returning a value on success', async () => {
    mockBcryptHash.mockResolvedValue('$2b$12$newhashedpassword');
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: TEST_USER.id,
            verification_code: '654321',
            verification_code_expires_at: new Date(Date.now() + 60_000),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(resetPassword(email, '654321', newPassword)).resolves.toBeUndefined();
  });
});
