/**
 * PDF Generation Service
 * Generates professional invoice and quote PDFs using pdfkit
 */

import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { Invoice, InvoiceLineItem, Quote } from '../types/index.js';

/** Convert cents to formatted NZD string */
function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/** Format date string to DD/MM/YYYY (NZ format) */
function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Generate an invoice PDF and return it as a Buffer
 */
export async function generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ─── Header ───
      drawHeader(doc, invoice, pageWidth);

      // ─── Client Details ───
      drawClientDetails(doc, invoice);

      // ─── Line Items Table ───
      drawLineItems(doc, invoice.lineItems, pageWidth);

      // ─── Totals ───
      drawTotals(doc, invoice, pageWidth);

      // ─── Bank Details ───
      drawBankDetails(doc, invoice);

      // ─── Notes ───
      if (invoice.notes) {
        doc.moveDown(1.5);
        doc.fontSize(10).font('Helvetica-Bold').text('Notes:', { continued: false });
        doc.font('Helvetica').text(invoice.notes);
      }

      // ─── Footer ───
      drawFooter(doc, invoice);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawHeader(doc: InstanceType<typeof PDFDocument>, invoice: Invoice, pageWidth: number): void {
  const isQuote = false; // Future: pass flag for quotes
  const title = isQuote ? 'QUOTE' : 'INVOICE';

  // Company name (left side)
  doc.fontSize(20).font('Helvetica-Bold');
  if (invoice.companyName) {
    doc.text(invoice.companyName, doc.page.margins.left, 50);
  }

  // INVOICE title (right side)
  doc.fontSize(24).font('Helvetica-Bold');
  const titleWidth = doc.widthOfString(title);
  doc.text(title, doc.page.width - doc.page.margins.right - titleWidth, 50);

  doc.moveDown(0.3);

  // Company details (left) and invoice details (right)
  const detailsY = doc.y;
  const leftX = doc.page.margins.left;
  const rightX = doc.page.width - doc.page.margins.right - 200;

  doc.fontSize(9).font('Helvetica');

  // Left side: company info
  let leftY = detailsY;
  if (invoice.companyAddress) {
    doc.text(invoice.companyAddress, leftX, leftY, { width: 250 });
    leftY = doc.y;
  }
  if (invoice.irdNumber) {
    doc.text(`IRD: ${invoice.irdNumber}`, leftX, leftY);
    leftY = doc.y;
  }
  if (invoice.gstNumber) {
    doc.text(`GST: ${invoice.gstNumber}`, leftX, leftY);
    leftY = doc.y;
  }

  // Right side: invoice details
  doc.font('Helvetica-Bold');
  doc.text('Invoice No:', rightX, detailsY);
  doc.font('Helvetica');
  doc.text(invoice.invoiceNumber, rightX + 80, detailsY);

  doc.font('Helvetica-Bold');
  doc.text('Date:', rightX, detailsY + 14);
  doc.font('Helvetica');
  doc.text(formatDate(invoice.createdAt), rightX + 80, detailsY + 14);

  if (invoice.dueDate) {
    doc.font('Helvetica-Bold');
    doc.text('Due Date:', rightX, detailsY + 28);
    doc.font('Helvetica');
    doc.text(formatDate(invoice.dueDate), rightX + 80, detailsY + 28);
  }

  doc.font('Helvetica-Bold');
  doc.text('Status:', rightX, detailsY + (invoice.dueDate ? 42 : 28));
  doc.font('Helvetica');
  doc.text(invoice.status.toUpperCase(), rightX + 80, detailsY + (invoice.dueDate ? 42 : 28));

  // Move below whichever column is taller
  const maxY = Math.max(leftY, detailsY + (invoice.dueDate ? 56 : 42));
  doc.y = maxY;

  // Divider line
  doc.moveDown(0.5);
  doc.moveTo(leftX, doc.y).lineTo(leftX + pageWidth, doc.y).lineWidth(1).stroke('#cccccc');
  doc.moveDown(0.5);
}

function drawClientDetails(doc: InstanceType<typeof PDFDocument>, invoice: Invoice): void {
  const leftX = doc.page.margins.left;
  doc.fontSize(10).font('Helvetica-Bold').text('Bill To:', leftX);
  doc.font('Helvetica');
  doc.text(invoice.clientName);
  if (invoice.clientEmail) doc.text(invoice.clientEmail);
  if (invoice.clientPhone) doc.text(invoice.clientPhone);
  if (invoice.jobDescription) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('Job:', { continued: true });
    doc.font('Helvetica').text(` ${invoice.jobDescription}`);
  }
  doc.moveDown(1);
}

function drawLineItems(doc: InstanceType<typeof PDFDocument>, lineItems: InvoiceLineItem[], pageWidth: number): void {
  const leftX = doc.page.margins.left;
  const amountColWidth = 100;
  const descColWidth = pageWidth - amountColWidth;
  const tableTop = doc.y;

  // Table header background
  doc.rect(leftX, tableTop, pageWidth, 20).fill('#f0f0f0');

  // Table header text
  doc.fontSize(9).font('Helvetica-Bold').fill('#333333');
  doc.text('Description', leftX + 5, tableTop + 5, { width: descColWidth - 10 });
  doc.text('Amount', leftX + descColWidth + 5, tableTop + 5, { width: amountColWidth - 10, align: 'right' });

  let y = tableTop + 25;

  // Table rows
  doc.font('Helvetica').fill('#000000');
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];

    // Check if we need a new page
    if (y > doc.page.height - 150) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    // Alternating row background
    if (i % 2 === 1) {
      doc.rect(leftX, y - 3, pageWidth, 18).fill('#fafafa');
      doc.fill('#000000');
    }

    doc.fontSize(9);
    doc.text(item.description, leftX + 5, y, { width: descColWidth - 10 });
    doc.text(formatCurrency(item.amount), leftX + descColWidth + 5, y, { width: amountColWidth - 10, align: 'right' });

    y += 18;
  }

  // Bottom border
  doc.moveTo(leftX, y + 2).lineTo(leftX + pageWidth, y + 2).lineWidth(0.5).stroke('#cccccc');

  doc.y = y + 10;
}

