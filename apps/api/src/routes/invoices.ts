/**
 * Invoice Routes
 * /api/v1/invoices/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import invoicesService from '../services/invoices.js';
import pdfService from '../services/pdf.js';
import emailService from '../services/email.js';
import { getBusinessProfile } from '../services/business-profile.js';
import { authenticate } from '../middleware/auth.js';
import { attachSubscription, checkLimit, requireFeature } from '../middleware/subscription.js';
import { config } from '../config/index.js';
import { getOrCreateInvoicePaymentLink } from '../services/stripe.js';

// App error type for error handling
interface AppError extends Error {
  statusCode: number;
  code: string;
}

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const lineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().int().min(0, 'Amount must be positive (in cents)'),
});

const discountTypeSchema = z.enum(['none', 'fixed', 'percent']);

const discountFields = {
  discountType: discountTypeSchema.optional(),
  /** Cents if fixed; whole percent 0–100 if percent */
  discountValue: z.number().int().min(0).max(100_000_000).optional(),
  discountLabel: z.string().max(120).optional().nullable(),
};

const createSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  swmsId: z.string().uuid().optional(),
  jobDescription: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  includeGst: z.boolean().optional().default(true),
  dueDate: z.string().optional(), // ISO date string
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  notes: z.string().optional(),
  /** Linked customer record (picker) — optional */
  customerId: z.string().uuid().optional().nullable(),
  ...discountFields,
});

