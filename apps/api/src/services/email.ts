/**
 * Email Service
 * Send transactional emails via Resend
 */

import { Resend } from 'resend';
import { config } from '../config/index.js';
import { Invoice, Quote } from '../types/index.js';

let resendClient: Resend | null = null;

/**
 * Determine whether the Resend SDK should be mocked.
 *
 * MOCK_RESEND === 'true' is the canonical Phase 6a per-service flag.
 * MOCK_EXTERNAL_SERVICES === 'true' is retained as a backward-compat master
 * switch that mocks Resend (alongside Stripe + Anthropic) for existing
 * scripts / docs that still set the legacy flag.
 */
function isResendMocked(): boolean {
  return (
    process.env.MOCK_RESEND === 'true' ||
    process.env.MOCK_EXTERNAL_SERVICES === 'true'
  );
}

function getResend(): Resend {
  if (!resendClient) {
    const mocking = isResendMocked();
    if (!mocking && !config.resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    // When mocking, the SDK is instantiated with a stub key — the mock
    // monkey-patches send() before any HTTP call would happen, so the key
    // is never used. The key argument is optional in Resend v6.
    resendClient = new Resend(config.resendApiKey || 're_mock_phase6a_stub_key');
    // Phase 6a mock infrastructure: when MOCK_RESEND === 'true' (or the
    // legacy master switch MOCK_EXTERNAL_SERVICES === 'true'), monkey-patch
    // resend.emails.send() to capture in-memory instead of calling
    // api.resend.com. Default behavior is unchanged when both env vars
    // are unset/false.
    if (mocking) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { installResendMock } = require('./mocks/resend-mock.js');
      installResendMock(resendClient);
      console.log('[Email] MOCK_RESEND=true — Resend SDK mocked');
    }
  }
  return resendClient;
}

/**
 * Check if email sending is configured.
 *
 * When MOCK_RESEND=true (or legacy MOCK_EXTERNAL_SERVICES=true), returns
 * true even if RESEND_API_KEY is unset — the mock swallows sends without
 * needing real credentials. This keeps the e2e demo flows that depend on
 * email-side-effects (verification codes, password reset codes, invoice
 * emails) running end-to-end.
 */
export function isEmailConfigured(): boolean {
  if (isResendMocked()) return true;
  return !!config.resendApiKey;
}

// Keep legacy aliases for callers that haven't been updated
export const isSmtpConfigured = isEmailConfigured;
export const isResendConfigured = isEmailConfigured;

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

const appName = () => config.smtp.fromName || config.appName || 'BossBoard';
const fromAddress = () => {
  const email = config.smtp.fromEmail || 'noreply@instilligent.com';
  return `${appName()} <${email}>`;
};

