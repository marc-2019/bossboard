import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

const mockQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true, default: { query: (...args: unknown[]) => mockQuery(...args) },
}));
import routes from '../../routes/teams.js';
import { errorHandler } from '../../middleware/error.js';

function getInfo(authenticated = true) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = { method: 'GET', url: '/invites/test-code', headers: authenticated
      ? { authorization: `Bearer ${jwt.sign({ userId: 'user-1' }, config.jwt.secret, { algorithm: 'HS256' })}` }
      : {} } as Request;
    const response = {
      statusCode: 200,
      setHeader() { return this; },
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { resolve({ status: this.statusCode, body }); return this; },
    };
    const res = response as unknown as Response;
    const next = (error?: unknown) => error
      ? errorHandler(error as Error, req, res, reject)
      : reject(new Error('Route not matched'));
    (routes as unknown as { handle(req: Request, res: Response, callback: typeof next): void }).handle(req, res, next);
  });
}

describe('invite info privacy and authentication', () => {
  beforeEach(() => { jest.resetAllMocks(); });
  function verifiedUser() {
    mockQuery.mockResolvedValueOnce({ rows: [{ is_verified: true }] });
  }
  it('rejects unverified users before reading any invite details', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ is_verified: false }] });
    const result = await getInfo();
    expect(result).toEqual({ status: 403, body: { success: false, error: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before viewing or accepting team invites' } });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith('SELECT is_verified FROM users WHERE id = $1 AND is_active = true', ['user-1']);
  });
  it('requires authentication before reading an invite', async () => {
    expect((await getInfo(false)).status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
  it.each([
    { expires_at: new Date(0), accepted_at: null },
    { expires_at: new Date(Date.now() + 86400000), accepted_at: new Date() },
  ])('returns 410 without exposing unavailable invite details', async (dates) => {
    verifiedUser();
    mockQuery.mockResolvedValueOnce({ rows: [{ ...dates, email: 'private@example.com', team_name: 'Private team' }] });
    const result = await getInfo();
    expect(result.status).toBe(410);
    expect(JSON.stringify(result.body)).not.toContain('private@example.com');
    expect(JSON.stringify(result.body)).not.toContain('Private team');
    expect(result.body.data).toBeUndefined();
  });
  it('returns 404 for an unknown invite', async () => {
    verifiedUser();
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect((await getInfo()).status).toBe(404);
  });
  it.each([true, false])('returns minimal active details (email match: %s)', async (matchesEmail) => {
    verifiedUser();
    mockQuery.mockResolvedValueOnce({ rows: [{ expires_at: new Date(Date.now() + 86400000), accepted_at: null,
      email: 'private@example.com', team_name: 'Builders' }] })
      .mockResolvedValueOnce({ rows: [{ email: matchesEmail ? 'PRIVATE@example.com' : 'other@example.com' }] });
    const result = await getInfo();
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ teamName: 'Builders', invitedEmail: 'private@example.com', matchesEmail });
  });
});
