/**
 * Quote P1.2 operator-nudge schedule (pure).
 *
 * Windows are day 1, then day 3, then day 7 measured from sent_at.
 * Cap 3 nudges. Operator-only copy — never a client chase claim.
 */

export const NUDGE_TITLE = 'Quote follow-up';

export const NUDGE_DAYS = [1, 3, 7] as const;
export type NudgeDay = (typeof NUDGE_DAYS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OperatorNudgeCandidate {
  status: string;
  sent_at: Date | string | null;
  operator_nudge_count: number;
}

export function nextNudgeDay(operatorNudgeCount: number): NudgeDay | null {
  if (operatorNudgeCount === 0) return 1;
  if (operatorNudgeCount === 1) return 3;
  if (operatorNudgeCount === 2) return 7;
  return null;
}

function parseSentAt(sentAt: Date | string | null): Date | null {
  if (sentAt == null) return null;
  const date = sentAt instanceof Date ? sentAt : new Date(sentAt);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isOperatorNudgeDue(
  quote: OperatorNudgeCandidate,
  now: Date = new Date()
): boolean {
  if (quote.status !== 'sent') return false;

  const sentAt = parseSentAt(quote.sent_at);
  if (!sentAt) return false;

  const day = nextNudgeDay(Number(quote.operator_nudge_count) || 0);
  if (day == null) return false;

  return now.getTime() - sentAt.getTime() >= day * MS_PER_DAY;
}

export function operatorNudgeBody(day: NudgeDay, quoteNumber: string): string {
  if (day === 1) return `Follow up on quote ${quoteNumber}?`;
  if (day === 3) return `Quote ${quoteNumber} is still open — follow up?`;
  return `Last reminder: follow up on quote ${quoteNumber}`;
}
