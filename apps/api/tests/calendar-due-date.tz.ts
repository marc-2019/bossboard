/**
 * Child process for calendar due-date formatting.
 * TZ must be set before this process starts. Jest cannot change it in-process.
 */
import zlib from 'node:zlib';
import { generateInvoicePDF } from '../src/services/pdf.js';
import { sendInvoiceEmail } from '../src/services/email.js';
import { clearCapturedEmails, getCapturedEmails } from '../src/services/mocks/resend-mock.js';
import { renderInvoicePage } from '../src/routes/public.js';
import type { Invoice } from '../src/types/index.js';

const DUE = '2026-10-25';
const DUE_DMY = '25/10/2026';
const PREVIOUS_DMY = '24/10/2026';
const DUE_LONG = '25 October 2026';
const PREVIOUS_LONG = '24 October 2026';

/** PDFKit writes WinAnsi text as hex TJ operands, split by kerning. */
function pdfToText(buf: Buffer): string {
  const latin = buf.toString('latin1');
  const chunks: string[] = [];
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    let raw = Buffer.from(latin.slice(start, end), 'latin1');
    if (raw.length > 0 && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -1);
    if (raw.length > 0 && raw[raw.length - 1] === 0x0d) raw = raw.subarray(0, -1);
    let stream: string;
    try {
      stream = zlib.inflateSync(raw).toString('latin1');
    } catch {
      continue;
    }
    const glyphs: string[] = [];
    const hex = /<([0-9A-Fa-f]+)>/g;
    let glyph: RegExpExecArray | null;
    while ((glyph = hex.exec(stream))) {
      glyphs.push(Buffer.from(glyph[1], 'hex').toString('latin1'));
    }
    chunks.push(glyphs.join(''));
  }
  return chunks.join('\n');
}

function makeInvoice(): Invoice {
  const createdAt = new Date('2026-10-25T00:00:00.000Z');
  return {
    id: 'inv-tz',
    userId: 'user-tz',
    invoiceNumber: 'INV-TZ',
    clientName: 'Sam',
    clientEmail: 'sam@example.com',
    clientPhone: null,
    swmsId: null,
    jobDescription: 'Calendar date check',
    lineItems: [{ id: 'li-1', description: 'Labour', amount: 1000 }],
    subtotal: 1000,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    discountLabel: null,
    gstAmount: 150,
    total: 1150,
    status: 'sent',
    dueDate: DUE,
    paidAt: null,
    bankAccountName: null,
    bankAccountNumber: null,
    notes: null,
    internalMemo: null,
    customerId: null,
    recurringInvoiceId: null,
    includeGst: true,
    intlBankAccountName: null,
    intlIban: null,
    intlSwiftBic: null,
    intlBankName: null,
    intlBankAddress: null,
    companyName: 'North Build',
    companyAddress: null,
    irdNumber: null,
    gstNumber: null,
    shareToken: null,
    paymentProvider: null,
    paymentReference: null,
    paymentLinkUrl: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

async function main(): Promise<void> {
  const invoice = makeInvoice();
  const pdf = await generateInvoicePDF(invoice);
  const pdfText = pdfToText(pdf);

  clearCapturedEmails();
  await sendInvoiceEmail(invoice, Buffer.from('%PDF'), 'sam@example.com', 'North Build');
  const mail = getCapturedEmails()[0];
  if (!mail?.html || !mail.text) {
    throw new Error('invoice email was not captured');
  }

  const page = renderInvoicePage(
    {
      invoice_number: 'INV-TZ',
      status: 'paid',
      client_name: 'Sam',
      subtotal: 1000,
      gst_amount: 150,
      total: 1150,
      due_date: DUE,
      paid_at: '2026-10-25T00:00:00.000Z',
      line_items: [{ description: 'Labour', amount: 1000 }],
    },
    null,
    [],
    'tokentokentokentoken',
  );

  const payload = {
    tz: process.env.TZ ?? null,
    pdfDue: pdfText.includes(DUE_DMY),
    pdfPreviousDay: pdfText.includes(PREVIOUS_DMY),
    emailHtmlDue: mail.html.includes(`Due Date:</strong> ${DUE_LONG}`),
    emailHtmlPrevious: mail.html.includes(PREVIOUS_LONG),
    emailTextDue: mail.text.includes(`Due Date: ${DUE_DMY}`),
    emailTextPrevious: mail.text.includes(PREVIOUS_DMY),
    pageDue: page.includes(`<strong>Due Date:</strong> ${DUE_LONG}`),
    pagePaidPrevious: page.includes(`<strong>Paid:</strong> ${PREVIOUS_LONG}`),
    pagePaidSameDay: page.includes(`<strong>Paid:</strong> ${DUE_LONG}`),
  };
  console.log(`CALENDAR_DATE_RESULT ${JSON.stringify(payload)}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
