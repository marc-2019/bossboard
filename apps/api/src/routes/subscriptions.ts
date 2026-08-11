/**
 * Subscription Routes
 * Tier info, usage, and Stripe payment integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  getTierLimits,
  getAllTiers,
  isBetaMode,
  getUserSubscription,
  getTierUsage,
} from '../services/subscriptions.js';
import {
  createCheckoutSession,
  createPortalSession,
  createPaymentSheetSession,
} from '../services/stripe.js';
import { listIapProductCatalog, verifyAndActivateIap } from '../services/iap.js';
import { config } from '../config/index.js';
import db from '../services/database.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/subscriptions/tiers
 * Get all available tier definitions (for displaying pricing/features)
 */
router.get('/tiers', (_req: Request, res: Response) => {
  const tiers = getAllTiers();
  const beta = isBetaMode();

  res.json({
    success: true,
    data: {
      tiers,
      betaMode: beta,
      pricing: {
        free: { price: 0, period: 'forever' },
        tradie: { price: 4.99, period: 'week', monthlyEquivalent: 19.99, currency: 'NZD' },
        team: { price: 9.99, period: 'week', monthlyEquivalent: 39.99, currency: 'NZD' },
      },
    },
  });
});

/**
 * GET /api/v1/subscriptions/me
 * Get current user's subscription info + usage
 */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const [subscription, usage] = await Promise.all([
      getUserSubscription(userId),
      getTierUsage(userId),
    ]);

    const limits = getTierLimits(subscription.tier);
    const beta = isBetaMode();

    res.json({
      success: true,
      data: {
        subscription,
        limits,
        usage,
        betaMode: beta,
        // During beta, show what the user would get vs what they have access to
        ...(beta && {
          betaNote: 'All features are free during beta! Your tier will apply when beta ends.',
        }),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/subscriptions/usage
 * Get current month's usage for the authenticated user
 */
router.get('/usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const subscription = await getUserSubscription(userId);
    const usage = await getTierUsage(userId);
    const limits = getTierLimits(subscription.tier);

    res.json({
      success: true,
      data: {
        usage,
        limits: {
          invoicesPerMonth: limits.invoicesPerMonth,
          swmsPerMonth: limits.swmsPerMonth,
          aiCallsPerMonth: limits.aiCallsPerMonth,
          teamMembers: limits.teamMembers,
        },
        remaining: {
          invoices: limits.invoicesPerMonth === null ? null : Math.max(0, limits.invoicesPerMonth - usage.invoicesThisMonth),
          swms: limits.swmsPerMonth === null ? null : Math.max(0, limits.swmsPerMonth - usage.swmsThisMonth),
          aiCalls: limits.aiCallsPerMonth === null ? null : Math.max(0, limits.aiCallsPerMonth - usage.aiCallsThisMonth),
          teamMembers: limits.teamMembers === null ? null : Math.max(0, limits.teamMembers - usage.teamMemberCount),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/subscriptions/limits
 * Get tier limits for the current user's tier
 */
router.get('/limits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const subscription = await getUserSubscription(userId);
    const limits = getTierLimits(subscription.tier);

    res.json({
      success: true,
      data: {
        tier: subscription.tier,
        limits,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Stripe Integration
// =============================================================================

const checkoutSchema = z.object({
  tier: z.enum(['tradie', 'team']),
  // URLs the mobile app wants Stripe to redirect to after success/cancel
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * Prevent open redirects after Stripe Checkout — only allow configured app
 * domain, stripe return URL host, and localhost (dev).
 */
function sanitizeCheckoutRedirectUrl(requested: string | undefined, fallback: string): string {
  if (!requested) return fallback;
  try {
    const parsed = new URL(requested);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;
    // Disallow credentials in URL
    if (parsed.username || parsed.password) return fallback;
    const allowedHosts = new Set<string>(['localhost', '127.0.0.1']);
    try {
      if (config.appDomain) allowedHosts.add(new URL(config.appDomain).hostname);
    } catch { /* ignore bad APP_DOMAIN */ }
    try {
      if (config.stripe.returnUrl) allowedHosts.add(new URL(config.stripe.returnUrl).hostname);
    } catch { /* ignore */ }
    // Also allow common BossBoard production hosts if env incomplete
    allowedHosts.add('bossboard.instilligent.com');
    if (!allowedHosts.has(parsed.hostname)) return fallback;
    return requested;
  } catch {
    return fallback;
  }
}

/**
 * POST /api/v1/subscriptions/checkout
 * Create a Stripe Checkout session for upgrading to Tradie or Team tier.
 *
 * Returns { sessionId, url } — the mobile app should open `url` in a browser/WebView.
 * After payment, Stripe redirects to successUrl and fires a webhook to update the tier.
 */
router.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (isBetaMode()) {
      res.json({
        success: true,
        data: {
          message: 'All features are free during beta! No payment required.',
          betaMode: true,
        },
      });
      return;
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? 'Invalid request body',
      });
      return;
    }

    const { tier, successUrl, cancelUrl } = parsed.data;
    const userId = req.user!.userId;

    // Fetch user email + name for Stripe customer creation
    const userResult = await db.query<{ email: string; name: string | null }>(
      'SELECT email, name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      return;
    }

    const { email, name } = userResult.rows[0];
    const appReturnUrl = config.stripe.returnUrl;
    const safeSuccess = sanitizeCheckoutRedirectUrl(
      successUrl,
      `${appReturnUrl}/subscription/success`,
    );
    const safeCancel = sanitizeCheckoutRedirectUrl(
      cancelUrl,
      `${appReturnUrl}/subscription/cancel`,
    );

    const result = await createCheckoutSession({
      userId,
      userEmail: email,
      userName: name,
      tier,
      successUrl: safeSuccess,
      cancelUrl: safeCancel,
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
 * POST /api/v1/subscriptions/payment-sheet
 * Phase 2: native PaymentSheet (Apple Pay / Google Pay / card in-app).
 * Returns client secrets for @stripe/stripe-react-native.
 */
router.post('/payment-sheet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (isBetaMode()) {
      res.json({
        success: true,
        data: {
          message: 'All features are free during beta! No payment required.',
          betaMode: true,
        },
      });
      return;
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? 'Invalid request body',
      });
      return;
    }

    const { tier } = parsed.data;
    const userId = req.user!.userId;
    const userResult = await db.query<{ email: string; name: string | null }>(
      'SELECT email, name FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      return;
    }
    const { email, name } = userResult.rows[0];

    const result = await createPaymentSheetSession({
      userId,
      userEmail: email,
      userName: name,
      tier,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/subscriptions/iap/products
 * Catalog of App Store / Play product IDs for native IAP (store dual-rail).
 */
router.get('/iap/products', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      products: listIapProductCatalog(),
      note:
        'Native mobile upgrades use IAP only (no Stripe openURL). ' +
        'POST /iap/verify is fail-closed until IAP_APPLE_SHARED_SECRET / ' +
        'IAP_GOOGLE_SERVICE_ACCOUNT_JSON are set. See docs/product/native-iap-dual-rail.md',
    },
  });
});

const iapVerifySchema = z.object({
  platform: z.enum(['ios', 'android']),
  productId: z.string().min(1),
  transactionId: z.string().min(1),
  receiptOrToken: z.string().min(1),
});

/**
 * POST /api/v1/subscriptions/iap/verify
 * Verify store purchase and activate tier (fail-closed without credentials).
 */
router.post('/iap/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (isBetaMode()) {
      res.json({
        success: true,
        data: { betaMode: true, message: 'All features are free during beta!' },
      });
      return;
    }

    const parsed = iapVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? 'Invalid request body',
      });
      return;
    }

    const result = await verifyAndActivateIap({
      userId: req.user!.userId,
      ...parsed.data,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/subscriptions/portal
 * Create a Stripe Billing Portal session for managing subscription
 * (cancel, change plan, update payment method).
 *
 * Returns { url } — open in browser/WebView.
 * Requires the user to already have a Stripe customer ID (i.e. be on a paid plan).
 */
router.post('/portal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (isBetaMode()) {
      res.json({
        success: true,
        data: {
          message: 'Billing portal will be available when beta ends.',
          betaMode: true,
        },
      });
      return;
    }

    const userId = req.user!.userId;
    const subscription = await getUserSubscription(userId);

    if (!subscription.stripeCustomerId) {
      res.status(400).json({
        success: false,
        error: 'NO_STRIPE_CUSTOMER',
        message: 'No active subscription found. Start a subscription first via /subscriptions/checkout.',
      });
      return;
    }

    // Validate returnUrl to prevent open redirect — only allow configured domain or localhost
    const requestedUrl = (req.body as { returnUrl?: string }).returnUrl;
    let returnUrl = config.stripe.returnUrl;
    if (requestedUrl) {
      try {
        const parsed = new URL(requestedUrl);
        const allowedHosts = ['localhost', '127.0.0.1', ...(config.appDomain ? [new URL(config.appDomain).hostname] : [])];
        if (allowedHosts.includes(parsed.hostname)) {
          returnUrl = requestedUrl;
        }
      } catch { /* invalid URL, use default */ }
    }
    const portalUrl = await createPortalSession(subscription.stripeCustomerId, returnUrl);

    res.json({
      success: true,
      data: { url: portalUrl },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
