/**
 * PostgreSQL INTEGER max is 2_147_483_647.
 * invoices.calculateTotals sets gst = Math.round(taxable * 0.15) and
 * total = taxable + gst. 1_867_377_084 is the largest integer cents where
 * that total still fits:
 * 1_867_377_084 + Math.round(1_867_377_084 * 0.15) === 2_147_483_647.
 * One cent more overflows invoices.total and the INSERT returns 500.
 */
export const MAX_INVOICE_LINE_AMOUNT_CENTS = 1_867_377_084;
