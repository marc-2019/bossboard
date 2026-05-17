/**
 * Subscription Service Tests
 * Tests the pure business logic functions
 */

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: any[]) => mockDbQuery(...args) },
}));

jest.mock('../../middleware/error.js', () => ({
  createError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

import {
  getTierLimits,
  getAllTiers,
  isBetaMode,
  getUserSubscription,
  updateSubscriptionTier,
  getTierUsage,
  canCreateInvoice,
  canCreateSwms,
  canAddTeamMember,
  isFeatureAvailable,
} from '../../services/subscriptions.js';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Subscription Service', () => {
  describe('getTierLimits', () => {
    it('should return tradie-level limits in beta mode (overrides free tier)', () => {
      // Beta mode is hardcoded to true in the service
      const limits = getTierLimits('free');
      // In beta, free users get tradie-level access
      expect(limits.invoicesPerMonth).toBeNull(); // unlimited
      expect(limits.swmsPerMonth).toBeNull(); // unlimited
      expect(limits.pdfExport).toBe(true);
      expect(limits.quotes).toBe(true);
      expect(limits.tier).toBe('free'); // tier label preserved
    });

    it('should return limits for tradie tier', () => {
      const limits = getTierLimits('tradie');
      expect(limits.tier).toBe('tradie');
      expect(limits.pdfExport).toBe(true);
      expect(limits.emailInvoice).toBe(true);
    });

    it('should return limits for team tier', () => {
      const limits = getTierLimits('team');
      expect(limits.tier).toBe('team');
    });
  });

  describe('getAllTiers', () => {
    it('should return all three tiers', () => {
      const tiers = getAllTiers();
      expect(tiers).toHaveLength(3);
      expect(tiers.map(t => t.tier)).toEqual(['free', 'tradie', 'team']);
    });

    it('should have correct free tier limits', () => {
      const tiers = getAllTiers();
      const free = tiers[0];
      expect(free.invoicesPerMonth).toBe(3);
      expect(free.swmsPerMonth).toBe(2);
      expect(free.pdfExport).toBe(false);
    });

    it('should have unlimited invoices for tradie', () => {
      const tiers = getAllTiers();
      const tradie = tiers[1];
      expect(tradie.invoicesPerMonth).toBeNull();
    });

    it('should have team members limit for team tier', () => {
      const tiers = getAllTiers();
      const team = tiers[2];
      expect(team.teamMembers).toBe(5);
    });
  });

  describe('isBetaMode', () => {
    const ORIGINAL_BETA = process.env.BETA_MODE;

    afterEach(() => {
      if (ORIGINAL_BETA === undefined) {
        delete process.env.BETA_MODE;
      } else {
        process.env.BETA_MODE = ORIGINAL_BETA;
      }
    });

    it('defaults to true when BETA_MODE env var is unset', () => {
      delete process.env.BETA_MODE;
      expect(isBetaMode()).toBe(true);
    });

    it("returns true when BETA_MODE='true'", () => {
      process.env.BETA_MODE = 'true';
      expect(isBetaMode()).toBe(true);
    });

    it("returns true for any non-'false' value (safety: typo-resistant default)", () => {
      process.env.BETA_MODE = 'yes';
      expect(isBetaMode()).toBe(true);
    });

    it("returns false ONLY when BETA_MODE='false' exactly", () => {
      process.env.BETA_MODE = 'false';
      expect(isBetaMode()).toBe(false);
    });
  });

  describe('getUserSubscription', () => {
    it('should return subscription info', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{
          subscription_tier: 'free',
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_started_at: null,
          subscription_expires_at: null,
        }],
      });

      const sub = await getUserSubscription('user-1');

      expect(sub.tier).toBe('free');
      expect(sub.stripeCustomerId).toBeNull();
    });

    it('should throw 404 when user not found', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await expect(getUserSubscription('missing'))
        .rejects.toThrow('User not found');
    });
  });

  describe('getTierUsage', () => {
    it('should aggregate usage from multiple queries', async () => {
      mockDbQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })  // invoices
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })  // swms
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // team members

      const usage = await getTierUsage('user-1');

      expect(usage.invoicesThisMonth).toBe(5);
      expect(usage.swmsThisMonth).toBe(3);
      expect(usage.teamMemberCount).toBe(2);
      expect(mockDbQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('canCreateInvoice', () => {
    it('should allow unlimited invoices for tradie tier (beta)', async () => {
      const result = await canCreateInvoice('user-1', 'tradie');
      expect(result.allowed).toBe(true);
    });

    it('should allow invoices for free tier in beta (gets tradie limits)', async () => {
      // In beta, free gets tradie limits (unlimited)
      const result = await canCreateInvoice('user-1', 'free');
      expect(result.allowed).toBe(true);
    });
  });

  describe('canCreateSwms', () => {
    it('should allow unlimited SWMS for tradie tier', async () => {
      const result = await canCreateSwms('user-1', 'tradie');
      expect(result.allowed).toBe(true);
    });
  });

  describe('canAddTeamMember', () => {
    it('should reject for free tier', async () => {
      const result = await canAddTeamMember('user-1', 'free');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Team plan');
    });

    it('should reject for tradie tier', async () => {
      const result = await canAddTeamMember('user-1', 'tradie');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Team plan');
    });

    it('should allow for team tier within limit', async () => {
      mockDbQuery.mockResolvedValue({ rows: [{ count: '3' }] });

      const result = await canAddTeamMember('user-1', 'team');
      expect(result.allowed).toBe(true);
    });

    it('should allow for team tier in beta (inherits unlimited from tradie limits)', async () => {
      // In beta mode, getTierLimits returns tradie limits where teamMembers=null (unlimited)
      mockDbQuery.mockResolvedValue({ rows: [{ count: '5' }] });

      const result = await canAddTeamMember('user-1', 'team');
      expect(result.allowed).toBe(true);
    });
  });

  describe('updateSubscriptionTier', () => {
    function makeSubRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        subscription_tier: 'tradie',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        subscription_started_at: new Date('2026-01-01'),
        subscription_expires_at: new Date('2026-02-01'),
        ...overrides,
      };
    }

    it('upgrades a user to tradie tier and persists stripe data', async () => {
      mockDbQuery.mockResolvedValue({ rows: [makeSubRow()] });

      const info = await updateSubscriptionTier('user-1', 'tradie', {
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        startedAt: new Date('2026-01-01'),
      });

      expect(info.tier).toBe('tradie');
      expect(info.stripeCustomerId).toBe('cus_123');
      expect(info.stripeSubscriptionId).toBe('sub_123');
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining(['user-1', 'tradie'])
      );
    });

    it('upgrades a user to team tier', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [makeSubRow({ subscription_tier: 'team', stripe_subscription_id: 'sub_team_1' })],
      });

      const info = await updateSubscriptionTier('user-1', 'team', {
        stripeSubscriptionId: 'sub_team_1',
      });

      expect(info.tier).toBe('team');
      expect(info.stripeSubscriptionId).toBe('sub_team_1');
    });

    it('downgrades user to free tier (cancellation flow)', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [makeSubRow({
          subscription_tier: 'free',
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: null,
        })],
      });

      const info = await updateSubscriptionTier('user-1', 'free', {
        stripeSubscriptionId: undefined,
        expiresAt: new Date(),
      });

      expect(info.tier).toBe('free');
      expect(info.stripeSubscriptionId).toBeNull();
    });

    it('updates expiresAt when provided', async () => {
      const expiresAt = new Date('2026-12-31');
      mockDbQuery.mockResolvedValue({
        rows: [makeSubRow({ subscription_expires_at: expiresAt })],
      });

      const info = await updateSubscriptionTier('user-1', 'tradie', { expiresAt });

      expect(info.expiresAt).toEqual(expiresAt);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('subscription_expires_at'),
        expect.any(Array)
      );
    });

    it('throws USER_NOT_FOUND when user does not exist or is inactive', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await expect(updateSubscriptionTier('missing', 'tradie'))
        .rejects.toThrow('User not found');
    });

    it('updates tier only when no stripeData provided', async () => {
      mockDbQuery.mockResolvedValue({ rows: [makeSubRow({ subscription_tier: 'tradie' })] });

      await updateSubscriptionTier('user-1', 'tradie');

      const [sql, params] = mockDbQuery.mock.calls[0];
      // SET clause should only contain subscription_tier and updated_at — verify by checking
      // that params array has exactly the expected values: [userId, tier]
      expect(params).toEqual(['user-1', 'tradie']);
      // SET clause in the UPDATE body should NOT include stripe fields
      const setClause = sql.split('RETURNING')[0];
      expect(setClause).not.toContain('stripe_customer_id');
    });
  });

  describe('isFeatureAvailable', () => {
    it('should return true for tradie features in beta', () => {
      // In beta, all users get tradie-level features
      expect(isFeatureAvailable('free', 'pdfExport')).toBe(true);
      expect(isFeatureAvailable('free', 'quotes')).toBe(true);
      expect(isFeatureAvailable('free', 'expenses')).toBe(true);
    });

    it('should return true for all features on tradie tier', () => {
      expect(isFeatureAvailable('tradie', 'pdfExport')).toBe(true);
      expect(isFeatureAvailable('tradie', 'emailInvoice')).toBe(true);
      expect(isFeatureAvailable('tradie', 'photos')).toBe(true);
    });
  });
});
