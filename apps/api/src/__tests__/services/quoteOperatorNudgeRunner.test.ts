/**
 * Quote P1.2 operator-nudge runner.
 *
 * Stamps operator bookkeeping only. Push to the operator. Never uses
 * client_email (may be selected). Never emails or SMS.
 */

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

const mockGetPushToken = jest.fn();
const mockSendPushNotifications = jest.fn();
jest.mock('../../services/notifications.js', () => ({
  __esModule: true,
  default: {
    getPushToken: (...args: unknown[]) => mockGetPushToken(...args),
    sendPushNotifications: (...args: unknown[]) => mockSendPushNotifications(...args),
  },
}));

import { runOperatorQuoteNudges } from '../../services/quoteOperatorNudgeRunner.js';
import { NUDGE_TITLE, operatorNudgeBody } from '../../services/quoteOperatorNudge.js';

const NOW = new Date('2026-08-10T08:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'quote-uuid-1',
    user_id: 'user-1',
    quote_number: 'QTE-0001',
    status: 'sent',
    sent_at: new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
    last_operator_nudge_at: null,
    operator_nudge_count: 0,
    client_email: 'client@example.com',
    ...overrides,
  };
}

function allSql(): string {
  return mockDbQuery.mock.calls.map((call) => String(call[0])).join('\n');
}

function allNotificationPayload(): string {
  return JSON.stringify({
    getPushToken: mockGetPushToken.mock.calls,
    sendPush: mockSendPushNotifications.mock.calls,
  });
}

describe('runOperatorQuoteNudges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPushToken.mockResolvedValue('ExponentPushToken[test]');
    mockSendPushNotifications.mockResolvedValue([{ status: 'ok' }]);
    mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('stamps operator columns with tenant-scoped UPDATE and never uses client_email', async () => {
    const row = makeRow();
    mockDbQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await runOperatorQuoteNudges(NOW);

    expect(result.notified).toBe(1);
    expect(mockGetPushToken).toHaveBeenCalledWith('user-1');
    expect(mockSendPushNotifications).toHaveBeenCalledTimes(1);

    const messages = mockSendPushNotifications.mock.calls[0][0];
    expect(messages).toHaveLength(1);
    expect(messages[0].title).toBe(NUDGE_TITLE);
    expect(messages[0].body).toBe(operatorNudgeBody(1, 'QTE-0001'));
    expect(messages[0].data).toEqual(
      expect.objectContaining({ type: 'quote_operator_nudge' })
    );
    expect(messages[0].to).toBe('ExponentPushToken[test]');

    const updateCall = mockDbQuery.mock.calls.find(([sql]) =>
      String(sql).match(/UPDATE\s+quotes/i)
    );
    expect(updateCall).toBeDefined();
    const [updateSql, updateParams] = updateCall as [string, unknown[]];
    expect(updateSql).toMatch(/operator_nudge_count\s*=\s*operator_nudge_count\s*\+\s*1/i);
    expect(updateSql).toMatch(/last_operator_nudge_at/i);
    expect(updateSql).toMatch(/WHERE[\s\S]*id\s*=\s*\$/i);
    expect(updateSql).toMatch(/user_id\s*=\s*\$/i);
    expect(updateSql).toMatch(/status\s*=\s*'sent'/i);
    expect(updateParams).toEqual(expect.arrayContaining(['quote-uuid-1', 'user-1']));

    const used = `${allSql()}\n${allNotificationPayload()}`.toLowerCase();
    expect(used).not.toContain('client@example.com');
    expect(used).not.toMatch(/sendemail|send_sms|twilio|resend/);
  });

  it('skips quotes still inside the day-1 window', async () => {
    const tooNew = makeRow({
      sent_at: new Date(NOW.getTime() - 12 * 60 * 60 * 1000),
      operator_nudge_count: 0,
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [tooNew] });

    const result = await runOperatorQuoteNudges(NOW);

    expect(result.notified).toBe(0);
    expect(mockGetPushToken).not.toHaveBeenCalled();
    expect(mockSendPushNotifications).not.toHaveBeenCalled();
    expect(allSql()).not.toMatch(/UPDATE\s+quotes/i);
  });

  it('skips a due quote that is only 2 days old after the first nudge', async () => {
    const afterFirst = makeRow({
      sent_at: new Date(NOW.getTime() - 2 * MS_PER_DAY),
      operator_nudge_count: 1,
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [afterFirst] });

    const result = await runOperatorQuoteNudges(NOW);

    expect(result.notified).toBe(0);
    expect(mockSendPushNotifications).not.toHaveBeenCalled();
  });
});
