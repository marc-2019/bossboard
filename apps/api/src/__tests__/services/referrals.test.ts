/**
 * Referral service unit tests
 */

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1'),
}));

const mockDbQuery = jest.fn();
const mockDbTransaction = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
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

jest.mock('../../config/index.js', () => ({
  config: {
    stripe: { returnUrl: 'https://bossboard.instilligent.com/' },
    isDevelopment: true,
  },
}));

// Avoid Stripe/IAP side effects
jest.mock('../../services/referral-billing.js', () => ({
  applyFreeMonthBillingCredit: jest.fn().mockResolvedValue(undefined),
}));

import {
  ensureReferralCode,
  attachReferralCode,
  grantFreeMonths,
  activateReferralOnPaid,
  lookupReferralCode,
} from '../../services/referrals.js';

beforeEach(() => {
  jest.clearAllMocks();
  mockDbTransaction.mockImplementation(async (cb: (client: { query: typeof mockDbQuery }) => Promise<unknown>) => {
    return cb({ query: mockDbQuery });
  });
});

describe('ensureReferralCode', () => {
  it('rejects free-tier users', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ subscription_tier: 'free' }] });
    await expect(ensureReferralCode('user-1')).rejects.toMatchObject({
      code: 'REFERRAL_NOT_ELIGIBLE',
    });
  });

  it('returns existing code for paid user', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ subscription_tier: 'tradie' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'BBTEST12' }] });
    const r = await ensureReferralCode('user-1');
    expect(r.code).toBe('BBTEST12');
    expect(r.shareUrl).toContain('/r/BBTEST12');
  });
});

describe('lookupReferralCode', () => {
  it('returns null for missing code', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await lookupReferralCode('BBMISSING')).toBeNull();
  });

  it('returns code + name', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ code: 'BBABC123', name: 'Marc', tier: 'tradie' }],
    });
    const r = await lookupReferralCode('bbabc123');
    expect(r).toEqual({ code: 'BBABC123', referrerName: 'Marc' });
  });
});

describe('attachReferralCode', () => {
  it('blocks self-referral by user id', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'code-1', user_id: 'user-1', code: 'BBSELF1' }],
      });
    await expect(attachReferralCode('user-1', 'BBSELF1')).rejects.toMatchObject({
      code: 'REFERRAL_SELF',
    });
  });

  it('creates pending redemption', async () => {
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'code-1', user_id: 'referrer-1', code: 'BBMATE01' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'user-2', email: 'b@example.com' },
          { id: 'referrer-1', email: 'a@example.com' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // no existing redemption
      .mockResolvedValueOnce({ rowCount: 1 }) // insert redemption
      .mockResolvedValueOnce({ rowCount: 1 }); // update pending code

    const r = await attachReferralCode('user-2', 'BBMATE01');
    expect(r).toEqual({ code: 'BBMATE01', status: 'pending' });
  });
});

describe('grantFreeMonths', () => {
  it('caps stack at 12', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ free_months_balance: 11 }] }) // select for update
      .mockResolvedValueOnce({ rowCount: 1 }) // update balance
      .mockResolvedValueOnce({ rowCount: 1 }); // insert grant

    const r = await grantFreeMonths({
      userId: 'user-1',
      months: 5,
      reason: 'referral_referee',
    });
    expect(r.granted).toBe(1);
    expect(r.balanceAfter).toBe(12);
  });

  it('grants nothing when already at cap', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ free_months_balance: 12 }] });
    const r = await grantFreeMonths({
      userId: 'user-1',
      months: 1,
      reason: 'referral_referrer',
    });
    expect(r.granted).toBe(0);
    expect(r.balanceAfter).toBe(12);
  });
});

describe('activateReferralOnPaid', () => {
  it('returns not activated when no redemption', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] }) // redemption
      .mockResolvedValueOnce({ rows: [{ pending_referral_code: null }] });
    const r = await activateReferralOnPaid('user-2');
    expect(r.activated).toBe(false);
  });

  it('grants both sides when pending and referrer paid', async () => {
    // First query: redemption with paid referrer
    mockDbQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'red-1',
            referral_code_id: 'code-1',
            status: 'pending',
            referrer_user_id: 'referrer-1',
            referrer_tier: 'tradie',
            referee_email: 'b@example.com',
            referrer_email: 'a@example.com',
          },
        ],
      })
      // flip to activated
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'red-1' }] })
      // grantFreeMonths referee — transaction client queries
      .mockResolvedValueOnce({ rows: [{ free_months_balance: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      // grantFreeMonths referrer
      .mockResolvedValueOnce({ rows: [{ free_months_balance: 2 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      // update redemption granted flags
      .mockResolvedValueOnce({ rowCount: 1 })
      // clear pending code
      .mockResolvedValueOnce({ rowCount: 1 });

    const r = await activateReferralOnPaid('user-2');
    expect(r.activated).toBe(true);
    expect(r.refereeGranted).toBe(1);
    expect(r.referrerGranted).toBe(1);
  });
});
