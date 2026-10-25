/**
 * Polite payment reminder copy for unpaid invoices.
 *
 * Pure function: no I/O and no logging (the inputs are customer PII).
 * Every interpolated field is sanitised so the result cannot carry HTML tags
 * or email-header breaks (CR/LF and other control characters).
 *
 * BossBoard has no separate "task" model. Unpaid payment work is an invoice
 * with status `sent` or `overdue`.
 */

export interface PolitePaymentReminderInput {
  customerName?: string | null;
  /** Outstanding amount in cents. */
  amountCents?: number | null;
  invoiceNumber?: string | null;
  /** Calendar date (`YYYY-MM-DD`), ISO datetime, or Date. */
  dueDate?: string | Date | null;
  businessName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  intlIban?: string | null;
  intlSwiftBic?: string | null;
  intlBankName?: string | null;
  paymentLinkUrl?: string | null;
  /**
   * Calendar "today" used to decide whether the due date is already past.
   * Does not appear in the message. Users have no stored timezone: pass the
   * device-local calendar date (`reminderLocalCalendarKey`). If omitted, the
   * runtime's local calendar date is used. On a UTC server that can be a day
   * off from Pacific/Auckland around midnight.
   */
  asOf?: string | Date | null;
}

export interface PolitePaymentReminder {
  subject: string;
  body: string;
}

/** Invoice-shaped record. Accepts the web camelCase payload and the mobile snake_case payload. */
export interface PoliteReminderInvoiceLike {
  clientName?: string | null;
  client_name?: string | null;
  clientEmail?: string | null;
  client_email?: string | null;
  total?: number | null;
  invoiceNumber?: string | null;
  invoice_number?: string | null;
  dueDate?: string | Date | null;
  due_date?: string | Date | null;
  companyName?: string | null;
  company_name?: string | null;
  bankAccountName?: string | null;
  bank_account_name?: string | null;
  bankAccountNumber?: string | null;
  bank_account_number?: string | null;
  intlIban?: string | null;
  intl_iban?: string | null;
  intlSwiftBic?: string | null;
  intl_swift_bic?: string | null;
  intlBankName?: string | null;
  intl_bank_name?: string | null;
  paymentLinkUrl?: string | null;
  payment_link_url?: string | null;
  status?: string | null;
}

const FIELD_MAX = 200;
const SUBJECT_MAX = 180;
const URL_MAX = 500;
const BODY_MAX = 4000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Unpaid invoices are the payment "tasks" this reminder applies to. */
export function isUnpaidInvoiceStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  return s === 'sent' || s === 'overdue';
}

/** C0, DEL, C1 (includes U+0085 NEXT LINE), and Unicode line separators. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;
/**
 * Invisible / format characters that must not hide `enc:v1:` or split a field.
 * Includes the soft hyphen (U+00AD), combining grapheme joiner (U+034F),
 * Arabic letter mark (U+061C), Mongolian free variation selector (U+180B),
 * Mongolian vowel separator (U+180E), inhibit symmetric swapping (U+206A),
 * and variation selector-16 (U+FE0F).
 */
const INVISIBLE_CHARS = /[\u00AD\u034F\u061C\u180B\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206A\uFE0F\uFEFF]/g;

/**
 * Single-line field sanitiser.
 * Trim, then strip control characters, then drop the field if `enc:v1:`
 * appears anywhere in what remains. Also strips angle brackets.
 */
export function sanitizeReminderField(value: unknown, max = FIELD_MAX): string {
  if (value == null) return '';
  let s = String(value).trim();
  s = s.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '');
  s = s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (s.toLowerCase().includes('enc:v1:')) return '';
  if (s.length > max) s = s.slice(0, max).trim();
  return s;
}

/** Plain-text body. Keeps intentional newlines. Strips other controls, including C1. */
export function sanitizeReminderBody(body: string): string {
  return String(body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/[<>]/g, '')
    .slice(0, BODY_MAX);
}

export function sanitizeReminderSubject(subject: string): string {
  return sanitizeReminderField(subject, SUBJECT_MAX);
}

function coerceCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function formatNzd(cents: number | null | undefined): string | null {
  const rounded = coerceCents(cents);
  if (rounded == null || !Number.isSafeInteger(rounded) || rounded < 0) return null;
  const sign = '';
  const abs = rounded;
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}NZ$${dollars}.${String(rem).padStart(2, '0')}`;
}

function calendarKeyFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calendar date of `now` in the runtime's local timezone.
 * BossBoard does not store an owner timezone. The mobile and web apps run
 * this on the tradie's device, so the local date is theirs. A UTC server
 * that omits `asOf` can be a day away from Pacific/Auckland around midnight.
 */
export function reminderLocalCalendarKey(now: Date = new Date()): string {
  return (
    calendarKeyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()) ??
    now.toISOString().slice(0, 10)
  );
}

/**
 * Calendar date as YYYY-MM-DD.
 * A `YYYY-MM-DD` string is that calendar date (invoice `due_date` is a SQL DATE).
 * A Date is read with local year/month/day. node-pg parses DATE as local
 * midnight, not UTC midnight — UTC parts would turn 2026-10-25 into
 * 2026-10-24 in Pacific/Auckland (local midnight is 2026-10-24T11:00Z).
 * An ISO datetime string uses the calendar date written before `T`.
 * Callers should pass `YYYY-MM-DD` for due dates; the invoice mapper does.
 */
export function reminderCalendarKey(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return calendarKeyFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const raw = sanitizeReminderField(value, 40);
  if (!raw) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return calendarKeyFromParts(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T/.exec(raw);
  if (iso) {
    return calendarKeyFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  return null;
}

function formatCalendarKey(key: string | null): string | null {
  if (!key) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function safePaymentUrl(value: string | null | undefined): string | null {
  const raw = sanitizeReminderField(value, URL_MAX);
  if (!raw) return null;
  // One token only. Spaces (including ones collapsed from CR/LF) and encoded
  // line breaks would let a "URL" smuggle a second header into the message.
  if (!/^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(raw)) return null;
  if (/%0d|%0a/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.origin === 'null') return null;
  const href = url.href;
  if (/[\r\n<>\s]/.test(href) || /%0d|%0a/i.test(href) || href.length > URL_MAX) return null;
  return href;
}

const MAILBOX_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Single mailbox for a mailto `To` header. The address is inserted raw, so
 * `%` is not allowed: a client decodes `%0D%0A` / `%3A` into a new header.
 * Sync stores `client_email` as a free string, so this check is the gate
 * for that value too. Reject anything whose decode contains CR, LF, or
 * `:`, `,`, `;`.
 *
 * Validate the trimmed address before stripping controls or invisible
 * characters. `user@example.com\u0000.attacker.com` (NUL or U+200B) would
 * otherwise collapse into the different mailbox `user@example.com.attacker.com`.
 */
function safeEmailAddress(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > 254 || raw.includes('%')) return null;
  if (!MAILBOX_RE.test(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (/[\r\n:;,]/u.test(raw) || /[\r\n:;,]/u.test(decoded)) return null;
  if (!MAILBOX_RE.test(decoded)) return null;
  return raw;
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstDefined<T>(...values: (T | null | undefined)[]): T | null | undefined {
  for (const value of values) {
    if (value != null && value !== '') return value;
  }
  return values.length > 0 ? values[values.length - 1] : undefined;
}

export function buildPolitePaymentReminder(input: PolitePaymentReminderInput): PolitePaymentReminder {
  const customer = sanitizeReminderField(input.customerName) || 'there';
  const business = sanitizeReminderField(input.businessName);
  const invoiceRef = sanitizeReminderField(input.invoiceNumber);
  const amount = formatNzd(input.amountCents);
  const dueKey = reminderCalendarKey(input.dueDate ?? null);
  const due = formatCalendarKey(dueKey);
  const asOfKey = resolveAsOfKey(input.asOf);
  // Wording follows the calendar date only. A status of "overdue" with a
  // future due date must not say the invoice "was due".
  const pastDue = Boolean(dueKey && dueKey < asOfKey);

  const invoiceLabel = invoiceRef ? `invoice ${invoiceRef}` : 'your invoice';
  const amountLabel = amount ? ` for ${amount}` : '';

  let dueSentence: string;
  if (pastDue && due) {
    dueSentence = `${capitalise(invoiceLabel)}${amountLabel} was due on ${due} and is still unpaid.`;
  } else if (due) {
    dueSentence = `${capitalise(invoiceLabel)}${amountLabel} is still outstanding (due ${due}).`;
  } else {
    dueSentence = `${capitalise(invoiceLabel)}${amountLabel} is still outstanding.`;
  }

  const payLines: string[] = [];
  const bankName = sanitizeReminderField(input.bankAccountName);
  const bankNumber = sanitizeReminderField(input.bankAccountNumber);
  if (bankName) payLines.push(`Account name: ${bankName}`);
  if (bankNumber) payLines.push(`Account number: ${bankNumber}`);
  const iban = sanitizeReminderField(input.intlIban);
  const swift = sanitizeReminderField(input.intlSwiftBic);
  const intlBank = sanitizeReminderField(input.intlBankName);
  if (iban) payLines.push(`IBAN: ${iban}`);
  if (swift) payLines.push(`SWIFT/BIC: ${swift}`);
  if (intlBank) payLines.push(`Bank: ${intlBank}`);
  // Customer pay link (may be a Stripe Checkout URL that contains cs_).
  // That URL is the way the customer pays, so it is included on purpose.
  // Stripe payment_intent / session ids that are not this URL are never copied.
  const link = safePaymentUrl(input.paymentLinkUrl);
  if (link) payLines.push(`Pay online: ${link}`);

  const howToPay = payLines.length
    ? ['How to pay:', ...payLines].join('\n')
    : 'If you need our payment details, reply to this note and we will send them through.';
  // The reference the customer should quote is the invoice number.
  // payment_reference on the invoice is a Stripe pi_ / cs_ id and is never copied.
  const payBlock = invoiceRef
    ? `${howToPay}\nPayment reference: ${invoiceRef}`
    : howToPay;

  const signoff = business || 'us';
  const subject = sanitizeReminderSubject(
    invoiceRef ? `Friendly reminder: invoice ${invoiceRef}` : 'Friendly reminder about your invoice',
  );

  const body = [
    `Hi ${customer},`,
    '',
    'Hope you are well. This is a friendly reminder — no problem if you have already taken care of it.',
    '',
    dueSentence,
    '',
    'If you have already paid, thank you, and please ignore this note. Otherwise we would really appreciate payment when you have a moment.',
    '',
    payBlock,
    '',
    'Thanks,',
    signoff,
  ].join('\n');

  return { subject, body: sanitizeReminderBody(body) };
}

function resolveAsOfKey(asOf: string | Date | null | undefined): string {
  if (asOf instanceof Date) return reminderLocalCalendarKey(asOf);
  const parsed = reminderCalendarKey(asOf ?? null);
  return parsed ?? reminderLocalCalendarKey();
}

export function politeReminderFromInvoice(
  invoice: PoliteReminderInvoiceLike,
  options?: { asOf?: string | Date | null },
): PolitePaymentReminder {
  // Intentionally ignores notes, internal memos, client email, and
  // payment_reference / paymentReference (Stripe pi_ / cs_ ids).
  return buildPolitePaymentReminder({
    customerName: firstDefined(invoice.clientName, invoice.client_name) ?? null,
    amountCents: invoice.total,
    invoiceNumber: firstDefined(invoice.invoiceNumber, invoice.invoice_number) ?? null,
    dueDate: firstDefined(invoice.dueDate, invoice.due_date) ?? null,
    businessName: firstDefined(invoice.companyName, invoice.company_name) ?? null,
    bankAccountName: firstDefined(invoice.bankAccountName, invoice.bank_account_name) ?? null,
    bankAccountNumber: firstDefined(invoice.bankAccountNumber, invoice.bank_account_number) ?? null,
    intlIban: firstDefined(invoice.intlIban, invoice.intl_iban) ?? null,
    intlSwiftBic: firstDefined(invoice.intlSwiftBic, invoice.intl_swift_bic) ?? null,
    intlBankName: firstDefined(invoice.intlBankName, invoice.intl_bank_name) ?? null,
    paymentLinkUrl: firstDefined(invoice.paymentLinkUrl, invoice.payment_link_url) ?? null,
    asOf: options?.asOf,
  });
}

/** Clipboard text. Subject is forced onto one line so a pasted draft cannot add headers. */
export function formatPoliteReminderClipboard(subject: string, body: string): string {
  const safeSubject =
    sanitizeReminderSubject(subject) || 'Friendly reminder about your invoice';
  const safeBody = sanitizeReminderBody(body);
  return `Subject: ${safeSubject}\n\n${safeBody}`;
}

/**
 * mailto URL. Does not send mail — the user's mail app opens a draft.
 * Recipient is included only when it is a single plain address. `%0D%0A` and
 * other encoded header breaks are dropped, including a `client_email` that
 * sync stored without an email schema.
 */
export function buildPoliteReminderMailto(opts: {
  to?: string | null;
  subject: string;
  body: string;
}): string {
  const subject =
    sanitizeReminderSubject(opts.subject) || 'Friendly reminder about your invoice';
  const body = sanitizeReminderBody(opts.body);
  const to = safeEmailAddress(opts.to);
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return to ? `mailto:${to}?${query}` : `mailto:?${query}`;
}
