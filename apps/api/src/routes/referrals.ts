/**
 * Referral routes — SaaS free-month friend program
 * /api/v1/referrals/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  getReferralMe,
  attachReferralCode,
  lookupReferralCode,
} from '../services/referrals.js';

const router = Router();

/**
 * GET /api/v1/referrals/lookup/:code
 * Public — validate a code before signup.
 */
router.get('/lookup/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const found = await lookupReferralCode(String(req.params.code || ''));
    if (!found) {
      res.status(404).json({
        success: false,
        error: 'REFERRAL_CODE_INVALID',
        message: 'Invalid referral code',
      });
      return;
    }
    res.json({
      success: true,
      data: {
        code: found.code,
        referrerName: found.referrerName,
        offerCopy:
          'Give a mate a free month of BossBoard — when they pay, you both get a free month.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Remaining routes require auth
router.use(authenticate);

/**
 * GET /api/v1/referrals/me
 * Paid users get code + share URL; everyone sees freeMonthsBalance.
 */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getReferralMe(req.user!.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

const attachSchema = z.object({
  code: z.string().min(4).max(32),
});

/**
 * POST /api/v1/referrals/attach
 * Attach a friend code before paid activation.
 */
router.post('/attach', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = attachSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? 'Invalid code',
      });
      return;
    }
    const result = await attachReferralCode(req.user!.userId, parsed.data.code);
    res.json({
      success: true,
      data: result,
      message: 'Referral code saved. When you subscribe, you and your mate both get a free month.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