const updateSchema = z.object({
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  swmsId: z.string().uuid().optional().nullable(),
  jobDescription: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  includeGst: z.boolean().optional(),
  dueDate: z.string().optional().nullable(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  notes: z.string().optional(),
  customerId: z.string().uuid().optional().nullable(),
  ...discountFields,
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/invoices
 * Create a new invoice
 */
router.post('/', authenticate, attachSubscription, checkLimit('invoice'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    // Clean up empty clientEmail
    const input = {
      ...validation.data,
      clientEmail: validation.data.clientEmail || undefined,
    };

    const invoice = await invoicesService.createInvoice(req.user!.userId, input);

    res.status(201).json({
      success: true,
      data: { invoice },
      message: 'Invoice created successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/invoices
 * List user's invoices
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit, offset } = req.query;

    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100) : 50;
    const parsedOffset = offset ? Math.max(parseInt(offset as string, 10) || 0, 0) : 0;

    const result = await invoicesService.listInvoices(req.user!.userId, {
      status: status as 'draft' | 'sent' | 'paid' | 'overdue' | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/invoices/:id
 * Get specific invoice
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const invoice = await invoicesService.getInvoiceById(id, req.user!.userId);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { invoice },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/invoices/:id/pdf
 * Download invoice as PDF
 */
router.get('/:id/pdf', authenticate, attachSubscription, requireFeature('pdfExport'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const invoice = await invoicesService.getInvoiceByIdRaw(id, req.user!.userId);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    const pdfBuffer = await pdfService.generateInvoicePDF(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/invoices/:id
 * Update invoice (only draft invoices)
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const id = req.params.id as string;
    const invoice = await invoicesService.updateInvoice(
      id,
      req.user!.userId,
      validation.data
    );

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { invoice },
      message: 'Invoice updated successfully',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/v1/invoices/:id
 * Delete invoice
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const deleted = await invoicesService.deleteInvoice(id, req.user!.userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/invoices/:id/send
 * Mark invoice as sent
 */
router.post('/:id/send', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const invoice = await invoicesService.markAsSent(id, req.user!.userId);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found or already sent',
      });
      return;
    }

    res.json({
      success: true,
      data: { invoice },
      message: 'Invoice marked as sent',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/invoices/:id/email
 * Email invoice to client with PDF attachment
 */
router.post('/:id/email', authenticate, attachSubscription, requireFeature('emailInvoice'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { recipientEmail, customMessage } = req.body;

    // Validate recipient email
    if (!recipientEmail || !z.string().email().safeParse(recipientEmail).success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'A valid recipient email address is required',
      });
      return;
    }

    // Check email is configured
    if (!emailService.isEmailConfigured()) {
      res.status(503).json({
        success: false,
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'Email sending is not configured. Set RESEND_API_KEY environment variable.',
      });
      return;
    }

    // Fetch invoice (raw for PDF generation)
    const invoice = await invoicesService.getInvoiceByIdRaw(id, req.user!.userId);
    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    // Get business profile for sender name
    const profile = await getBusinessProfile(req.user!.userId);
    const senderName = (profile?.company_name as string) || '';

    // Generate PDF
    const pdfBuffer = await pdfService.generateInvoicePDF(invoice);

    // Send email
    const result = await emailService.sendInvoiceEmail(
      invoice,
      pdfBuffer,
      recipientEmail,
      senderName,
      customMessage
    );

    // Auto-mark as sent if currently draft
    if (invoice.status === 'draft') {
      await invoicesService.markAsSent(id, req.user!.userId);
    }

    // Fetch updated invoice to return
    const updatedInvoice = await invoicesService.getInvoiceById(id, req.user!.userId);

    res.json({
      success: true,
      data: {
        invoice: updatedInvoice,
        messageId: result.messageId,
      },
      message: `Invoice emailed to ${recipientEmail}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('SMTP')) {
      res.status(503).json({
        success: false,
        error: 'EMAIL_SEND_FAILED',
        message: 'Failed to send email. Please check SMTP configuration.',
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/invoices/:id/paid
 * Mark invoice as paid
 */
router.post('/:id/paid', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  // NOTE(payments): Stripe webhook lands the auto-paid status flip via
  //   routes/stripe-webhook.ts + services/stripe.ts handleInvoicePaymentCompleted.
  //   This manual endpoint is retained for cash / out-of-band reconciliation cases.
  try {
    const id = req.params.id as string;
    const invoice = await invoicesService.markAsPaid(id, req.user!.userId);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found or not in sent/overdue status',
      });
      return;
    }

    res.json({
      success: true,
      data: { invoice },
      message: 'Invoice marked as paid',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/invoices/:id/share
 * Generate a shareable link for an invoice
 */
router.post('/:id/share', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const token = await invoicesService.generateShareToken(id, req.user!.userId);

    if (!token) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    // Build shareable URL
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${config.port}`;
    const shareUrl = `${baseUrl}/api/v1/public/invoices/${token}`;

    res.json({
      success: true,
      data: { shareUrl, token },
      message: 'Share link generated',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/invoices/:id/payment-link
 * Generate (or fetch the existing) Stripe Payment Link for an invoice.
 *
 * Used by the tradie to share a "Pay Now" URL with their client out-of-band
 * (e.g. by SMS). The public invoice page also uses the same link automatically
 * via getOrCreateInvoicePaymentLink — this endpoint just lets the tradie grab
 * the URL programmatically.
 */
router.post('/:id/payment-link', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    // Build success/cancel URLs from the API base URL + share token of this
    // invoice. Stripe will redirect the client back to the public invoice
    // page; the page reads invoice.status and shows the paid state once the
    // webhook has landed.
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${config.port}`;

    // Reuse the share-token generation flow so the redirect lands on the
    // public invoice page even if no token has been generated yet.
    const shareToken = await invoicesService.generateShareToken(id, req.user!.userId);
    if (!shareToken) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Invoice not found',
      });
      return;
    }

    const successUrl = `${baseUrl}/api/v1/public/invoices/${shareToken}?payment=success`;
    const cancelUrl = `${baseUrl}/api/v1/public/invoices/${shareToken}?payment=cancelled`;

    const link = await getOrCreateInvoicePaymentLink(id, req.user!.userId, {
      successUrl,
      cancelUrl,
    });

    if (!link) {
      res.status(503).json({
        success: false,
        error: 'PAYMENT_GATEWAY_UNAVAILABLE',
        message: 'Stripe is not configured on this server. Set STRIPE_SECRET_KEY to enable Payment Links.',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        paymentUrl: link.url,
        sessionId: link.sessionId,
      },
      message: 'Payment link ready',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