function drawTotals(doc: InstanceType<typeof PDFDocument>, invoice: Invoice, pageWidth: number): void {
  const rightX = doc.page.margins.left + pageWidth - 200;
  const valueX = rightX + 110;

  doc.fontSize(10);

  // Subtotal
  doc.font('Helvetica').text('Subtotal:', rightX, doc.y, { continued: false });
  doc.text(formatCurrency(invoice.subtotal), valueX, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });

  // GST
  if (invoice.includeGst) {
    doc.text('GST (15%):', rightX, doc.y, { continued: false });
    doc.text(formatCurrency(invoice.gstAmount), valueX, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });
  }

  // Total line
  doc.moveDown(0.3);
  doc.moveTo(rightX, doc.y).lineTo(rightX + 200, doc.y).lineWidth(1).stroke('#333333');
  doc.moveDown(0.3);

  // Total
  doc.fontSize(12).font('Helvetica-Bold');
  doc.text('Total:', rightX, doc.y, { continued: false });
  doc.text(formatCurrency(invoice.total), valueX, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });

  doc.font('Helvetica').fontSize(10);
}

function drawBankDetails(doc: InstanceType<typeof PDFDocument>, invoice: Invoice): void {
  const hasNzBank = invoice.bankAccountName || invoice.bankAccountNumber;
  const hasIntlBank = invoice.intlBankAccountName || invoice.intlIban;

  if (!hasNzBank && !hasIntlBank) return;

  doc.moveDown(1.5);
  doc.fontSize(10).font('Helvetica-Bold').text('Payment Details:', { continued: false });
  doc.moveDown(0.3);

  doc.fontSize(9).font('Helvetica');

  if (hasNzBank) {
    if (invoice.bankAccountName) doc.text(`Account Name: ${invoice.bankAccountName}`);
    if (invoice.bankAccountNumber) doc.text(`Account Number: ${invoice.bankAccountNumber}`);
  }

  if (hasIntlBank) {
    if (hasNzBank) doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('International Payments:', { continued: false });
    doc.font('Helvetica');
    if (invoice.intlBankAccountName) doc.text(`Account Name: ${invoice.intlBankAccountName}`);
    if (invoice.intlIban) doc.text(`IBAN: ${invoice.intlIban}`);
    if (invoice.intlSwiftBic) doc.text(`SWIFT/BIC: ${invoice.intlSwiftBic}`);
    if (invoice.intlBankName) doc.text(`Bank: ${invoice.intlBankName}`);
    if (invoice.intlBankAddress) doc.text(`Bank Address: ${invoice.intlBankAddress}`);
  }
}

function drawFooter(doc: InstanceType<typeof PDFDocument>, _invoice: Invoice): void {
  const bottomY = doc.page.height - doc.page.margins.bottom - 30;
  const leftX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Only draw footer if we have space
  if (doc.y > bottomY - 20) return;

  doc.moveTo(leftX, bottomY).lineTo(leftX + pageWidth, bottomY).lineWidth(0.5).stroke('#cccccc');

  doc.fontSize(8).font('Helvetica').fill('#888888');
  doc.text(
    `Generated by ${config.appName}`,
    leftX,
    bottomY + 5,
    { width: pageWidth, align: 'center' }
  );
}

/**
 * Generate a quote PDF (same layout with QUOTE header and valid-until date)
 * Adapts Quote type to Invoice format for PDF generation
 */
export async function generateQuotePDF(quote: Quote): Promise<Buffer> {
  // Adapt quote fields to invoice format for PDF generation
  const invoiceCompat: Invoice = {
    id: quote.id,
    userId: quote.userId,
    invoiceNumber: quote.quoteNumber, // Display quote number
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    clientPhone: quote.clientPhone,
    swmsId: null,
    jobDescription: quote.jobDescription,
    lineItems: quote.lineItems,
    subtotal: quote.subtotal,
    gstAmount: quote.gstAmount,
    total: quote.total,
    status: 'draft', // Not relevant for PDF
    dueDate: quote.validUntil, // Show valid-until as the date
    paidAt: null,
    bankAccountName: quote.bankAccountName,
    bankAccountNumber: quote.bankAccountNumber,
    notes: quote.notes,
    customerId: quote.customerId,
    recurringInvoiceId: null,
    includeGst: quote.includeGst,
    intlBankAccountName: quote.intlBankAccountName,
    intlIban: quote.intlIban,
    intlSwiftBic: quote.intlSwiftBic,
    intlBankName: quote.intlBankName,
    intlBankAddress: quote.intlBankAddress,
    companyName: quote.companyName,
    companyAddress: quote.companyAddress,
    irdNumber: quote.irdNumber,
    gstNumber: quote.gstNumber,
    shareToken: null,
    // Payment gateway fields — not used in PDF render, but required by Invoice type.
    paymentProvider: null,
    paymentReference: null,
    paymentLinkUrl: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };

  return generateInvoicePDF(invoiceCompat);
}

export default {
  generateInvoicePDF,
  generateQuotePDF,
};
