/**
 * Shared formatting utilities for BossBoard
 * Used by API (PDF generation), mobile, and web.
 */

/**
 * Format cents to NZD currency string.
 * Example: 15000 → "$150.00"
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format an ISO date string or Date to a human-readable NZ date.
 * Example: "2026-03-21T14:30:00Z" → "21 Mar 2026" in Pacific/Auckland.
 * This follows the instant's local calendar day. A bare `YYYY-MM-DD` due date
 * is not an instant — use `formatCalendarDate` for that.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `dmy` is DD/MM/YYYY. `long` is "25 October 2026". `short` is "25 Oct 2026". `medium` zero-pads the day. */
export type CalendarDateStyle = 'dmy' | 'long' | 'short' | 'medium';

function calendarParts(
  value: string | Date | null | undefined,
): { year: number; month: number; day: number } | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return validCalendarParts(year, month, day);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  return validCalendarParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Reject 31 Feb and other overflows. UTC parts are only the validity check. */
function validCalendarParts(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Format a calendar date with no timezone shift.
 *
 * A bare `YYYY-MM-DD` is that calendar day in every timezone. `new Date('YYYY-MM-DD')`
 * is UTC midnight, so local getters print the previous day west of UTC
 * (America/Los_Angeles shows 24/10/2026 for `2026-10-25`).
 *
 * A Date is read with local year/month/day. node-pg parses SQL DATE as local
 * midnight, so those parts are the stored day. Instants (`created_at`, `paid_at`)
 * stay on `formatDate`.
 */
export function formatCalendarDate(
  value: string | Date | null | undefined,
  style: CalendarDateStyle = 'short',
): string {
  const parts = calendarParts(value);
  if (!parts) return '';
  const { year, month, day } = parts;
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  if (style === 'dmy') return `${dd}/${mm}/${year}`;
  if (style === 'long') return `${day} ${MONTHS_LONG[month - 1]} ${year}`;
  if (style === 'medium') return `${dd} ${MONTHS_SHORT[month - 1]} ${year}`;
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/**
 * Format an ISO datetime to a human-readable NZ datetime.
 * Example: "2026-03-21T14:30:00Z" → "21 Mar 2026, 2:30 PM"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format elapsed time in seconds to "Xh Ym" or "Ym".
 */
export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
