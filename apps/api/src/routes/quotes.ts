/**
 * Quote Routes
 * /api/v1/quotes/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import quotesService from '../services/quotes.js';
import pdfService from '../services/pdf.js';
import emailService from '../services/email.js';
import { getBusinessProfile } from '../services/business-profile.js';
import { authenticate } from '../middleware/auth.js';
import { attachSubscription, requireFeature } from '../middleware/subscription.js';
import {
  looksLikeInternalInvoiceNotes,
  INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
} from '../types/index.js';

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

const createSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  customerId: z.string().uuid().optional(),
  jobDescription: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  includeGst: z.boolean().optional().default(true),
  validUntil: z.string().optional(), // ISO date string
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  /** Customer-facing (PDF) */
  notes: z.string().optional(),
  /** Staff-only — never on PDF */
  internalMemo: z.string().optional(),
});

const updateSchema = z.object({
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().email().optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  customerId: z.string().uuid().optional().nullable(),
  jobDescription: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  includeGst: z.boolean().optional(),
  validUntil: z.string().optional().nullable(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  notes: z.string().optional(),
  internalMemo: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/quotes
 * Create a new quote
 */
router.post('/', authenticate, attachSubscription, requireFeature('quotes'), async (req: Request, res: Response, next: NextFunction) => {
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

    // Customer notes only — internal memo can hold seed/test text freely
    if (looksLikeInternalInvoiceNotes(input.notes)) {
      res.status(400).json({
        success: false,
        error: 'NOTES_NOT_CUSTOMER_READY',
        message: INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
      });
      return;
    }

    const quote = await quotesService.createQuote(req.user!.userId, input);

    res.status(201).json({
      success: true,
      data: { quote },
      message: 'Quote created successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/quotes
 * List user's quotes
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit, offset } = req.query;

    const result = await quotesService.listQuotes(req.user!.userId, {
      status: status as 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted' | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
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
 * GET /api/v1/quotes/:id
 * Get specific quote
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const quote = await quotesService.getQuoteById(id, req.user!.userId);

    if (!quote) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { quote },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/quotes/:id/pdf
 * Download quote as PDF
 */
router.get('/:id/pdf', authenticate, attachSubscription, requireFeature('quotes'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const quote = await quotesService.getQuoteByIdRaw(id, req.user!.userId);

    if (!quote) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
      });
      return;
    }

    // Use the invoice PDF generator with quote data (same format)
    const pdfBuffer = await pdfService.generateQuotePDF(quote);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Quote-${quote.quoteNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/quotes/:id
 * Update quote (only draft quotes)
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

    if (looksLikeInternalInvoiceNotes(validation.data.notes)) {
      res.status(400).json({
        success: false,
        error: 'NOTES_NOT_CUSTOMER_READY',
        message: INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
      });
      return;
    }

    const id = req.params.id as string;
    const quote = await quotesService.updateQuote(
      id,
      req.user!.userId,
      validation.data
    );

    if (!quote) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { quote },
      message: 'Quote updated successfully',
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
 * DELETE /api/v1/quotes/:id
 * Delete quote
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const deleted = await quotesService.deleteQuote(id, req.user!.userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Quote deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/quotes/:id/send
 * Mark quote as sent
 */
router.post('/:id/send', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const quote = await quotesService.markAsSent(id, req.user!.userId);

    if (!quote) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found or not in draft status',
      });
      return;
    }

    res.json({
      success: true,
      data: { quote },
      message: 'Quote marked as sent',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/quotes/:id/email
 * Email quote PDF to client (marks draft → sent)
 */
router.post(
  '/:id/email',
  authenticate,
  attachSubscription,
  requireFeature('emailInvoice'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const { recipientEmail, customMessage } = req.body as {
        recipientEmail?: string;
        customMessage?: string;
      };

      if (!recipientEmail || !z.string().email().safeParse(recipientEmail).success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'A valid recipient email address is required',
        });
        return;
      }

      if (!emailService.isEmailConfigured()) {
        res.status(503).json({
          success: false,
          error: 'EMAIL_NOT_CONFIGURED',
          message: 'Email sending is not configured. Set RESEND_API_KEY environment variable.',
        });
        return;
      }

      const quote = await quotesService.getQuoteByIdRaw(id, req.user!.userId);
      if (!quote) {
        res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Quote not found',
        });
        return;
      }

      if (looksLikeInternalInvoiceNotes(quote.notes)) {
        res.status(400).json({
          success: false,
          error: 'NOTES_NOT_CUSTOMER_READY',
          message: INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
        });
        return;
      }

      const profile = await getBusinessProfile(req.user!.userId);
      const senderName = (profile?.company_name as string) || '';
      const bccEmail = emailService.resolveInvoiceBcc({
        invoiceBccEmail: (profile?.invoice_bcc_email as string) || null,
        companyEmail: (profile?.company_email as string) || null,
        userEmail: req.user?.email || null,
        recipientEmail,
      });

      const pdfBuffer = await pdfService.generateQuotePDF(quote);
      const result = await emailService.sendQuoteEmail(
        quote,
        pdfBuffer,
        recipientEmail,
        senderName,
        customMessage,
        bccEmail ? { bcc: bccEmail } : undefined
      );

      if (quote.status === 'draft') {
        await quotesService.markAsSent(id, req.user!.userId);
      }

      const updated = await quotesService.getQuoteById(id, req.user!.userId);
      const message = bccEmail
        ? `Quote emailed to ${recipientEmail} (BCC ${bccEmail})`
        : `Quote emailed to ${recipientEmail}`;

      res.json({
        success: true,
        data: {
          quote: updated,
          messageId: result.messageId,
          bccEmail: bccEmail || null,
        },
        message,
      });
    } catch (error) {
      if (error instanceof Error && /SMTP|Resend/i.test(error.message)) {
        res.status(503).json({
          success: false,
          error: 'EMAIL_SEND_FAILED',
          message: 'Could not send the quote email. Please try again.',
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * POST /api/v1/quotes/:id/accept
 * Mark quote as accepted
 */
router.post('/:id/accept', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const quote = await quotesService.markAsAccepted(id, req.user!.userId);

    if (!quote) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found or not in sent status',
      });
      return;
    }

    res.json({
      success: true,
      data: { quote },
      message: 'Quote marked as accepted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/quotes/:id/decline
 * Mark quote as declined
 */
router.post('/:id/decline', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const quote = await quotesService.markAsDeclined(id, req.user!.userId);

    if (!quote) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found or not in sent status',
      });
      return;
    }

    res.json({
      success: true,
      data: { quote },
      message: 'Quote marked as declined',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/quotes/:id/convert
 * Convert quote to invoice
 */
router.post('/:id/convert', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await quotesService.convertToInvoice(id, req.user!.userId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
      });
      return;
    }

    res.json({
      success: true,
      data: result,
      message: 'Quote converted to invoice successfully',
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

export default router;