function layout(headerBg: string, headerTitle: string, headerSubtitle: string, body: string, footer?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F3F4F6; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${headerBg}; padding: 24px 32px;">
      <h1 style="margin: 0; color: #FFFFFF; font-size: 20px;">${headerTitle}</h1>
      ${headerSubtitle ? `<p style="margin: 8px 0 0; color: rgba(255,255,255,0.7); font-size: 14px;">${headerSubtitle}</p>` : ''}
    </div>
    <div style="padding: 32px;">${body}</div>
    <div style="padding: 16px 32px; background: #F9FAFB; border-top: 1px solid #E5E7EB;">
      <p style="margin: 0; color: #9CA3AF; font-size: 12px; text-align: center;">${footer || `Sent via ${appName()}`}</p>
    </div>
  </div>
</body>
</html>`;
}

function codeBlock(code: string): string {
  return `<div style="margin: 24px 0; padding: 20px; background: #F9FAFB; border: 2px solid #2563EB; border-radius: 8px; text-align: center;">
    <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function welcomeTemplate(code: string): { subject: string; html: string; text: string } {
  const subject = `${appName()} - Verify Your Email`;

  const html = layout('#F97316', 'Verify Your Email', appName(),
    `<p style="margin: 0 0 16px; color: #374151; font-size: 16px;">Welcome to ${appName()}! Enter this code to verify your email:</p>
     ${codeBlock(code)}
     <p style="margin: 0 0 8px; color: #6B7280; font-size: 13px;">This code expires in 30 minutes.</p>
     <p style="margin: 0; color: #6B7280; font-size: 13px;">If you didn't create an account, you can safely ignore this email.</p>`
  );

  const text = [
    `${appName()} - Email Verification`,
    '',
    'Welcome! Enter this code to verify your email:',
    '',
    `  ${code}`,
    '',
    'This code expires in 30 minutes.',
    "If you didn't create an account, you can safely ignore this email.",
  ].join('\n');

  return { subject, html, text };
}

function passwordResetTemplate(code: string): { subject: string; html: string; text: string } {
  const subject = `${appName()} - Password Reset Code: ${code}`;

  const html = layout('#2563EB', 'Password Reset', appName(),
    `<p style="margin: 0 0 16px; color: #374151; font-size: 16px;">You requested a password reset. Enter this code in the app:</p>
     ${codeBlock(code)}
     <p style="margin: 0 0 8px; color: #6B7280; font-size: 13px;">This code expires in 30 minutes.</p>
     <p style="margin: 0; color: #6B7280; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>`
  );

  const text = [
    `${appName()} - Password Reset`,
    '',
    'You requested a password reset. Enter this code in the app:',
    '',
    `  ${code}`,
    '',
    'This code expires in 30 minutes.',
    "If you didn't request this, you can safely ignore this email.",
  ].join('\n');

  return { subject, html, text };
}

function tradeConfirmationTemplate(opts: {
  clientName: string;
  jobDescription: string;
  scheduledDate?: string;
  tradeType?: string;
  senderName: string;
}): { subject: string; html: string; text: string } {
  const subject = `Job Confirmed — ${opts.jobDescription}`;

  const dateRow = opts.scheduledDate
    ? `<p style="margin: 0 0 8px; color: #374151;"><strong>Scheduled:</strong> ${new Date(opts.scheduledDate).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>`
    : '';

  const tradeRow = opts.tradeType
    ? `<p style="margin: 0 0 8px; color: #374151;"><strong>Trade:</strong> ${opts.tradeType}</p>`
    : '';

  const html = layout('#059669', 'Job Confirmed', appName(),
    `<p style="margin: 0 0 16px; color: #374151; font-size: 16px;">Hi ${opts.clientName},</p>
     <p style="margin: 0 0 16px; color: #374151;">Your job has been confirmed:</p>
     <div style="padding: 16px; background: #F0FDF4; border-radius: 8px; margin-bottom: 16px;">
       <p style="margin: 0 0 8px; color: #111827; font-weight: 600; font-size: 16px;">${opts.jobDescription}</p>
       ${dateRow}
       ${tradeRow}
     </div>
     <p style="margin: 0; color: #6B7280; font-size: 13px;">${opts.senderName} will be in touch with further details.</p>`,
    `Sent via ${appName()}${opts.senderName ? ` on behalf of ${opts.senderName}` : ''}`
  );

  const text = [
    `Hi ${opts.clientName},`,
    '',
    'Your job has been confirmed:',
    '',
    `  ${opts.jobDescription}`,
    opts.scheduledDate ? `  Scheduled: ${new Date(opts.scheduledDate).toLocaleDateString('en-NZ')}` : '',
    opts.tradeType ? `  Trade: ${opts.tradeType}` : '',
    '',
    `${opts.senderName} will be in touch with further details.`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

function portfolioAlertTemplate(opts: {
  userName: string;
  alerts: Array<{ name: string; expiryDate: string; daysLeft: number }>;
}): { subject: string; html: string; text: string } {
  const urgentCount = opts.alerts.filter(a => a.daysLeft <= 7).length;
  const subject = urgentCount > 0
    ? `${appName()} — ${urgentCount} certification(s) expiring soon`
    : `${appName()} — Certification expiry reminder`;

  const alertRows = opts.alerts
    .map(a => {
      const colour = a.daysLeft <= 7 ? '#DC2626' : a.daysLeft <= 30 ? '#D97706' : '#059669';
      const label = a.daysLeft <= 0 ? 'EXPIRED' : `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left`;
      return `<tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #E5E7EB;">${a.name}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #E5E7EB;">${new Date(a.expiryDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #E5E7EB; color: ${colour}; font-weight: 600;">${label}</td>
      </tr>`;
    })
    .join('');

  const html = layout('#D97706', 'Certification Alert', appName(),
    `<p style="margin: 0 0 16px; color: #374151; font-size: 16px;">Hi ${opts.userName},</p>
     <p style="margin: 0 0 16px; color: #374151;">The following certifications need your attention:</p>
     <table style="width: 100%; border-collapse: collapse;">
       <thead>
         <tr style="background: #F9FAFB;">
           <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Certification</th>
           <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Expiry</th>
           <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Status</th>
         </tr>
       </thead>
       <tbody>${alertRows}</tbody>
     </table>
     <p style="margin: 16px 0 0; color: #6B7280; font-size: 13px;">Open ${appName()} to renew or update your certifications.</p>`
  );

  const text = [
    `Hi ${opts.userName},`,
    '',
    'The following certifications need your attention:',
    '',
    ...opts.alerts.map(a => {
      const label = a.daysLeft <= 0 ? 'EXPIRED' : `${a.daysLeft} day(s) left`;
      return `  - ${a.name} — expires ${new Date(a.expiryDate).toLocaleDateString('en-NZ')} (${label})`;
    }),
    '',
    `Open ${appName()} to renew or update your certifications.`,
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Invoice email (preserves existing rich template)
// ---------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Resend rejects subjects that contain CR/LF (INV-0002 2026-08-22). */
function sanitizeEmailSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clientNoteHtml(customMessage?: string): string {
  const msg = customMessage?.trim();
  if (!msg) return '';
  const html = escapeHtml(msg).replace(/\r\n/g, '\n').replace(/\n/g, '<br>\n');
  return `<div style="margin: 0 0 20px; padding: 12px 16px; background: #F9FAFB; border-radius: 8px;">
        <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.5;">${html}</p>
      </div>`;
}

function invoiceTemplate(invoice: Invoice, senderName: string, customMessage?: string): { subject: string; html: string; text: string } {
  // Message is a textarea in the UI — never concatenate it into the subject.
  const subject = `Invoice ${invoice.invoiceNumber} from ${senderName || appName()}`;

  const lineItemsHtml = invoice.lineItems
    .map(item =>
      `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">${item.description}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.amount)}</td>
      </tr>`)
    .join('');

  const dueDateHtml = invoice.dueDate
    ? `<p style="margin: 0 0 8px; color: #374151;"><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</p>`
    : '';

  const bankHtml = (invoice.bankAccountName || invoice.bankAccountNumber)
    ? `<div style="margin-top: 20px; padding: 16px; background: #F9FAFB; border-radius: 8px;">
        <h3 style="margin: 0 0 8px; color: #111827; font-size: 14px;">Payment Details</h3>
        ${invoice.bankAccountName ? `<p style="margin: 0 0 4px; color: #374151; font-size: 13px;"><strong>Account Name:</strong> ${invoice.bankAccountName}</p>` : ''}
        ${invoice.bankAccountNumber ? `<p style="margin: 0 0 4px; color: #374151; font-size: 13px;"><strong>Account Number:</strong> ${invoice.bankAccountNumber}</p>` : ''}
      </div>`
    : '';

  const notesHtml = invoice.notes
    ? `<div style="margin-top: 16px; padding: 12px; background: #FFFBEB; border-radius: 8px;">
        <p style="margin: 0; color: #92400E; font-size: 13px;">${invoice.notes}</p>
      </div>`
    : '';

  const body = `
    ${clientNoteHtml(customMessage)}
    <p style="margin: 0 0 4px; color: #6B7280; font-size: 13px;">Bill To:</p>
    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: 600;">${invoice.clientName}</p>
    ${invoice.jobDescription ? `<p style="margin: 0 0 16px; color: #374151; font-size: 14px;">${invoice.jobDescription}</p>` : ''}
    ${dueDateHtml}
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <thead>
        <tr style="background: #F9FAFB;">
          <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Description</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemsHtml}</tbody>
    </table>
    <div style="margin-top: 16px; text-align: right;">
      <p style="margin: 0 0 4px; color: #6B7280; font-size: 13px;">Subtotal: ${formatCurrency(invoice.subtotal)}</p>
      ${
        invoice.discountAmount && invoice.discountAmount > 0
          ? `<p style="margin: 0 0 4px; color: #059669; font-size: 13px;">${
              invoice.discountLabel || 'Discount'
            }${
              invoice.discountType === 'percent' && invoice.discountValue
                ? ` (${invoice.discountValue}%)`
                : ''
            }: -${formatCurrency(invoice.discountAmount)}</p>`
          : ''
      }
      ${invoice.includeGst ? `<p style="margin: 0 0 4px; color: #6B7280; font-size: 13px;">GST (15%): ${formatCurrency(invoice.gstAmount)}</p>` : ''}
      <p style="margin: 8px 0 0; color: #111827; font-size: 20px; font-weight: 700;">Total: ${formatCurrency(invoice.total)}</p>
    </div>
    ${bankHtml}
    ${notesHtml}`;

  const footerText = `Sent via ${appName()}${senderName ? ` on behalf of ${senderName}` : ''}`;

  const html = layout('#2563EB', `Invoice ${invoice.invoiceNumber}`,
    invoice.companyName || '', body, footerText);

  const textLines = [
    `Invoice ${invoice.invoiceNumber}`,
    invoice.companyName ? `From: ${invoice.companyName}` : '',
    '',
    ...(customMessage?.trim() ? [customMessage.trim(), ''] : []),
    `Bill To: ${invoice.clientName}`,
    invoice.jobDescription ? `Job: ${invoice.jobDescription}` : '',
    invoice.dueDate ? `Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-NZ')}` : '',
    '',
    '--- Line Items ---',
    ...invoice.lineItems.map(item => `  ${item.description}: ${formatCurrency(item.amount)}`),
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal)}`,
    invoice.discountAmount && invoice.discountAmount > 0
      ? `${invoice.discountLabel || 'Discount'}${
          invoice.discountType === 'percent' && invoice.discountValue
            ? ` (${invoice.discountValue}%)`
            : ''
        }: -${formatCurrency(invoice.discountAmount)}`
      : '',
    invoice.includeGst ? `GST (15%): ${formatCurrency(invoice.gstAmount)}` : '',
    `Total: ${formatCurrency(invoice.total)}`,
    '',
  ];

  if (invoice.bankAccountName || invoice.bankAccountNumber) {
    textLines.push('--- Payment Details ---');
    if (invoice.bankAccountName) textLines.push(`Account Name: ${invoice.bankAccountName}`);
    if (invoice.bankAccountNumber) textLines.push(`Account Number: ${invoice.bankAccountNumber}`);
    textLines.push('');
  }
  if (invoice.notes) {
    textLines.push(`Notes: ${invoice.notes}`, '');
  }
  textLines.push(footerText);

  return { subject, html, text: textLines.filter(l => l !== undefined).join('\n') };
}

function paymentFailedTemplate(opts: {
  userName?: string;
}): { subject: string; html: string; text: string } {
  const name = appName();
  const greeting = opts.userName ? `Hi ${opts.userName},` : 'Hi there,';
  const subject = `${name} — Action required: payment failed`;

  const html = layout(
    '#DC2626',
    'Payment Failed',
    name,
    `<p style="margin: 0 0 16px; color: #374151; font-size: 16px;">${greeting}</p>
     <p style="margin: 0 0 16px; color: #374151;">We were unable to process your subscription payment. Your access to ${name} will remain active for now, but please update your payment method as soon as possible to avoid any interruption.</p>
     <div style="margin: 24px 0; text-align: center;">
       <a href="#" style="display: inline-block; padding: 12px 28px; background: #DC2626; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Update Payment Method</a>
     </div>
     <p style="margin: 0; color: #6B7280; font-size: 13px;">If you believe this is a mistake, please contact your bank or try a different card. Reply to this email if you need help.</p>`
  );

  const text = [
    greeting,
    '',
    `We were unable to process your ${name} subscription payment.`,
    'Please update your payment method to avoid any interruption to your service.',
    '',
    'Open the app and go to Settings → Subscription to update your card details.',
    '',
    'If you need help, reply to this email.',
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Send functions
// ---------------------------------------------------------------------------

async function send(
  to: string,
  template: { subject: string; html: string; text: string },
  attachments?: Array<{ filename: string; content: Buffer }>,
  options?: { bcc?: string[] }
): Promise<{ messageId: string }> {
  const resend = getResend();

  const payload: Parameters<Resend['emails']['send']>[0] = {
    from: fromAddress(),
    to: [to],
    subject: sanitizeEmailSubject(template.subject),
    html: template.html,
    text: template.text,
  };

  if (options?.bcc?.length) {
    payload.bcc = options.bcc;
  }

  if (attachments?.length) {
    payload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: a.content,
    }));
  }

  const { data, error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  return { messageId: data?.id || `resend-${Date.now()}` };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(
  recipientEmail: string,
  code: string
): Promise<{ messageId: string }> {
  return send(recipientEmail, welcomeTemplate(code));
}

export async function sendPasswordResetEmail(
  recipientEmail: string,
  code: string
): Promise<{ messageId: string }> {
  return send(recipientEmail, passwordResetTemplate(code));
}

export async function sendInvoiceEmail(
  invoice: Invoice,
  pdfBuffer: Buffer,
  recipientEmail: string,
  senderName: string,
  customMessage?: string,
  options?: { bcc?: string }
): Promise<{ messageId: string }> {
  const bccList =
    options?.bcc &&
    options.bcc.trim() &&
    options.bcc.trim().toLowerCase() !== recipientEmail.trim().toLowerCase()
      ? [options.bcc.trim()]
      : undefined;

  return send(
    recipientEmail,
    invoiceTemplate(invoice, senderName, customMessage),
    [{ filename: `Invoice-${invoice.invoiceNumber}.pdf`, content: pdfBuffer }],
    bccList ? { bcc: bccList } : undefined
  );
}

function quoteTemplate(
  quote: Quote,
  senderName: string,
  customMessage?: string
): { subject: string; html: string; text: string } {
  const subject = `Quote ${quote.quoteNumber} from ${senderName || appName()}`;

  const lineItemsHtml = (quote.lineItems || [])
    .map(
      (item) =>
        `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">${item.description}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.amount)}</td>
      </tr>`
    )
    .join('');

  const validUntilHtml = quote.validUntil
    ? `<p style="margin: 0 0 8px; color: #374151;"><strong>Valid until:</strong> ${new Date(quote.validUntil).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</p>`
    : '';

  const notesHtml = quote.notes
    ? `<div style="margin-top: 16px; padding: 12px; background: #FFFBEB; border-radius: 8px;">
        <p style="margin: 0; color: #92400E; font-size: 13px;">${quote.notes}</p>
      </div>`
    : '';

  const body = `
    ${clientNoteHtml(customMessage)}
    <p style="margin: 0 0 4px; color: #6B7280; font-size: 13px;">Quote for:</p>
    <p style="margin: 0 0 16px; color: #111827; font-size: 16px; font-weight: 600;">${quote.clientName}</p>
    ${quote.jobDescription ? `<p style="margin: 0 0 16px; color: #374151; font-size: 14px;">${quote.jobDescription}</p>` : ''}
    ${validUntilHtml}
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <thead>
        <tr style="background: #F9FAFB;">
          <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Description</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 13px; color: #6B7280; border-bottom: 2px solid #E5E7EB;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemsHtml}</tbody>
    </table>
    <div style="margin-top: 16px; text-align: right;">
      <p style="margin: 0 0 4px; color: #6B7280; font-size: 13px;">Subtotal: ${formatCurrency(quote.subtotal)}</p>
      ${quote.includeGst ? `<p style="margin: 0 0 4px; color: #6B7280; font-size: 13px;">GST (15%): ${formatCurrency(quote.gstAmount)}</p>` : ''}
      <p style="margin: 8px 0 0; color: #111827; font-size: 20px; font-weight: 700;">Total: ${formatCurrency(quote.total)}</p>
    </div>
    ${notesHtml}
    <p style="margin: 20px 0 0; color: #6B7280; font-size: 13px;">Please find the full quote attached as a PDF.</p>`;

  const footerText = `Sent via ${appName()}${senderName ? ` on behalf of ${senderName}` : ''}`;
  const html = layout('#7C3AED', `Quote ${quote.quoteNumber}`, quote.companyName || '', body, footerText);

  const text = [
    `Quote ${quote.quoteNumber}`,
    quote.companyName ? `From: ${quote.companyName}` : '',
    '',
    ...(customMessage?.trim() ? [customMessage.trim(), ''] : []),
    `For: ${quote.clientName}`,
    quote.jobDescription ? `Job: ${quote.jobDescription}` : '',
    quote.validUntil ? `Valid until: ${new Date(quote.validUntil).toLocaleDateString('en-NZ')}` : '',
    '',
    `Total: ${formatCurrency(quote.total)}`,
    '',
    'Full quote attached as PDF.',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

export async function sendQuoteEmail(
  quote: Quote,
  pdfBuffer: Buffer,
  recipientEmail: string,
  senderName: string,
  customMessage?: string,
  options?: { bcc?: string }
): Promise<{ messageId: string }> {
  const bccList =
    options?.bcc &&
    options.bcc.trim() &&
    options.bcc.trim().toLowerCase() !== recipientEmail.trim().toLowerCase()
      ? [options.bcc.trim()]
      : undefined;

  return send(
    recipientEmail,
    quoteTemplate(quote, senderName, customMessage),
    [{ filename: `Quote-${quote.quoteNumber}.pdf`, content: pdfBuffer }],
    bccList ? { bcc: bccList } : undefined
  );
}

/**
 * Resolve BCC for invoice emails (best practice: business mailbox).
 * Chain: dedicated invoice_bcc_email → company_email → user login email.
 * Returns null when no usable address (should be rare).
 */
export function resolveInvoiceBcc(opts: {
  invoiceBccEmail?: string | null;
  companyEmail?: string | null;
  userEmail?: string | null;
  recipientEmail: string;
}): string | null {
  const recipient = opts.recipientEmail.trim().toLowerCase();
  const candidates = [opts.invoiceBccEmail, opts.companyEmail, opts.userEmail];
  for (const raw of candidates) {
    const email = (raw || '').trim();
    if (!email) continue;
    if (email.toLowerCase() === recipient) continue;
    // light validation — full email schema already applied on profile fields
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    return email;
  }
  return null;
}

export async function sendTradeConfirmation(
  recipientEmail: string,
  opts: {
    clientName: string;
    jobDescription: string;
    scheduledDate?: string;
    tradeType?: string;
    senderName: string;
  }
): Promise<{ messageId: string }> {
  return send(recipientEmail, tradeConfirmationTemplate(opts));
}

export async function sendPortfolioAlert(
  recipientEmail: string,
  opts: {
    userName: string;
    alerts: Array<{ name: string; expiryDate: string; daysLeft: number }>;
  }
): Promise<{ messageId: string }> {
  return send(recipientEmail, portfolioAlertTemplate(opts));
}

export async function sendPaymentFailedEmail(
  recipientEmail: string,
  opts: { userName?: string } = {}
): Promise<{ messageId: string }> {
  return send(recipientEmail, paymentFailedTemplate(opts));
}

export default {
  isEmailConfigured,
  isSmtpConfigured,
  isResendConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvoiceEmail,
  sendQuoteEmail,
  resolveInvoiceBcc,
  sendTradeConfirmation,
  sendPortfolioAlert,
  sendPaymentFailedEmail,
};
