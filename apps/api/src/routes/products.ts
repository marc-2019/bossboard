/**
 * Products/Services Routes
 * /api/v1/products/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import productsService from '../services/products.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const productTypes = ['fixed', 'variable'] as const;

const createSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  unitPrice: z.number().int().min(0, 'Price must be a positive number in cents'),
  unitCost: z.number().int().min(0).nullable().optional(),
  defaultMarginPercent: z.number().min(0).max(1000).nullable().optional(),
  type: z.enum(productTypes).optional(),
  isGstApplicable: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  unitPrice: z.number().int().min(0).optional(),
  unitCost: z.number().int().min(0).nullable().optional(),
  defaultMarginPercent: z.number().min(0).max(1000).nullable().optional(),
  type: z.enum(productTypes).optional(),
  isGstApplicable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/products
 * Create a new product/service
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

    const product = await productsService.createProduct(
      req.user!.userId,
      validation.data
    );

    res.status(201).json({
      success: true,
      data: { product },
      message: 'Product created successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/products
 * List user's products/services
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, type, limit, offset } = req.query;

    const result = await productsService.listProducts(
      req.user!.userId,
      {
        search: search as string | undefined,
        type: type as 'fixed' | 'variable' | undefined,
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
 * GET /api/v1/products/:id
 * Get specific product/service
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const product = await productsService.getProductById(
      id,
      req.user!.userId
    );

    if (!product) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Product not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/products/:id
 * Update product/service
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
    const product = await productsService.updateProduct(
      id,
      req.user!.userId,
      validation.data
    );

    if (!product) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Product not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { product },
      message: 'Product updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/products/:id
 * Soft-delete product/service
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const deleted = await productsService.deleteProduct(
      id,
      req.user!.userId
    );

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Product not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Product deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
