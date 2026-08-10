/**
 * @bossboard/shared
 * Shared types, theme, and utilities for BossBoard.
 */

// Types
export * from './types/index.js';

// Theme
export { colors, getStatusColor, getCategoryColor } from './theme/colors.js';
export type { ColorKey } from './theme/colors.js';

// Utils
export { formatCurrency, formatDate, formatDateTime, formatElapsedTime } from './utils/format.js';
export {
  sellAmountFromCostMargin,
  marginAmountCents,
  marginPercentFromCostSell,
  computeInvoiceProfit,
  normalizePricedLineItem,
} from './utils/pricing.js';
export type { PricedLineLike, InvoiceProfitSummary } from './utils/pricing.js';
export {
  looksLikeInternalInvoiceNotes,
  INVOICE_NOTES_CUSTOMER_FACING_HINT,
  INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
  INVOICE_NOTES_RULES,
} from './utils/invoice-notes.js';
