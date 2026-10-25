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
  /** Extra reference shown under how-to-pay (for example a payment reference). */
  paymentReference?: string | null;
  /**
   * When true, the due sentence says the invoice is overdue.
   * Callers can also leave this false and pass `asOf` so a past due date
   * selects the overdue sentence.
   */
  overdue?: boolean;
  /**
   * Calendar "today" used only to decide overdue wording when `overdue` is
   * not already true. Defaults to the current UTC date. Does not appear in
   * the message.
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
  paymentReference?: string | null;
  payment_reference?: string | null;
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

/**
 * Single-line field sanitiser.
 * Strips control characters (header injection), angle brackets (HTML tags),
 * and encrypted `enc:v1:` blobs so ciphertext is never pasted into a customer message.
 */
export function sanitizeReminderField(value: unknown, max = FIELD_MAX): string {
  if (value == null) return '';
  let s = String(value);
  if (s.startsWith('enc:v1:')) return '';
  s = s
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) s = s.slice(0, max).trim();
  return s;
}

/** Plain-text body. Keeps intentional newlines. Strips CR and HTML brackets. */
export function sanitizeReminderBody(body: string): string {
  return String(body ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
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

/** Calendar date as YYYY-MM-DD in UTC, or null when the value is not a real date. */
export function reminderCalendarKey(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return calendarKeyFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
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

function safeEmailAddress(value: string | null | undefined): string | null {
  const s = sanitizeReminderField(value, 254);
  if (!s) return null;
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s)) return null;
  return s;
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
  const asOfKey = reminderCalendarKey(input.asOf ?? null) ?? new Date().toISOString().slice(0, 10);
  const pastDue = Boolean(dueKey && dueKey < asOfKey);
  const overdue = input.overdue === true || pastDue;
  const reference = sanitizeReminderField(input.paymentReference);

  const invoiceLabel = invoiceRef ? `invoice ${invoiceRef}` : 'your invoice';
  const amountLabel = amount ? ` for ${amount}` : '';

  let dueSentence: string;
  if (overdue && due) {
    dueSentence = `${capitalise(invoiceLabel)}${amountLabel} was due on ${due} and is still unpaid.`;
  } else if (overdue) {
    dueSentence = `${capitalise(invoiceLabel)}${amountLabel} is overdue and still unpaid.`;
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
  const link = safePaymentUrl(input.paymentLinkUrl);
  if (link) payLines.push(`Pay online: ${link}`);
  if (reference) payLines.push(`Payment reference: ${reference}`);

  const payBlock = payLines.length
    ? ['How to pay:', ...payLines].join('\n')
    : 'If you need our payment details, reply to this note and we will send them through.';

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

export function politeReminderFromInvoice(
  invoice: PoliteReminderInvoiceLike,
  options?: { asOf?: string | Date | null },
): PolitePaymentReminder {
  const status = String(invoice.status ?? '').toLowerCase();
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
    paymentReference: firstDefined(invoice.paymentReference, invoice.payment_reference) ?? null,
    overdue: status === 'overdue',
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
 * Recipient is included only when it is a single plain address (no header breaks).
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
