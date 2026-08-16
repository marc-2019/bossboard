/**
 * P1.2 operator quote nudge windows.
 * Operator-only. Never emails or SMS the client.
 */

export const NUDGE_DAYS = [1, 3, 7] as const;
export type NudgeDay = (typeof NUDGE_DAYS)[number];

export const NUDGE_TITLE = 'Quote follow-up';

export function nextNudgeDay(nudgeCount: number): NudgeDay | null {
  if (nudgeCount <= 0) return 1;
  if (nudgeCount === 1) return 3;
  if (nudgeCount === 2) return 7;
  return null;
}

export function operatorNudgeBody(quoteNumber: string, day: NudgeDay): string {
  if (day === 1) return `Follow up on quote ${quoteNumber}?`;
  if (day === 3) return `Quote ${quoteNumber} is still open. Follow up when you can.`;
  return `Last reminder to follow up on quote ${quoteNumber}.`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isOperatorNudgeDue(input: {
  status: string;
  sentAt: Date | string | null;
  nudgeCount: number;
  now: Date;
}): { due: boolean; day: NudgeDay | null } {
  if (input.status !== 'sent') return { due: false, day: null };
  const sent = asDate(input.sentAt);
  if (!sent) return { due: false, day: null };
  const day = nextNudgeDay(input.nudgeCount);
  if (!day) return { due: false, day: null };
  const elapsedDays = (input.now.getTime() - sent.getTime()) / MS_PER_DAY;
  if (elapsedDays < day) return { due: false, day };
  return { due: true, day };
}
