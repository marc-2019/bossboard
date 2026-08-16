const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

const mockGetPushToken = jest.fn();
const mockSendPush = jest.fn();
jest.mock('../../services/notifications.js', () => ({
  __esModule: true,
  default: {
    getPushToken: (...args: unknown[]) => mockGetPushToken(...args),
    sendPushNotifications: (...args: unknown[]) => mockSendPush(...args),
  },
}));

import { runOperatorQuoteNudges } from '../../services/quoteOperatorNudgeRunner.js';

const sent = new Date('2026-08-01T00:00:00.000Z');
const now = new Date('2026-08-02T00:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runOperatorQuoteNudges',
  () => {
    it('stamps the operator columns and never uses client_email',
      async () => {
        mockDbQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'q1',
                user_id: 'user-1',
                quote_number: 'QTE-0001',
                status: 'sent',
                sent_at: sent,
                operator_nudge_count: 0,
                client_email: 'client@example.com',
              },
            ],
          })
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'q1' }] });
        mockGetPushToken.mockResolvedValue('ExponentPushToken[test]');
        mockSendPush.mockResolvedValue([{ status: 'ok' }]);

        const result = await runOperatorQuoteNudges(now);
        expect(result).toEqual({ checked: 1, nudged: 1 });

        const updateSql = mockDbQuery.mock.calls[1][0] as string;
        const updateParams = mockDbQuery.mock.calls[1][1] as unknown[];
        expect(updateSql).toContain('operator_nudge_count');
        expect(updateSql).toContain('last_operator_nudge_at');
        expect(updateSql).toContain('user_id');
        expect(updateParams).toContain('user-1');
        expect(updateParams).toContain('q1');
        expect(JSON.stringify(mockDbQuery.mock.calls)).not.toMatch(/client@example.com/);

        expect(mockSendPush).toHaveBeenCalledWith([
          expect.objectContaining({
            title: 'Quote follow-up',
            body: 'Follow up on quote QTE-0001?',
            data: expect.objectContaining({ type: 'quote_operator_nudge' }),
          }),
        ]);
      });

    it('skips quotes still inside the day-1 window',
      async () => {
        mockDbQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'q2',
              user_id: 'user-1',
              quote_number: 'QTE-0002',
              status: 'sent',
              sent_at: now,
              operator_nudge_count: 0,
              client_email: null,
            },
          ],
        });

        const result = await runOperatorQuoteNudges(now);
        expect(result).toEqual({ checked: 1, nudged: 0 });
        expect(mockDbQuery).toHaveBeenCalledTimes(1);
        expect(mockSendPush).not.toHaveBeenCalled();
      });
  });
