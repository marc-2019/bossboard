/**
 * NZ GST invoice helper math (15%).
 * Governance: layout/helper only — not tax advice or IRD certification.
 */

export const NZ_GST_RATE = 0.15;

export interface GstLineInput {
  description: string;
  /** dollars (not cents) for the simple web tool */
  amountDollars: number;
}

export interface GstInvoiceTotals {
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  includeGst: boolean;
}

/** Parse user dollar input safely */
export function parseDollars(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatNzdFromCents(cents: number): string {
  return (cents / 100).toLocaleString('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  });
}

/**
 * When includeGst is true, amounts are exclusive of GST and GST is added (standard tax invoice style).
 */
export function computeGstTotals(
  lines: GstLineInput[],
  includeGst: boolean
): GstInvoiceTotals {
  const subtotalCents = lines.reduce(
    (sum, l) => sum + dollarsToCents(Math.max(0, l.amountDollars || 0)),
    0
  );
  const gstCents = includeGst ? Math.round(subtotalCents * NZ_GST_RATE) : 0;
  return {
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
    includeGst,
  };
}

export const GST_TOOL_DISCLAIMER =
  'This is a simple NZ 15% GST calculator and invoice layout helper for drafting. ' +
  'It is not tax advice, not an IRD-approved form, and does not guarantee a valid tax invoice for your situation. ' +
  'Confirm GST registration and invoice rules for your business. For SWMS, quotes and saved invoices, use BossBoard.';
