/**
 * Public Routes (No Authentication Required)
 * /api/v1/public/*
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import { config } from '../config/index.js';
import invoicesService from '../services/invoices.js';
import documentsService, { DOCUMENT_DISCLAIMER } from '../services/documents.js';
import { getOrCreateInvoicePaymentLink } from '../services/stripe.js';
import { isPathInside } from '../utils/path-safe.js';
import { customerFacingInvoiceStatus } from '../utils/invoiceCustomerFacing.js';

const router = Router();

/**
 * GET /api/v1/public/invoices/:token
 * View a shared invoice (server-rendered HTML, no auth required)
 */
// Phase 1 — Stripe Payment Links: "Pay Now" button rendered via
// getOrCreateInvoicePaymentLink. Webhook handler in services/stripe.ts +
// routes/stripe-webhook.ts. See docs/product/PAYMENT_GATEWAY_PARTNERS.md.
router.get('/invoices/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;

    if (!token || token.length < 16) {
      res.status(400).send(renderErrorPage('Invalid Link', 'This invoice link is invalid.'));
      return;
    }

    const invoice = await invoicesService.getInvoiceByShareToken(token);

    if (!invoice) {
      res.status(404).send(renderErrorPage('Invoice Not Found', 'This invoice link has expired or does not exist.'));
      return;
    }

    // Generate (or fetch existing) Payment Link for unpaid invoices. We pass
    // the public invoice page itself as both success_url and cancel_url —
    // the page reads invoice.status when re-rendered, so paid state appears
    // automatically once the webhook lands.
    let paymentLinkUrl: string | null = null;
    if (invoice.status !== 'paid' && invoice.id && invoice.user_id) {
      try {
        const baseUrl = process.env.API_BASE_URL || `http://localhost:${config.port}`;
        const link = await getOrCreateInvoicePaymentLink(
          invoice.id as string,
          invoice.user_id as string,
          {
            successUrl: `${baseUrl}/api/v1/public/invoices/${token}?payment=success`,
            cancelUrl: `${baseUrl}/api/v1/public/invoices/${token}?payment=cancelled`,
          }
        );
        paymentLinkUrl = link?.url ?? null;
      } catch (err) {
        // Payment Link generation must not break the public invoice page.
        // If Stripe is misconfigured, fall back to bank-transfer-only view.
        console.error('[Public Invoice] Payment Link generation failed:', err);
      }
    }

    let documents: { id: string; title: string; docKind: string }[] = [];
    try {
      if (invoice.user_id && invoice.id) {
        const docs = await documentsService.listDocumentsForInvoice(String(invoice.user_id), {
          invoiceId: String(invoice.id),
          customerId: (invoice.customer_id as string) || null,
        });
        documents = docs.map((d) => ({
          id: d.id,
          title: d.title,
          docKind: d.docKind,
        }));
      }
    } catch (err) {
      console.error('[Public Invoice] documents list failed:', err);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderInvoicePage(invoice, paymentLinkUrl, documents, token));
  } catch (error) {
    console.error('Public invoice error:', error);
    res.status(500).send(renderErrorPage('Error', 'Something went wrong loading this invoice.'));
  }
});

/**
 * GET /api/v1/public/invoices/:token/documents/:docId/file
 * Download an attachment only if it belongs to the shared invoice's owner
 * and is in the invoice's document set (company/client defaults or invoice-specific).
 */
