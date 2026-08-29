/**
 * Quote P1.2 operator-nudge windows (pure schedule + copy).
 *
 * Operator-only chase: never client messaging. Windows are day 1 / 3 / 7
 * measured from sent_at. Cap 3 nudges.
 */

import {
  nextNudgeDay,
  isOperatorNudgeDue,
  operatorNudgeBody,
  NUDGE_TITLE,
} from '../../services/quoteOperatorNudge.js';

const SENT_AT = new Date('2026-08-01T08:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function hoursFromSent(hours: number): Date {
  return new Date(SENT_AT.getTime() + hours * 60 * 60 * 1000);
}

function daysFromSent(days: number): Date {
  return new Date(SENT_AT.getTime() + days * MS_PER_DAY);
}

function candidate(overrides: {
  status?: string;
  sent_at?: Date | string | null;
  operator_nudge_count?: number;
} = {}) {
  return {
    status: 'sent',
    sent_at: SENT_AT,
    operator_nudge_count: 0,
    ...overrides,
  };
}

describe('nextNudgeDay', () => {
  it('0 → 1', () => {
    expect(nextNudgeDay(0)).toBe(1);
  });

  it('1 → 3', () => {
    expect(nextNudgeDay(1)).toBe(3);
  });

  it('2 → 7', () => {
    expect(nextNudgeDay(2)).toBe(7);
  });

  it('3 → null', () => {
    expect(nextNudgeDay(3)).toBeNull();
  });
});

describe('isOperatorNudgeDue', () => {
  it('is not due without sent_at', () => {
    expect(isOperatorNudgeDue(candidate({ sent_at: null }), daysFromSent(2))).toBe(false);
  });

  it('is not due on draft', () => {
    expect(isOperatorNudgeDue(candidate({ status: 'draft' }), daysFromSent(2))).toBe(false);
  });

  it('is not due on accepted', () => {
    expect(
      isOperatorNudgeDue(candidate({ status: 'accepted' }), daysFromSent(2))
    ).toBe(false);
  });

  it('is not due on declined, expired, or converted', () => {
    expect(isOperatorNudgeDue(candidate({ status: 'declined' }), daysFromSent(2))).toBe(false);
    expect(isOperatorNudgeDue(candidate({ status: 'expired' }), daysFromSent(2))).toBe(false);
    expect(isOperatorNudgeDue(candidate({ status: 'converted' }), daysFromSent(2))).toBe(false);
  });

  it('day-1 is not open before 24h', () => {
    expect(isOperatorNudgeDue(candidate(), hoursFromSent(23))).toBe(false);
  });

  it('day-1 opens at 24h', () => {
    expect(isOperatorNudgeDue(candidate(), hoursFromSent(24))).toBe(true);
  });

  it('day-3 waits until day 3 after first nudge', () => {
    const afterFirst = candidate({ operator_nudge_count: 1 });
    expect(isOperatorNudgeDue(afterFirst, daysFromSent(2))).toBe(false);
    expect(isOperatorNudgeDue(afterFirst, daysFromSent(3))).toBe(true);
  });

  it('day-7 waits until day 7 after second nudge', () => {
    const afterSecond = candidate({ operator_nudge_count: 2 });
    expect(isOperatorNudgeDue(afterSecond, daysFromSent(6))).toBe(false);
    expect(isOperatorNudgeDue(afterSecond, daysFromSent(7))).toBe(true);
  });

  it('is never due after the third nudge', () => {
    expect(
      isOperatorNudgeDue(candidate({ operator_nudge_count: 3 }), daysFromSent(30))
    ).toBe(false);
  });
});

describe('operatorNudgeBody', () => {
  it('day 1 is Follow up on quote {quoteNumber}?', () => {
    expect(operatorNudgeBody(1, 'QTE-0042')).toBe('Follow up on quote QTE-0042?');
  });

  it('day 3 contains still open', () => {
    expect(operatorNudgeBody(3, 'QTE-0042')).toMatch(/still open/i);
  });

  it('day 7 contains Last reminder', () => {
    expect(operatorNudgeBody(7, 'QTE-0042')).toMatch(/Last reminder/);
  });

  it('is operator follow-up copy, not a client chase claim', () => {
    const copy = [1, 3, 7]
      .map((day) => operatorNudgeBody(day as 1 | 3 | 7, 'QTE-0001'))
      .concat(NUDGE_TITLE)
      .join(' ')
      .toLowerCase();

    expect(copy).not.toMatch(/client/);
    expect(copy).not.toMatch(/sms/);
    expect(copy).not.toMatch(/email/);
    expect(copy).not.toMatch(/win rate/);
  });
});
