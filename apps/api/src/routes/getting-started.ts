/**
 * Getting Started — checklist progress + product tour completion flags
 * GET  /api/v1/getting-started
 * POST /api/v1/getting-started/tour-complete
 * POST /api/v1/getting-started/dismiss
 * POST /api/v1/getting-started/reopen
 */

import { Router, Request, Response, NextFunction } from 'express';
import db from '../services/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

export type GettingStartedStepId =
  | 'businessProfile'
  | 'products'
  | 'customers'
  | 'invoice'
  | 'sendInvoice';

export interface GettingStartedStep {
  id: GettingStartedStepId;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export interface GettingStartedStatus {
  tourCompleted: boolean;
  checklistDismissed: boolean;
  allStepsDone: boolean;
  completedCount: number;
  totalCount: number;
  /** True when the client should auto-start the spotlight tour. */
  shouldStartTour: boolean;
  /** True when the dashboard checklist card should show. */
  showChecklist: boolean;
  steps: GettingStartedStep[];
}

async function loadStatus(userId: string): Promise<GettingStartedStatus> {
  const userResult = await db.query<{
    product_tour_completed_at: Date | null;
    getting_started_dismissed_at: Date | null;
  }>(
    `SELECT product_tour_completed_at, getting_started_dismissed_at
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number; code: string };
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const counts = await db.query<{
    products: string;
    customers: string;
    invoices: string;
    sent_invoices: string;
    has_company: string;
    has_bank: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM products_services WHERE user_id = $1 AND is_active = true) AS products,
       (SELECT COUNT(*)::text FROM customers WHERE user_id = $1 AND is_active = true) AS customers,
       (SELECT COUNT(*)::text FROM invoices WHERE user_id = $1) AS invoices,
       (SELECT COUNT(*)::text FROM invoices WHERE user_id = $1 AND status IN ('sent', 'paid', 'overdue')) AS sent_invoices,
       (SELECT CASE WHEN EXISTS (
          SELECT 1 FROM business_profiles
          WHERE user_id = $1
            AND company_name IS NOT NULL AND TRIM(company_name) <> ''
        ) THEN '1' ELSE '0' END) AS has_company,
       (SELECT CASE WHEN EXISTS (
          SELECT 1 FROM business_profiles
          WHERE user_id = $1
            AND bank_account_number IS NOT NULL AND TRIM(bank_account_number) <> ''
        ) THEN '1' ELSE '0' END) AS has_bank`,
    [userId],
  );

  const row = counts.rows[0];
  const productCount = parseInt(row?.products || '0', 10);
  const customerCount = parseInt(row?.customers || '0', 10);
  const invoiceCount = parseInt(row?.invoices || '0', 10);
  const sentCount = parseInt(row?.sent_invoices || '0', 10);
  const hasCompany = row?.has_company === '1';
  const hasBank = row?.has_bank === '1';

  const steps: GettingStartedStep[] = [
    {
      id: 'businessProfile',
      title: 'Add business & bank details',
      description: 'Your company name and bank account appear on every invoice.',
      href: '/settings',
      done: hasCompany && hasBank,
    },
    {
      id: 'products',
      title: 'Add what you sell',
      description: 'Create products or services with unit prices to reuse on invoices.',
      href: '/products/new',
      done: productCount > 0,
    },
    {
      id: 'customers',
      title: 'Add a client',
      description: 'Save who you bill so you can invoice them in one click.',
      href: '/customers/new',
      done: customerCount > 0,
    },
    {
      id: 'invoice',
      title: 'Create your first invoice',
      description: 'Pick a client, add line items from your products, set GST.',
      href: '/invoices/new',
      done: invoiceCount > 0,
    },
    {
      id: 'sendInvoice',
      title: 'Send or mark as sent',
      description: 'Email the PDF or mark the invoice sent so you can track payment.',
      href: '/invoices',
      done: sentCount > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const allStepsDone = completedCount === totalCount;
  const tourCompleted = !!user.product_tour_completed_at;
  const checklistDismissed = !!user.getting_started_dismissed_at;

  // Auto-complete tour server-side if they already finished the workflow
  // (e.g. imported data / power users) so it never re-prompts.
  if (allStepsDone && !tourCompleted) {
    await db.query(
      `UPDATE users SET product_tour_completed_at = COALESCE(product_tour_completed_at, NOW()),
                            getting_started_dismissed_at = COALESCE(getting_started_dismissed_at, NOW()),
                            updated_at = NOW()
       WHERE id = $1`,
      [userId],
    );
    return {
      tourCompleted: true,
      checklistDismissed: true,
      allStepsDone: true,
      completedCount,
      totalCount,
      shouldStartTour: false,
      showChecklist: false,
      steps,
    };
  }

  return {
    tourCompleted,
    checklistDismissed,
    allStepsDone,
    completedCount,
    totalCount,
    shouldStartTour: !tourCompleted && !allStepsDone,
    showChecklist: !checklistDismissed && !allStepsDone,
    steps,
  };
}

/**
 * GET /api/v1/getting-started
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await loadStatus(req.user!.userId);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/getting-started/tour-complete
 * Mark spotlight tour finished or skipped.
 */
router.post('/tour-complete', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `UPDATE users SET product_tour_completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND product_tour_completed_at IS NULL`,
      [req.user!.userId],
    );
    const status = await loadStatus(req.user!.userId);
    res.json({ success: true, data: status, message: 'Tour marked complete' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/getting-started/dismiss
 * Hide the dashboard checklist card (can reopen later).
 */
router.post('/dismiss', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `UPDATE users SET getting_started_dismissed_at = NOW(),
                            product_tour_completed_at = COALESCE(product_tour_completed_at, NOW()),
                            updated_at = NOW()
       WHERE id = $1`,
      [req.user!.userId],
    );
    const status = await loadStatus(req.user!.userId);
    res.json({ success: true, data: status, message: 'Getting started dismissed' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/getting-started/reopen
 * Show checklist again and optionally re-run tour (resets tour flag).
 * Body: { resetTour?: boolean }
 */
router.post('/reopen', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resetTour = !!(req.body && (req.body as { resetTour?: boolean }).resetTour);
    if (resetTour) {
      await db.query(
        `UPDATE users SET getting_started_dismissed_at = NULL,
                              product_tour_completed_at = NULL,
                              updated_at = NOW()
         WHERE id = $1`,
        [req.user!.userId],
      );
    } else {
      await db.query(
        `UPDATE users SET getting_started_dismissed_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [req.user!.userId],
      );
    }
    const status = await loadStatus(req.user!.userId);
    res.json({ success: true, data: status, message: 'Getting started reopened' });
  } catch (error) {
    next(error);
  }
});

export default router;