router.get('/invoices/:token/documents/:docId/file', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const docId = req.params.docId as string;
    if (!token || token.length < 16) {
      res.status(400).send('Invalid link');
      return;
    }
    const invoice = await invoicesService.getInvoiceByShareToken(token);
    if (!invoice?.user_id || !invoice.id) {
      res.status(404).send('Not found');
      return;
    }
    const docs = await documentsService.listDocumentsForInvoice(String(invoice.user_id), {
      invoiceId: String(invoice.id),
      customerId: (invoice.customer_id as string) || null,
    });
    if (!docs.some((d) => d.id === docId)) {
      res.status(404).send('Document not available for this invoice');
      return;
    }
    const doc = await documentsService.getDocument(docId, String(invoice.user_id));
    if (!doc) {
      res.status(404).send('Not found');
      return;
    }
    const resolved = path.resolve(doc.storagePath);
    const root = path.resolve(documentsService.getDocumentsUploadDir());
    if (!isPathInside(root, resolved)) {
      res.status(400).send('Invalid path');
      return;
    }
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(doc.originalFilename || doc.filename).replace(/"/g, '')}"`,
    );
    res.sendFile(resolved);
  } catch (error) {
    console.error('Public document error:', error);
    res.status(500).send('Error');
  }
});

// =============================================================================
// HTML RENDERING HELPERS
// =============================================================================

function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(cents: unknown): string {
  const amount = typeof cents === 'number' ? cents : parseInt(String(cents || '0'), 10);
  return `$${(amount / 100).toFixed(2)}`;
}

function formatDate(date: unknown): string {
  if (!date) return '';
  try {
    return new Date(String(date)).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(date);
  }
}

function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${config.appName}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="error-card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  </div>
</body>
</html>`;
}

function renderInvoicePage(
  inv: Record<string, unknown>,
  paymentLinkUrl: string | null = null,
  documents: { id: string; title: string; docKind: string }[] = [],
  shareToken: string = '',
): string {
  const lineItems = (inv.line_items as Array<{ description: string; amount: number }>) || [];
  // Customer-facing only: PAID / OVERDUE. Never show DRAFT or SENT to clients.
  const statusLabel = customerFacingInvoiceStatus(
    inv.status === null || inv.status === undefined ? null : String(inv.status)
  );
  const statusClass =
    statusLabel === 'PAID' ? 'status-paid' : statusLabel === 'OVERDUE' ? 'status-overdue' : '';

  let lineItemsHtml = '';
  for (const item of lineItems) {
    lineItemsHtml += `
      <tr>
        <td>${escapeHtml(item.description)}</td>
        <td class="amount">${formatCurrency(item.amount)}</td>
      </tr>`;
  }

  const gstAmount = typeof inv.gst_amount === 'number' ? inv.gst_amount : parseInt(String(inv.gst_amount || '0'), 10);
  const discountAmount =
    typeof inv.discount_amount === 'number'
      ? inv.discount_amount
      : parseInt(String(inv.discount_amount || '0'), 10);
  let discountLabel = inv.discount_label ? String(inv.discount_label) : 'Discount';
  if (inv.discount_type === 'percent' && inv.discount_value) {
    discountLabel = `${discountLabel} (${inv.discount_value}%)`;
  }
  const discountRowHtml =
    discountAmount > 0
      ? `
          <tr class="discount-row">
            <td>${escapeHtml(discountLabel)}</td>
            <td class="amount">-${formatCurrency(discountAmount)}</td>
          </tr>`
      : '';

  let companyHtml = '';
  if (inv.company_name) {
    companyHtml = `
    <div class="company-section">
      <strong>${escapeHtml(inv.company_name)}</strong>
      ${inv.company_address ? `<br>${escapeHtml(inv.company_address)}` : ''}
      ${inv.company_phone ? `<br>${escapeHtml(inv.company_phone)}` : ''}
      ${inv.company_email ? `<br>${escapeHtml(inv.company_email)}` : ''}
      ${inv.gst_number ? `<br>GST: ${escapeHtml(inv.gst_number)}` : ''}
    </div>`;
  }

  let paymentHtml = '';
  if (inv.bank_account_name || inv.bank_account_number) {
    paymentHtml += `
    <div class="payment-section">
      <h3>Payment Details (NZD)</h3>
      ${inv.bank_account_name ? `<p><strong>Account Name:</strong> ${escapeHtml(inv.bank_account_name)}</p>` : ''}
      ${inv.bank_account_number ? `<p><strong>Account Number:</strong> ${escapeHtml(inv.bank_account_number)}</p>` : ''}
    </div>`;
  }
  if (inv.intl_iban) {
    paymentHtml += `
    <div class="payment-section">
      <h3>International Payment</h3>
      ${inv.intl_bank_account_name ? `<p><strong>Name:</strong> ${escapeHtml(inv.intl_bank_account_name)}</p>` : ''}
      <p><strong>IBAN:</strong> ${escapeHtml(inv.intl_iban)}</p>
      ${inv.intl_swift_bic ? `<p><strong>SWIFT/BIC:</strong> ${escapeHtml(inv.intl_swift_bic)}</p>` : ''}
      ${inv.intl_bank_name ? `<p><strong>Bank:</strong> ${escapeHtml(inv.intl_bank_name)}</p>` : ''}
    </div>`;
  }

  // Pay Now CTA (Phase 1 — Stripe Payment Links). Rendered only for unpaid
  // invoices when getOrCreateInvoicePaymentLink returned a usable URL. Falls
  // back silently to bank-transfer-only display when Stripe is unconfigured.
  let payNowHtml = '';
  if (inv.status !== 'paid' && paymentLinkUrl) {
    payNowHtml = `
    <div class="pay-now-section">
      <a class="pay-now-button" href="${escapeHtml(paymentLinkUrl)}">Pay ${formatCurrency(inv.total)} online</a>
      <p class="pay-now-note">Secure payment by card via Stripe. The tradie will be notified automatically once payment clears.</p>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${escapeHtml(inv.invoice_number)} - ${config.appName}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="invoice-card">

      <div class="header">
        ${companyHtml}
        <div class="invoice-meta">
          <h1>INVOICE</h1>
          <p class="invoice-number">${escapeHtml(inv.invoice_number)}</p>
          ${
            statusLabel
              ? `<span class="status ${statusClass}">${statusLabel}</span>`
              : ''
          }
        </div>
      </div>

      <div class="client-section">
        <h3>Bill To</h3>
        <p><strong>${escapeHtml(inv.client_name)}</strong></p>
        ${inv.client_email ? `<p>${escapeHtml(inv.client_email)}</p>` : ''}
        ${inv.client_phone ? `<p>${escapeHtml(inv.client_phone)}</p>` : ''}
      </div>

      ${inv.job_description ? `<div class="job-section"><h3>Job Description</h3><p>${escapeHtml(inv.job_description)}</p></div>` : ''}

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
        <tfoot>
          <tr class="subtotal-row">
            <td>Subtotal</td>
            <td class="amount">${formatCurrency(inv.subtotal)}</td>
          </tr>
          ${discountRowHtml}
          ${gstAmount > 0 ? `
          <tr class="gst-row">
            <td>GST (15%)</td>
            <td class="amount">${formatCurrency(inv.gst_amount)}</td>
          </tr>` : ''}
          <tr class="total-row">
            <td><strong>Total</strong></td>
            <td class="amount"><strong>${formatCurrency(inv.total)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="dates-section">
        ${inv.due_date ? `<p><strong>Due Date:</strong> ${formatDate(inv.due_date)}</p>` : ''}
        ${inv.paid_at ? `<p class="paid-date"><strong>Paid:</strong> ${formatDate(inv.paid_at)}</p>` : ''}
      </div>

      ${payNowHtml}

      ${paymentHtml}

      ${inv.notes ? `<div class="notes-section"><h3>Notes</h3><p>${escapeHtml(inv.notes)}</p></div>` : ''}

      ${
        documents.length > 0 && shareToken
          ? `<div class="notes-section">
        <h3>Documents from the supplier</h3>
        <ul style="margin:8px 0 12px 18px;">
          ${documents
            .map(
              (d) =>
                `<li><a href="/api/v1/public/invoices/${escapeHtml(shareToken)}/documents/${escapeHtml(d.id)}/file" target="_blank" rel="noopener">${escapeHtml(d.title)}</a> <span style="color:#6B7280;font-size:12px;">(${escapeHtml(d.docKind)})</span></li>`,
            )
            .join('')}
        </ul>
        <p style="font-size:11px;color:#6B7280;">${escapeHtml(DOCUMENT_DISCLAIMER)}</p>
      </div>`
          : ''
      }

      <div class="footer">
        <p>Generated by ${config.appName}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getBaseStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F3F4F6;
      color: #111827;
      line-height: 1.5;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .invoice-card, .error-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 32px;
    }
    .error-card { text-align: center; padding: 48px 32px; }
    .error-card h1 { color: #EF4444; margin-bottom: 8px; }
    .error-card p { color: #6B7280; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .company-section { font-size: 14px; color: #374151; }
    .invoice-meta { text-align: right; }
    .invoice-meta h1 { font-size: 28px; color: #2563EB; letter-spacing: 2px; }
    .invoice-number { font-size: 18px; color: #6B7280; margin: 4px 0 8px; }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-paid { background: #D1FAE5; color: #065F46; }
    .status-sent { background: #DBEAFE; color: #1E40AF; }
    .status-overdue { background: #FEE2E2; color: #991B1B; }

    .client-section, .job-section, .dates-section, .payment-section, .notes-section {
      margin-bottom: 24px;
    }
    .client-section h3, .job-section h3, .payment-section h3, .notes-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6B7280;
      margin-bottom: 8px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6B7280;
      padding: 12px 0;
      border-bottom: 2px solid #E5E7EB;
    }
    .items-table td {
      padding: 12px 0;
      border-bottom: 1px solid #F3F4F6;
    }
    .items-table .amount { text-align: right; }
    .items-table th.amount { text-align: right; }
    .subtotal-row td { border-top: 2px solid #E5E7EB; padding-top: 12px; }
    .gst-row td { color: #6B7280; }
    .total-row td { font-size: 18px; border-top: 2px solid #111827; padding-top: 12px; }

    .paid-date { color: #10B981; }

    .pay-now-section {
      margin: 24px 0;
      text-align: center;
    }
    .pay-now-button {
      display: inline-block;
      background: #2563EB;
      color: #fff;
      padding: 14px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
    }
    .pay-now-button:hover { background: #1D4ED8; }
    .pay-now-note {
      margin-top: 8px;
      font-size: 12px;
      color: #6B7280;
    }

    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      font-size: 12px;
      color: #9CA3AF;
    }

    @media (max-width: 480px) {
      .container { padding: 12px 8px; }
      .invoice-card { padding: 20px 16px; }
      .header { flex-direction: column; }
      .invoice-meta { text-align: left; }
    }
  `;
}

export default router;
