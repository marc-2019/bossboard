/**
 * Business Profile Routes
 * /api/v1/business-profile/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import businessProfileService from '../services/business-profile.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const upsertSchema = z.object({
  companyName: z.string().optional(),
  tradingAs: z.string().optional(),
  irdNumber: z.string().optional(),
  gstNumber: z.string().optional(),
  isGstRegistered: z.boolean().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().email('Invalid email format').optional(),
  /** Optional BCC for invoice emails; leave unset to fall back to company email / account email */
  invoiceBccEmail: z
    .union([z.string().email('Invalid BCC email format'), z.literal('')])
    .optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  intlBankAccountName: z.string().optional(),
  intlIban: z.string().optional(),
  intlSwiftBic: z.string().optional(),
  intlBankName: z.string().optional(),
  intlBankAddress: z.string().optional(),
  intlRoutingNumber: z.string().optional(),
  defaultPaymentTerms: z.number().int().min(1).max(365).optional(),
  defaultNotes: z.string().optional(),
  invoicePrefix: z.string().max(10).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/business-profile
 * Get user's business profile (or null if not set up)
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await businessProfileService.getBusinessProfile(
      req.user!.userId
    );

    res.json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/business-profile
 * Upsert business profile (create or update)
 */
router.put('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = upsertSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    const profile = await businessProfileService.upsertBusinessProfile(
      req.user!.userId,
      validation.data
    );

    res.json({
      success: true,
      data: { profile },
      message: 'Business profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
