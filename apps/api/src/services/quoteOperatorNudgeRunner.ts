/**
 * Apply due operator quote nudges. Tenant = user_id.
 * Never emails or SMS the client.
 */

import db from './database.js';
import notificationsService from './notifications.js';
import {
  isOperatorNudgeDue,
  operatorNudgeBody,
  NUDGE_TITLE,
  type NudgeDay,
} from './quoteOperatorNudge.js';

interface SentQuoteRow {
  id: string;
  user_id: string;
  quote_number: string;
  status: string;
  sent_at: Date | string | null;
  operator_nudge_count: number | null;
  client_email: string | null;
}

export async function runOperatorQuoteNudges(now: Date = new Date()): Promise<{
  checked: number;
  nudged: number;
}> {
  const result = await db.query<SentQuoteRow>(
    `SELECT id, user_id, quote_number, status, sent_at, operator_nudge_count, client_email
     FROM quotes
     WHERE status = 'sent'
       AND sent_at IS NOT NULL
       AND COALESCE(operator_nudge_count, 0) < 3`
  );

  let nudged = 0;
  for (const row of result.rows) {
    const decision = isOperatorNudgeDue({
      status: row.status,
      sentAt: row.sent_at,
      nudgeCount: row.operator_nudge_count ?? 0,
      now,
    });
    if (!decision.due || !decision.day) continue;

    const updated = await db.query(
      `UPDATE quotes
       SET operator_nudge_count = COALESCE(operator_nudge_count, 0) + 1,
           last_operator_nudge_at = $1,
           updated_at = $1
       WHERE id = $2 AND user_id = $3 AND status = 'sent'
       RETURNING id`,
      [now, row.id, row.user_id]
    );
    if ((updated.rowCount ?? 0) === 0) continue;

    await notifyOperator(row.user_id, row.quote_number, decision.day, row.id);
    nudged += 1;
  }

  return { checked: result.rows.length, nudged };
}

async function notifyOperator(
  userId: string,
  quoteNumber: string,
  day: NudgeDay,
  quoteId: string
): Promise<void> {
  const token = await notificationsService.getPushToken(userId);
  if (!token) return;
  await notificationsService.sendPushNotifications([
    {
      to: token,
      title: NUDGE_TITLE,
      body: operatorNudgeBody(quoteNumber, day),
      data: { type: 'quote_operator_nudge', quoteId, day },
      sound: 'default',
    },
  ]);
}
