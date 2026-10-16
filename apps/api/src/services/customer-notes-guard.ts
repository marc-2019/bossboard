/**
 * Service-layer backstop for customer-facing invoice notes.
 * Route handlers reject the same text; generate and other service callers
 * must not be able to persist it onto invoices.notes.
 */

import { createError } from '../middleware/error.js';
import {
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
