/**
 * Unit tests for referral share helpers (invoice post-send prompt).
 */

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockShare = jest.fn();
const mockAlert = jest.fn();
const mockMe = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: (...args: unknown[]) => mockSetItem(...args),
  },
}));

jest.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Share: { share: (...args: unknown[]) => mockShare(...args) },
}));

jest.mock('../api', () => ({
  referralsApi: {
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

import {
  maybePromptReferralAfterInvoiceSend,
  shareReferralInvite,
} from '../referralShare';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
  mockShare.mockResolvedValue({ action: 'sharedAction' });
});

describe('maybePromptReferralAfterInvoiceSend', () => {
  it('does nothing if prompt already seen', async () => {
    mockGetItem.mockResolvedValue('1');
    await maybePromptReferralAfterInvoiceSend();
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does not burn flag when user is not eligible', async () => {
    mockMe.mockResolvedValue({
      data: {
        success: true,
        data: {
          eligible: false,
          code: null,
          shareUrl: null,
          freeMonthsBalance: 0,
          pendingReferralCode: null,
          stats: { pending: 0, activated: 0 },
          offerCopy: 'offer',
        },
      },
    });
    await maybePromptReferralAfterInvoiceSend();
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('prompts paid eligible users once and marks seen', async () => {
    mockMe.mockResolvedValue({
      data: {
        success: true,
        data: {
          eligible: true,
          code: 'ABC123',
          shareUrl: 'https://bossboard.instilligent.com/r/ABC123',
          freeMonthsBalance: 0,
          pendingReferralCode: null,
          stats: { pending: 0, activated: 0 },
          offerCopy: 'Give a mate a free month',
        },
      },
    });
    await maybePromptReferralAfterInvoiceSend();
    expect(mockSetItem).toHaveBeenCalledWith('bb_referral_invoice_prompt_v1', '1');
    expect(mockAlert).toHaveBeenCalled();
    const title = mockAlert.mock.calls[0][0];
    expect(String(title)).toMatch(/Invite a mate/i);
  });
});

describe('shareReferralInvite', () => {
  it('shares offer + url when shareUrl present', async () => {
    const ok = await shareReferralInvite({
      eligible: true,
      code: 'X',
      shareUrl: 'https://example.com/r/X',
      freeMonthsBalance: 0,
      pendingReferralCode: null,
      stats: { pending: 0, activated: 0 },
      offerCopy: 'Free month each',
    });
    expect(ok).toBe(true);
    expect(mockShare).toHaveBeenCalled();
    const arg = mockShare.mock.calls[0][0];
    expect(arg.message).toContain('https://example.com/r/X');
    expect(arg.message).toContain('Free month each');
  });

  it('returns false without shareUrl', async () => {
    const ok = await shareReferralInvite({
      eligible: false,
      code: null,
      shareUrl: null,
      freeMonthsBalance: 0,
      pendingReferralCode: null,
      stats: { pending: 0, activated: 0 },
      offerCopy: '',
    });
    expect(ok).toBe(false);
    expect(mockShare).not.toHaveBeenCalled();
  });
});
