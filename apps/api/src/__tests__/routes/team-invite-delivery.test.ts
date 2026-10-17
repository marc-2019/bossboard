import type { Request, Response } from 'express';

const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../services/email.js', () => ({ sendTeamInviteEmail: (...args: unknown[]) => mockSend(...args) }));
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args), transaction: (...args: unknown[]) => mockTransaction(...args) },
}));
jest.mock('../../middleware/auth.js', () => ({ authenticate: (req: any, _res: any, next: any) => {
  req.user = { userId: 'owner' }; next();
} }));
jest.mock('../../middleware/subscription.js', () => ({
  attachSubscription: (_req: any, _res: any, next: any) => next(),
  checkLimit: () => (_req: any, _res: any, next: any) => next(),
}));
import routes from '../../routes/teams.js';
import { errorHandler } from '../../middleware/error.js';

// Exercise the registered Express route and middleware without a listening socket.
// This also works in restricted CI environments where listen() is prohibited.
function postInvite() {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = { method: 'POST', url: '/team-1/invites', headers: {},
      body: { email: 'worker@example.com' } } as Request;
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { resolve({ status: this.statusCode, body }); return this; },
    } as Response;
    const handleError = (error?: unknown) => {
      if (error) errorHandler(error as Error, req, res, reject);
      else reject(new Error('Invite route was not matched'));
    };
    (routes as unknown as { handle: (req: Request, res: Response, next: typeof handleError) => void })
      .handle(req, res, handleError);
  });
}

describe('team invitation delivery and replacement through the route', () => {
  let oldInvite: { expires_at: Date; accepted_at: Date | null } | null;
  let deleted: boolean;
  beforeEach(() => {
    jest.clearAllMocks();
    oldInvite = { expires_at: new Date(0), accepted_at: null };
    deleted = false;
    mockSend.mockResolvedValue({ messageId: 'message-1' });
    mockQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('AS team_name')
      ? [{ team_name: 'Builders', name: 'Owner', email: 'owner@example.com' }] : [{ role: 'owner' }] }));
    const client = { query: jest.fn(async (sql: string, args: unknown[]) => {
      if (sql.includes('SELECT id FROM team_invites')) {
        return { rows: oldInvite && !oldInvite.accepted_at && oldInvite.expires_at > new Date() ? [{ id: 'old' }] : [] };
      }
      if (sql.startsWith('DELETE FROM team_invites')) { oldInvite = null; deleted = true; }
      if (sql.includes('INSERT INTO team_invites')) {
        if (oldInvite) throw new Error('UNIQUE violation: team_id, email');
        return { rows: [{ id: 'new', team_id: args[0], email: args[1], role: args[2], invited_by: args[3],
          invite_code: args[4], expires_at: args[5], accepted_at: null, created_at: new Date() }] };
      }
      return { rows: [] };
    }) };
    mockTransaction.mockImplementation(async (fn) => fn(client));
  });

  it('replaces an expired invite and returns 201, not a unique violation 500', async () => {
    const res = await postInvite();
    expect(res.status).toBe(201);
    expect(deleted).toBe(true);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(res.body.data.invite.emailSent).toBe(true);
    expect(mockSend).toHaveBeenCalledWith('worker@example.com', expect.objectContaining({
      teamName: 'Builders', inviterName: 'Owner', inviterEmail: 'owner@example.com',
      acceptUrl: expect.stringContaining(`/invite/${res.body.data.invite.inviteCode}`),
    }));
  });

  it('still creates an invite with emailSent false when delivery throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('Unavailable'));
    const res = await postInvite();
    expect(res.status).toBe(201);
    expect(res.body.data.invite).toMatchObject({ id: 'new', emailSent: false });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('rejects an active pending invite with 400 INVITE_PENDING', async () => {
    oldInvite = { expires_at: new Date(Date.now() + 86400000), accepted_at: null };
    const res = await postInvite();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVITE_PENDING');
    expect(deleted).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
