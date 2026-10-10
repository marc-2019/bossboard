/**
 * Civil dates in Pacific/Auckland.
 * The IANA zone includes NZ DST. Do not substitute a fixed UTC+12 or UTC+13 offset.
 */

export const NZ_TIME_ZONE = 'Pacific/Auckland';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export function aucklandDateParts(instant: Date): CivilDate {
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Invalid date');
  }
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const num = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Missing ${type} in Auckland date parts`);
    }
    return Number(value);
  };
  return { year: num('year'), month: num('month'), day: num('day') };
}

export function formatIsoDate(date: CivilDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

/**
 * dd/mm/yyyy. A YYYY-MM-DD string is a civil date and is not reinterpreted as an instant.
 * Instants (Date or ISO datetime) are formatted in Pacific/Auckland.
 */
export function formatNzDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    const dateOnly = DATE_ONLY.exec(value.trim());
    if (dateOnly) {
      return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    }
  }
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return '';
  const { year, month, day } = aucklandDateParts(instant);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return `${dd}/${mm}/${year}`;
}

/** Days in a civil month. `month` is 1-12. Uses UTC calendar math, not a local offset. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** Auckland calendar month YYYY-MM. This is the recurring template period key. */
export function aucklandPeriodKey(instant: Date): string {
  const { year, month } = aucklandDateParts(instant);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** YYYY-MM-DD due date, `paymentTermsDays` calendar days after the Auckland civil date. */
export function aucklandDueDate(instant: Date, paymentTermsDays: number): string {
  return formatIsoDate(addCalendarDays(aucklandDateParts(instant), paymentTermsDays));
}
