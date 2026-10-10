/**
 * Recurring Invoices Routes
 * /api/v1/recurring-invoices/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import recurringInvoicesService from '../services/recurring-invoices.js';
import {
  MAX_INVOICE_LINE_AMOUNT_CENTS,
  lineProductExceedsInvoiceCap,
  sumExceedsInvoiceCap,
} from '../services/invoice-integer-cap.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const productTypes = ['fixed', 'variable'] as const;

const lineItemSchema = z.object({
  productServiceId: z.string().uuid(),
  description: z.string().optional(),
  unitPrice: z.number().int().min(0).max(MAX_INVOICE_LINE_AMOUNT_CENTS),
  quantity: z.number().int().min(1).max(2_147_483_647).optional(),
  type: z.enum(productTypes),
}).superRefine((item, ctx) => {
  const quantity = item.quantity ?? 1;
  if (lineProductExceedsInvoiceCap(item.unitPrice, quantity)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Line total exceeds the maximum',
      path: ['unitPrice'],
    });
  }
});

function rejectOversizedRecurringTotal(
  lineItems: { unitPrice: number; quantity?: number }[] | undefined,
  ctx: z.RefinementCtx
): void {
  if (!lineItems) return;
  const amounts = lineItems.map((item) => item.unitPrice * (item.quantity ?? 1));
  if (sumExceedsInvoiceCap(amounts)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Total exceeds the maximum',
      path: ['lineItems'],
    });
  }
}

const createSchema = z.object({
  customerId: z.string().uuid('Valid customer ID is required'),
  name: z.string().min(1, 'Name is required'),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  includeGst: z.boolean().optional(),
  paymentTerms: z.number().int().min(1).max(365).optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
}).superRefine((data, ctx) => {
  rejectOversizedRecurringTotal(data.lineItems, ctx);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  includeGst: z.boolean().optional(),
  paymentTerms: z.number().int().min(1).max(365).optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
}).superRefine((data, ctx) => {
  rejectOversizedRecurringTotal(data.lineItems, ctx);
});

// Cap is the largest cents value whose 15% GST total still fits in
// PostgreSQL INTEGER (invoices.subtotal / gst_amount / total). See
// invoice-integer-cap.ts. Line-id keys are the full line amount.
// Product-id keys are per-unit; generateInvoiceFromRecurring also rejects
// the quantity-multiplied amount when it exceeds this cap.
const generateSchema = z.object({
  variableAmounts: z.record(
    z.string(),
    z.number().int().min(0).max(MAX_INVOICE_LINE_AMOUNT_CENTS)
  ).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

const fromInvoiceSchema = z.object({
  name: z.string().min(1).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  includeGst: z.boolean().optional(),
  paymentTerms: z.number().int().min(1).max(365).optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/v1/recurring-invoices/from-invoice/:invoiceId
 * Create a monthly template from an existing invoice (requires linked customer).
 */
router.post(
  '/from-invoice/:invoiceId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = fromInvoiceSchema.safeParse(req.body || {});
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: validation.error.errors[0].message,
        });
        return;
      }

      const invoiceId = req.params.invoiceId as string;
      const recurring = await recurringInvoicesService.createRecurringFromInvoice(
        req.user!.userId,
        invoiceId,
        validation.data
      );

      res.status(201).json({
        success: true,
        data: { recurring },
        message: 'Recurring template created from invoice',
      });
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) {
        const appError = error as Error & { statusCode: number; code?: string };
        res.status(appError.statusCode).json({
          success: false,
          error: appError.code || 'ERROR',
          message: appError.message,
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * POST /api/v1/recurring-invoices
 * Create a recurring invoice with line items
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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

    const recurring = await recurringInvoicesService.createRecurringInvoice(
      req.user!.userId,
      validation.data
    );

    res.status(201).json({
      success: true,
      data: { recurring, recurringInvoice: recurring },
      message: 'Recurring invoice created successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/recurring-invoices
 * List recurring invoices
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset } = req.query;

    const result = await recurringInvoicesService.listRecurringInvoices(
      req.user!.userId,
      {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/recurring-invoices/pending
 * Get recurring invoices that are due for generation
 */
router.get('/pending', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await recurringInvoicesService.getPendingRecurringInvoices(
      req.user!.userId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/recurring-invoices/:id
 * Get recurring invoice detail with customer and line items
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const recurring = await recurringInvoicesService.getRecurringInvoiceById(
      id,
      req.user!.userId
    );

    if (!recurring) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Recurring invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { recurring, recurringInvoice: recurring },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/recurring-invoices/:id
 * Update recurring invoice
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
    const recurring = await recurringInvoicesService.updateRecurringInvoice(
      id,
      req.user!.userId,
      validation.data
    );

    if (!recurring) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Recurring invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { recurring, recurringInvoice: recurring },
      message: 'Recurring invoice updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/recurring-invoices/:id
 * Delete recurring invoice
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const deleted = await recurringInvoicesService.deleteRecurringInvoice(
      id,
      req.user!.userId
    );

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Recurring invoice not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Recurring invoice deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/recurring-invoices/:id/generate
 * Generate a draft invoice from recurring config
 */
router.post('/:id/generate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = generateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const id = req.params.id as string;
    const invoice = await recurringInvoicesService.generateInvoiceFromRecurring(
      id,
      req.user!.userId,
      validation.data.variableAmounts
    );

    res.status(201).json({
      success: true,
      data: { invoice },
      message: 'Draft invoice generated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/recurring-invoices/:id/last-amounts
 * Get previous invoice's line item amounts as reference
 */
router.get('/:id/last-amounts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const lastAmounts = await recurringInvoicesService.getLastAmounts(
      id,
      req.user!.userId
    );

    res.json({
      success: true,
      data: { lastAmounts },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
