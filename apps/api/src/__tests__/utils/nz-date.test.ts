import {
  aucklandDateParts,
  aucklandDueDate,
  aucklandPeriodKey,
  formatDate,
  formatNzDate,
} from '@bossboard/shared';

describe('Pacific/Auckland civil dates', () => {
  it('formats a date-only string as dd/mm/yyyy without shifting the day', () => {
    expect(formatNzDate('2026-04-05')).toBe('05/04/2026');
    expect(formatDate('2026-05-01')).toBe('01/05/2026');
  });

  it('uses NZDT before the 2026-04-05 fallback, where UTC+12 is still the previous day', () => {
    const instant = new Date('2026-04-04T11:30:00.000Z');
    expect(aucklandDateParts(instant)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(formatNzDate(instant)).toBe('05/04/2026');
    expect(aucklandPeriodKey(instant)).toBe('2026-04');
    expect(aucklandDueDate(instant, 20)).toBe('2026-04-25');
  });

  it('stays on 5 April after DST ends (a fixed UTC+13 offset would say 6 April)', () => {
    const instant = new Date('2026-04-05T11:30:00.000Z');
    expect(aucklandDateParts(instant)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(formatNzDate(instant)).toBe('05/04/2026');
    expect(aucklandDueDate(instant, 0)).toBe('2026-04-05');
  });

  it('uses NZST on the morning DST starts, 2026-09-27 01:30', () => {
    const instant = new Date('2026-09-26T13:30:00.000Z');
    expect(aucklandDateParts(instant)).toEqual({ year: 2026, month: 9, day: 27 });
    expect(formatNzDate(instant)).toBe('27/09/2026');
  });

  it('uses NZDT just after the spring-forward gap', () => {
    const instant = new Date('2026-09-26T14:30:00.000Z');
    expect(aucklandDateParts(instant)).toEqual({ year: 2026, month: 9, day: 27 });
    expect(formatNzDate(instant)).toBe('27/09/2026');
  });

  it('is 28 September 00:30 NZDT, which UTC+12 still calls 27 September', () => {
    const instant = new Date('2026-09-27T11:30:00.000Z');
    expect(aucklandDateParts(instant)).toEqual({ year: 2026, month: 9, day: 28 });
    expect(formatNzDate(instant)).toBe('28/09/2026');
    expect(aucklandPeriodKey(instant)).toBe('2026-09');
  });

  it('puts 2026-03-31T12:00:00Z in April, not March', () => {
    const instant = new Date('2026-03-31T12:00:00.000Z');
    expect(aucklandPeriodKey(instant)).toBe('2026-04');
    expect(formatNzDate(instant)).toBe('01/04/2026');
    expect(aucklandDueDate(instant, 14)).toBe('2026-04-15');
  });
});
