/**
 * PostgreSQL INTEGER max is 2_147_483_647.
 * invoices.calculateTotals sets gst = Math.round(taxable * 0.15) and
 * total = taxable + gst. 1_867_377_084 is the largest integer cents where
 * that total still fits:
 * 1_867_377_084 + Math.round(1_867_377_084 * 0.15) === 2_147_483_647.
 * One cent more overflows invoices.total and the INSERT returns 500.
 */
export const MAX_INVOICE_LINE_AMOUNT_CENTS = 1_867_377_084;

const CAP = BigInt(MAX_INVOICE_LINE_AMOUNT_CENTS);

/** True when unitPrice * quantity cannot fit in invoices.total after 15% GST. */
export function lineProductExceedsInvoiceCap(unitPrice: number, quantity: number): boolean {
  return BigInt(unitPrice) * BigInt(quantity) > CAP;
}

/** True when the sum of line totals cannot fit in invoices.total after 15% GST. */
export function sumExceedsInvoiceCap(amounts: number[]): boolean {
  let sum = 0n;
  for (const amount of amounts) {
    sum += BigInt(amount);
    if (sum > CAP) return true;
  }
  return false;
}
