/**
 * Service-layer backstop for customer-facing invoice notes.
 * Route handlers reject the same text; generate and other service callers
 * must not be able to persist it onto invoices.notes.
 */

import { createError } from '../middleware/error.js';
import {
  INTERNAL_MEMO_MAX_LENGTH,
  INTERNAL_MEMO_TOO_LONG_MESSAGE,
  INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
  looksLikeInternalInvoiceNotes,
} from '../types/index.js';

export function assertCustomerFacingInvoiceNotes(
  notes: string | null | undefined,
): void {
  if (!looksLikeInternalInvoiceNotes(notes)) return;
  throw createError(
    INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
    400,
    'NOTES_NOT_CUSTOMER_READY',
  );
}

/** Reject a staff memo that exceeds the column and API cap. Null clears it. */
export function assertInternalMemoLength(
  memo: string | null | undefined,
): void {
  if (memo == null) return;
  if (memo.length <= INTERNAL_MEMO_MAX_LENGTH) return;
  throw createError(
    INTERNAL_MEMO_TOO_LONG_MESSAGE,
    400,
    'INTERNAL_MEMO_TOO_LONG',
  );
}
