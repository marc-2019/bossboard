/**
 * Team Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockCreateTeam = jest.fn();
const mockGetMyTeam = jest.fn();
const mockGetTeam = jest.fn();
const mockUpdateTeam = jest.fn();
const mockListMembers = jest.fn();
const mockRemoveMember = jest.fn();
const mockUpdateMemberRole = jest.fn();
const mockLeaveTeam = jest.fn();
const mockInviteMember = jest.fn();
const mockListInvites = jest.fn();
const mockCancelInvite = jest.fn();
const mockGetMyPendingInvites = jest.fn();
const mockAcceptInvite = jest.fn();
const mockDeclineInvite = jest.fn();
const mockDbQuery = jest.fn();

jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

jest.mock('../../services/teams.js', () => ({
  __esModule: true,
  default: {
    createTeam: mockCreateTeam,
    getMyTeam: mockGetMyTeam,
    getTeam: mockGetTeam,
    updateTeam: mockUpdateTeam,
    listMembers: mockListMembers,
    removeMember: mockRemoveMember,
    updateMemberRole: mockUpdateMemberRole,
    leaveTeam: mockLeaveTeam,
    inviteMember: mockInviteMember,
    listInvites: mockListInvites,
    cancelInvite: mockCancelInvite,
    getMyPendingInvites: mockGetMyPendingInvites,
    acceptInvite: mockAcceptInvite,
    declineInvite: mockDeclineInvite,
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

jest.mock('../../middleware/subscription.js', () => ({
  attachSubscription: function (_req: any, _res: any, next: any) { next(); },
  checkLimit: function () { return function (_req: any, _res: any, next: any) { next(); }; },
}));

import teamRoutes from '../../routes/teams.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/teams', teamRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDbQuery.mockResolvedValue({ rows: [{ is_verified: true }] });
});

describe('Team Routes', () => {
  describe('POST /api/v1/teams', () => {
    it('should create a team', async () => {
      mockCreateTeam.mockResolvedValue({ id: 't-1', name: 'Smith Electrical' });

      const response = await request(app)
        .post('/api/v1/teams')
        .send({ name: 'Smith Electrical' });

      expect(response.status).toBe(201);
      expect(response.body.data.team.name).toBe('Smith Electrical');
    });

    it('should reject empty team name', async () => {
      const response = await request(app)
        .post('/api/v1/teams')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/teams/my-team', () => {
    it('should return user team with members', async () => {
      const teamData = { team: { id: 't-1' }, role: 'owner', members: [] };
      mockGetMyTeam.mockResolvedValue(teamData);

      const response = await request(app).get('/api/v1/teams/my-team');

      expect(response.status).toBe(200);
      expect(response.body.data.team.id).toBe('t-1');
    });

    it('should return null when user has no team', async () => {
      mockGetMyTeam.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/teams/my-team');

      expect(response.status).toBe(200);
      expect(response.body.data.team).toBeNull();
      expect(response.body.data.members).toEqual([]);
    });
  });

  describe('GET /api/v1/teams/invites/pending', () => {
    it('should return pending invites', async () => {
      mockGetMyPendingInvites.mockResolvedValue([{ id: 'inv-1', teamName: 'Team A' }]);

      const response = await request(app).get('/api/v1/teams/invites/pending');

      expect(response.status).toBe(200);
      expect(response.body.data.invites).toHaveLength(1);
    });
  });

  describe('POST /api/v1/teams/invites/:inviteCode/accept', () => {
    it('should accept an invite', async () => {
      mockAcceptInvite.mockResolvedValue({ team: { id: 't-1' }, role: 'worker' });

      const response = await request(app).post('/api/v1/teams/invites/code-123/accept');

      expect(response.status).toBe(200);
      expect(mockAcceptInvite).toHaveBeenCalledWith('test-user-id', 'code-123');
    });
  });

  describe('POST /api/v1/teams/invites/:inviteCode/decline', () => {
    it('should decline an invite', async () => {
      mockDeclineInvite.mockResolvedValue(undefined);

      const response = await request(app).post('/api/v1/teams/invites/code-123/decline');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invite declined');
    });
  });

  describe('unverified email cannot use invitee endpoints', () => {
    it('GET /invites/pending returns 403 and does not load invites', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ is_verified: false }] });
      mockGetMyPendingInvites.mockResolvedValue([
        { id: 'inv-1', inviteCode: 'redacted', role: 'admin' },
      ]);

      const response = await request(app).get('/api/v1/teams/invites/pending');

      expect(mockGetMyPendingInvites).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: 'EMAIL_NOT_VERIFIED',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/inviteCode|redacted/i);
    });

    it('POST accept returns 403 and does not create a membership', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ is_verified: false }] });
      mockAcceptInvite.mockResolvedValue({
        teamId: 't-1',
        userId: 'test-user-id',
        role: 'admin',
        inviteStatus: 'accepted',
      });

      const response = await request(app).post('/api/v1/teams/invites/redacted/accept');

      expect(mockAcceptInvite).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('EMAIL_NOT_VERIFIED');
      expect(JSON.stringify(response.body)).not.toMatch(/inviteStatus|redacted/i);
    });

    it('POST decline returns 403 and does not mutate the invite', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ is_verified: false }] });
      mockDeclineInvite.mockResolvedValue(undefined);

      const response = await request(app).post('/api/v1/teams/invites/redacted/decline');

      expect(mockDeclineInvite).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('EMAIL_NOT_VERIFIED');
    });

    it('verified callers can still list pending invites', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [{ is_verified: true }] });
      mockGetMyPendingInvites.mockResolvedValue([{ id: 'inv-1', teamName: 'Team A' }]);

      const response = await request(app).get('/api/v1/teams/invites/pending');

      expect(response.status).toBe(200);
      expect(mockGetMyPendingInvites).toHaveBeenCalledWith('test-user-id');
      expect(response.body.data.invites).toHaveLength(1);
    });
  });

  describe('GET /api/v1/teams/:teamId', () => {
    it('should return team details', async () => {
      mockGetTeam.mockResolvedValue({ id: 't-1', name: 'Team A' });

      const response = await request(app).get('/api/v1/teams/t-1');

      expect(response.status).toBe(200);
      expect(response.body.data.team.id).toBe('t-1');
    });
  });

  describe('PUT /api/v1/teams/:teamId', () => {
    it('should update team name', async () => {
      mockUpdateTeam.mockResolvedValue({ id: 't-1', name: 'New Name' });

      const response = await request(app)
        .put('/api/v1/teams/t-1')
        .send({ name: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body.data.team.name).toBe('New Name');
    });

    it('should reject empty name', async () => {
      const response = await request(app)
        .put('/api/v1/teams/t-1')
        .send({ name: '' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/teams/:teamId/members', () => {
    it('should list team members', async () => {
      mockListMembers.mockResolvedValue([{ userId: 'u-1', role: 'owner' }]);

      const response = await request(app).get('/api/v1/teams/t-1/members');

      expect(response.status).toBe(200);
      expect(response.body.data.members).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/teams/:teamId/members/:memberId', () => {
    it('should remove a member', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const response = await request(app).delete('/api/v1/teams/t-1/members/m-1');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Member removed successfully');
    });
  });

  describe('PUT /api/v1/teams/:teamId/members/:memberId/role', () => {
    it('should update member role', async () => {
      mockUpdateMemberRole.mockResolvedValue({ userId: 'm-1', role: 'admin' });

      const response = await request(app)
        .put('/api/v1/teams/t-1/members/m-1/role')
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.data.member.role).toBe('admin');
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .put('/api/v1/teams/t-1/members/m-1/role')
        .send({ role: 'superadmin' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/teams/:teamId/leave', () => {
    it('should leave team', async () => {
      mockLeaveTeam.mockResolvedValue(undefined);

      const response = await request(app).post('/api/v1/teams/t-1/leave');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Left team successfully');
    });
  });

  describe('POST /api/v1/teams/:teamId/invites', () => {
    it('should invite a member', async () => {
      mockInviteMember.mockResolvedValue({ id: 'inv-1', email: 'new@example.com' });

      const response = await request(app)
        .post('/api/v1/teams/t-1/invites')
        .send({ email: 'new@example.com', role: 'worker' });

      expect(response.status).toBe(201);
      expect(response.body.data.invite.email).toBe('new@example.com');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/teams/t-1/invites')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/teams/:teamId/invites', () => {
    it('should list pending invites', async () => {
      mockListInvites.mockResolvedValue([{ id: 'inv-1' }]);

      const response = await request(app).get('/api/v1/teams/t-1/invites');

      expect(response.status).toBe(200);
      expect(response.body.data.invites).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/teams/:teamId/invites/:inviteId', () => {
    it('should cancel an invite', async () => {
      mockCancelInvite.mockResolvedValue(undefined);

      const response = await request(app).delete('/api/v1/teams/t-1/invites/inv-1');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invite cancelled successfully');
    });
  });
});
