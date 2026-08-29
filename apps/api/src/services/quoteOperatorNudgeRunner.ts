/**
 * Quote P1.2 operator-nudge runner.
 *
 * Selects open sent quotes, notifies the operator via push only, then stamps
 * operator_nudge_count / last_operator_nudge_at under tenant scope.
 * client_email may be selected but is never used. No email or SMS.
 */

import db from './database.js';
import notificationsService from './notifications.js';
import {
  NUDGE_TITLE,
  isOperatorNudgeDue,
  nextNudgeDay,
  operatorNudgeBody,
} from './quoteOperatorNudge.js';

interface QuoteNudgeRow {
  id: string;
  user_id: string;
  quote_number: string;
  status: string;
  sent_at: Date | string | null;
  last_operator_nudge_at: Date | string | null;
  operator_nudge_count: number;
  client_email?: string | null;
}

export async function runOperatorQuoteNudges(
  now?: Date
): Promise<{ checked: number; notified: number }> {
  const at = now instanceof Date ? now : new Date();
  let notified = 0;

  try {
    const result = await db.query<QuoteNudgeRow>(
      `SELECT id, user_id, quote_number, status, sent_at,
              last_operator_nudge_at, operator_nudge_count, client_email
       FROM quotes
       WHERE status = 'sent'
         AND sent_at IS NOT NULL
         AND operator_nudge_count < 3`
    );

    const rows = result.rows;
    for (const row of rows) {
      if (!isOperatorNudgeDue(row, at)) continue;

      const day = nextNudgeDay(Number(row.operator_nudge_count) || 0);
      if (day == null) continue;

      const token = await notificationsService.getPushToken(row.user_id);
      if (!token) continue;

      const tickets = await notificationsService.sendPushNotifications([
        {
          to: token,
          title: NUDGE_TITLE,
          body: operatorNudgeBody(day, row.quote_number),
          data: {
            type: 'quote_operator_nudge',
            quoteId: row.id,
          },
          sound: 'default',
        },
      ]);

      if (tickets[0]?.status !== 'ok') continue;

      const stamped = await db.query(
        `UPDATE quotes
         SET operator_nudge_count = operator_nudge_count + 1,
             last_operator_nudge_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'sent'`,
        [row.id, row.user_id]
      );

      if ((stamped.rowCount ?? 0) > 0) {
        notified += 1;
      }
    }

    console.log(`[QuoteNudge] Operator quote nudge complete: ${notified} of ${rows.length} checked`);
    return { checked: rows.length, notified };
  } catch (error) {
    console.error('[QuoteNudge] Operator quote nudge run failed:', error);
    return { checked: 0, notified };
  }
}
