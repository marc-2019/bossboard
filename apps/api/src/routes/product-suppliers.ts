/**
 * Product supplier costs
 * /api/v1/products/:productId/suppliers
 *
 * costCents is the figure the tradie typed. An inclusive figure is converted
 * to ex-GST cents once in the service. Do not send the stored cost_ex_gst_cents
 * back as an inclusive costCents — that would convert it a second time.
 * This router never requests a supplier URL.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import productSuppliers from '../services/product-suppliers.js';
import type { AppError } from '../middleware/error.js';

const router = Router({ mergeParams: true });

const SNAKE_ALIASES: Record<string, string> = {
  supplier_name: 'supplierName',
  supplier_url: 'supplierUrl',
  supplier_sku: 'supplierSku',
  cost_cents: 'costCents',
  price_includes_gst: 'priceIncludesGst',
  source_tax_flag: 'sourceTaxFlag',
  checked_at: 'checkedAt',
  is_preferred: 'isPreferred',
};

function normalizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const source = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  for (const [snake, camel] of Object.entries(SNAKE_ALIASES)) {
    if (out[camel] === undefined && out[snake] !== undefined) {
      out[camel] = out[snake];
    }
  }
  return out;
}

const costCentsSchema = z.number().int().min(0).max(1_000_000_000_000);
const taxFlagSchema = z.enum(['inclusive', 'exclusive', 'unknown']);

function rejectUnresolvedTax(
  value: {
    source?: 'manual' | 'file';
    sourceTaxFlag?: 'inclusive' | 'exclusive' | 'unknown';
    priceIncludesGst?: boolean;
    costCents?: number;
  },
  ctx: z.RefinementCtx,
  costRequired: boolean,
): void {
  const taxTouched = value.priceIncludesGst !== undefined || value.sourceTaxFlag !== undefined;
  if (costRequired && !taxTouched) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tick whether the price includes GST.',
    });
  }
  if (!costRequired) {
    if (value.costCents !== undefined && !taxTouched) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the cost and say whether it includes GST. Send both together.',
      });
    }
    if (taxTouched && value.costCents === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the cost and say whether it includes GST. Send both together.',
      });
    }
  }
  if (value.sourceTaxFlag === 'unknown' && value.priceIncludesGst === undefined) {
    const source = value.source ?? 'manual';
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        source === 'manual'
          ? 'Say whether this price includes GST before saving.'
          : 'Confirm whether GST is included before saving this cost.',
    });
  }
}

const createSchema = z
  .object({
    supplierName: z.string().trim().min(1, 'Supplier name is required').max(120),
    supplierUrl: z.string().trim().max(2000).nullable().optional(),
    supplierSku: z.string().trim().max(80).nullable().optional(),
    gtin: z.string().trim().max(14).nullable().optional(),
    costCents: costCentsSchema,
    priceIncludesGst: z.boolean().optional(),
    sourceTaxFlag: taxFlagSchema.optional(),
    source: z.enum(['manual', 'file']).optional(),
    checkedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a real date, like 2026-11-19.')
      .nullable()
      .optional(),
    isPreferred: z.boolean().optional(),
    currency: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => rejectUnresolvedTax(value, ctx, true));

const updateSchema = z
  .object({
    supplierName: z.string().trim().min(1).max(120).optional(),
    supplierUrl: z.string().trim().max(2000).nullable().optional(),
    supplierSku: z.string().trim().max(80).nullable().optional(),
    gtin: z.string().trim().max(14).nullable().optional(),
    costCents: costCentsSchema.optional(),
    priceIncludesGst: z.boolean().optional(),
    sourceTaxFlag: taxFlagSchema.optional(),
    source: z.enum(['manual', 'file']).optional(),
    checkedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a real date, like 2026-11-19.')
      .nullable()
      .optional(),
    isPreferred: z.boolean().optional(),
    currency: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => rejectUnresolvedTax(value, ctx, false));

const productParamsSchema = z.object({
  productId: z.string().uuid('That product link is not valid.'),
});

const supplierParamsSchema = productParamsSchema.extend({
  supplierId: z.string().uuid('That supplier cost link is not valid.'),
});

function sendValidation(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    error: 'VALIDATION_ERROR',
    message: error.errors[0]?.message ?? 'Validation failed',
    details: error.errors,
  });
}

function sendKnownError(res: Response, error: unknown): boolean {
  if (error instanceof Error && 'statusCode' in error) {
    const appError = error as AppError;
    res.status(appError.statusCode ?? 500).json({
      success: false,
      error: appError.code || 'ERROR',
      message: appError.message,
    });
    return true;
  }
  return false;
}

/**
 * GET /api/v1/products/:productId/suppliers
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = productParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendValidation(res, params.error);
      return;
    }
    const suppliers = await productSuppliers.listSupplierCosts(
      req.user!.userId,
      params.data.productId,
    );
    res.json({ success: true, data: { suppliers } });
  } catch (error) {
    if (sendKnownError(res, error)) return;
    next(error);
  }
});

/**
 * POST /api/v1/products/:productId/suppliers
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = productParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendValidation(res, params.error);
      return;
    }
    const body = createSchema.safeParse(normalizeBody(req.body));
    if (!body.success) {
      sendValidation(res, body.error);
      return;
    }
    const result = await productSuppliers.createSupplierCost(
      req.user!.userId,
      params.data.productId,
      body.data,
    );
    res.status(201).json({
      success: true,
      data: result,
      message: 'Supplier cost saved',
    });
  } catch (error) {
    if (sendKnownError(res, error)) return;
    next(error);
  }
});

/**
 * GET /api/v1/products/:productId/suppliers/:supplierId
 */
router.get('/:supplierId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = supplierParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendValidation(res, params.error);
      return;
    }
    const supplier = await productSuppliers.getSupplierCost(
      req.user!.userId,
      params.data.productId,
      params.data.supplierId,
    );
    res.json({ success: true, data: { supplier } });
  } catch (error) {
    if (sendKnownError(res, error)) return;
    next(error);
  }
});

/**
 * PUT /api/v1/products/:productId/suppliers/:supplierId
 */
router.put('/:supplierId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = supplierParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendValidation(res, params.error);
      return;
    }
    const body = updateSchema.safeParse(normalizeBody(req.body));
    if (!body.success) {
      sendValidation(res, body.error);
      return;
    }
    const result = await productSuppliers.updateSupplierCost(
      req.user!.userId,
      params.data.productId,
      params.data.supplierId,
      body.data,
    );
    res.json({
      success: true,
      data: result,
      message: 'Supplier cost updated',
    });
  } catch (error) {
    if (sendKnownError(res, error)) return;
    next(error);
  }
});

/**
 * DELETE /api/v1/products/:productId/suppliers/:supplierId
 */
router.delete('/:supplierId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = supplierParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendValidation(res, params.error);
      return;
    }
    await productSuppliers.deleteSupplierCost(
      req.user!.userId,
      params.data.productId,
      params.data.supplierId,
    );
    res.json({ success: true, message: 'Supplier cost deleted' });
  } catch (error) {
    if (sendKnownError(res, error)) return;
    next(error);
  }
});

export default router;
