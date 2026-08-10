/**
 * Customer-facing invoice notes rules.
 *
 * Invoice `notes` appear on PDF, email, and share links — never use them for
 * internal scaffolding, system tests, or seed metadata.
 */

export const INVOICE_NOTES_CUSTOMER_FACING_HINT =
  'Shown on the customer PDF and email. Use payment thanks, terms, or bank reminders — not internal test notes.';

export const INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE =
  'Invoice notes go to the customer (PDF & email). Remove internal/test wording (e.g. “system test”, “review before send”, “Deskera”) or clear notes before saving/sending.';

/** Phrases that almost never belong on a client invoice. */
const INTERNAL_NOTE_PATTERNS: RegExp[] = [
  /\bsystem\s*test\b/i,
  /\bbossboard\s+system\b/i,
  /\breview\s+before\s+send\b/i,
  /\bdo\s+not\s+send\b/i,
  /\bdraft\s+for\b/i,
  /\bdeskera\b/i,
  /\binternal\s+only\b/i,
  /\bfor\s+testing\b/i,
  /\btest\s+invoice\b/i,
  /\bseed(ed)?\s+(data|invoice|note)\b/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bxxx+\b/i,
];

/**
 * True when notes look like internal scaffolding rather than client copy.
 * Empty/null notes are fine.
 */
export function looksLikeInternalInvoiceNotes(
  notes: string | null | undefined,
): boolean {
  const t = (notes || '').trim();
  if (!t) return false;
  return INTERNAL_NOTE_PATTERNS.some((re) => re.test(t));
}

/** Soft guidance for product UI / docs. */
export const INVOICE_NOTES_RULES = [
  'Notes are customer-facing (PDF, email, share link).',
  'Good: thank-you, payment terms, how to pay, bank reference, late fees.',
  'Bad: “system test”, “review before send”, seed/Deskera meta, TODO/FIXME.',
  'Internal markup uses Cost / Margin % fields — not notes.',
  'Prefer company template (Settings) or per-client notes over ad-hoc test text.',
] as const;
