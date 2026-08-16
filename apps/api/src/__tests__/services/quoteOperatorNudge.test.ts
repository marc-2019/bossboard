import {
  isOperatorNudgeDue,
  nextNudgeDay,
  operatorNudgeBody,
  NUDGE_TITLE,
} from '../../services/quoteOperatorNudge.js';

const sent = new Date('2026-08-01T00:00:00.000Z');

function nowAfterDays(days: number): Date {
  return new Date(sent.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('nextNudgeDay',
  () => {
    it('starts at day 1',
      () => {
        expect(nextNudgeDay(0)).toBe(1);
      });
    it('then day 3',
      () => {
        expect(nextNudgeDay(1)).toBe(3);
      });
    it('then day 7',
      () => {
        expect(nextNudgeDay(2)).toBe(7);
      });
    it('stops after three nudges',
      () => {
        expect(nextNudgeDay(3)).toBeNull();
      });
  });

describe('isOperatorNudgeDue',
  () => {
    it('is not due without sent_at',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: null, nudgeCount: 0, now: nowAfterDays(2) })
        ).toEqual({ due: false, day: null });
      });
    it('is not due on draft',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'draft', sentAt: sent, nudgeCount: 0, now: nowAfterDays(2) })
        ).toEqual({ due: false, day: null });
      });
    it('is not due on accepted',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'accepted', sentAt: sent, nudgeCount: 0, now: nowAfterDays(2) })
        ).toEqual({ due: false, day: null });
      });
    it('day-1 window opens at 24h',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 0, now: nowAfterDays(0.5) })
        ).toEqual({ due: false, day: 1 });
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 0, now: nowAfterDays(1) })
        ).toEqual({ due: true, day: 1 });
      });
    it('day-3 window waits until day 3 after first nudge',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 1, now: nowAfterDays(2) })
        ).toEqual({ due: false, day: 3 });
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 1, now: nowAfterDays(3) })
        ).toEqual({ due: true, day: 3 });
      });
    it('day-7 window waits until day 7 after second nudge',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 2, now: nowAfterDays(6) })
        ).toEqual({ due: false, day: 7 });
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 2, now: nowAfterDays(7) })
        ).toEqual({ due: true, day: 7 });
      });
    it('never due after the third nudge',
      () => {
        expect(
          isOperatorNudgeDue({ status: 'sent', sentAt: sent, nudgeCount: 3, now: nowAfterDays(30) })
        ).toEqual({ due: false, day: null });
      });
  });

describe('operatorNudgeBody',
  () => {
    it('is operator follow-up copy, not a client chase claim',
      () => {
        expect(NUDGE_TITLE).toBe('Quote follow-up');
        expect(operatorNudgeBody('QTE-0001', 1)).toBe('Follow up on quote QTE-0001?');
        expect(operatorNudgeBody('QTE-0001', 3)).toMatch(/still open/i);
        expect(operatorNudgeBody('QTE-0001', 7)).toMatch(/Last reminder/i);
        expect(operatorNudgeBody('QTE-0001', 1)).not.toMatch(/client|sms|email|win rate/i);
      });
  });
