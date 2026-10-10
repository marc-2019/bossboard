/**
 * Shared formatting utilities for BossBoard
 * Used by API (PDF generation), mobile, and web.
 */

import { NZ_TIME_ZONE, formatNzDate } from './nz-date.js';

/**
 * Format cents to NZD currency string.
 * Example: 15000 → "$150.00"
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format an ISO date string or Date as dd/mm/yyyy in Pacific/Auckland.
 * Example: "2026-03-21" → "21/03/2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  return formatNzDate(date);
}

/**
 * Format an ISO datetime in Pacific/Auckland.
 * Example: "2026-03-21T14:30:00Z" → "22/03/2026, 3:30 am" during NZDT (UTC+13).
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NZ', {
    timeZone: NZ_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
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
