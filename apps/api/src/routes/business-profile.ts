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

/** Empty / whitespace strings → undefined so optional fields don't fail Zod .email() etc. */
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const optionalText = z.preprocess(emptyToUndef, z.string().optional());
const optionalEmail = z.preprocess(
  emptyToUndef,
  z.string().email('Invalid email format').optional()
);

const upsertSchema = z.object({
  companyName: optionalText,
  tradingAs: optionalText,
  irdNumber: optionalText,
  gstNumber: optionalText,
  isGstRegistered: z.boolean().optional(),
  companyAddress: optionalText,
  companyPhone: optionalText,
  companyEmail: optionalEmail,
  bankAccountName: optionalText,
  bankAccountNumber: optionalText,
  bankName: optionalText,
  intlBankAccountName: optionalText,
  intlIban: optionalText,
  intlSwiftBic: optionalText,
  intlBankName: optionalText,
  intlBankAddress: optionalText,
  intlRoutingNumber: optionalText,
  defaultPaymentTerms: z.number().int().min(1).max(365).optional(),
  defaultNotes: optionalText,
  invoicePrefix: z.preprocess(emptyToUndef, z.string().max(10).optional()),
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
