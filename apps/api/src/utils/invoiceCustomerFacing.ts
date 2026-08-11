/**
 * Customer-facing invoice status labels.
 *
 * Tradie workflow statuses (draft, sent) must not appear on PDFs, share links,
 * or other client-visible surfaces — they look unfinished / confusing.
 * Only statuses that matter to the customer are shown.
 */

/** Statuses safe to show a customer. Returns null when the label should be omitted. */
export function customerFacingInvoiceStatus(
  status: string | null | undefined
): 'PAID' | 'OVERDUE' | null {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (s === 'paid') return 'PAID';
  if (s === 'overdue') return 'OVERDUE';
  // draft | sent | unknown → hide from customer
  return null;
}
