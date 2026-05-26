/**
 * Subscription Middleware
 * Tier enforcement, feature gating, and usage limit checks
 * Phase A: Beta mode (everyone gets tradie access), fields + limits ready
 * Phase B (~50 users): Stripe integration enforces real tiers
 */

import { Request, Response, NextFunction } from 'express';
import { SubscriptionTier } from '../types/index.js';
import {
  canCreateInvoice,
  canCreateSwms,
  canUseAICall,
  canAddTeamMember,
  isFeatureAvailable,
  getUserSubscription,
} from '../services/subscriptions.js';

/**
 * Attach subscription tier to request from database
 * Must be used after authenticate middleware
 * Loads the user's tier and caches it on req for downstream middleware
 */
export async function attachSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
      return;
    }

    const subscription = await getUserSubscription(req.user.userId);
    // Attach tier to the request for downstream use
    (req as any).subscriptionTier = subscription.tier;
    next();
  } catch (error: any) {
    if (error.statusCode === 404) {
      res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }
    next(error);
  }
}

/**
 * Require minimum subscription tier
 * Usage: requireTier('tradie') - requires tradie or team
 *        requireTier('team') - requires team only
 * Must be used after attachSubscription middleware
 */
export function requireTier(...allowedTiers: SubscriptionTier[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tier = (req as any).subscriptionTier as SubscriptionTier | undefined;

    if (!tier) {
      res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscription information not available',
      });
      return;
    }

    // Check tier hierarchy: team > tradie > free
    const tierLevel: Record<SubscriptionTier, number> = {
      free: 0,
      tradie: 1,
      team: 2,
    };

    const userLevel = tierLevel[tier];
    const minLevel = Math.min(...allowedTiers.map(t => tierLevel[t]));

    if (userLevel < minLevel) {
      const tierNames = allowedTiers.join(' or ');
      res.status(403).json({
        success: false,
        error: 'TIER_REQUIRED',
        message: `This feature requires the ${tierNames} plan. Upgrade to access this feature.`,
        data: {
          currentTier: tier,
          requiredTiers: allowedTiers,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Require a specific feature to be available on the user's tier
 * Usage: requireFeature('pdfExport')
 *        requireFeature('quotes')
 * Must be used after attachSubscription middleware
 */
export function requireFeature(feature: 'pdfExport' | 'emailInvoice' | 'quotes' | 'expenses' | 'jobLogs' | 'photos') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tier = (req as any).subscriptionTier as SubscriptionTier | undefined;

    if (!tier) {
      res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscription information not available',
      });
      return;
    }

    if (!isFeatureAvailable(tier, feature)) {
      const featureNames: Record<string, string> = {
        pdfExport: 'PDF export',
        emailInvoice: 'email invoicing',
        quotes: 'quotes',
        expenses: 'expense tracking',
        jobLogs: 'job logging',
        photos: 'photo attachments',
      };

      res.status(403).json({
        success: false,
        error: 'FEATURE_NOT_AVAILABLE',
        message: `${featureNames[feature] || feature} requires the Tradie plan or higher. Upgrade to access this feature.`,
        data: {
          currentTier: tier,
          feature,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Check usage limits before allowing resource creation
 * Usage: checkLimit('invoice') - checks invoice creation limit
 *        checkLimit('swms') - checks SWMS creation limit
 *        checkLimit('teamMember') - checks team member limit
 *        checkLimit('aiCall') - checks AI call limit
 * Must be used after attachSubscription middleware
 */
export function checkLimit(resource: 'invoice' | 'swms' | 'teamMember' | 'aiCall') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tier = (req as any).subscriptionTier as SubscriptionTier | undefined;
    const userId = req.user?.userId;

    if (!tier || !userId) {
      res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'Subscription information not available',
      });
      return;
    }

    try {
      let result: { allowed: boolean; reason?: string };

      switch (resource) {
        case 'invoice':
          result = await canCreateInvoice(userId, tier);
          break;
        case 'swms':
          result = await canCreateSwms(userId, tier);
          break;
        case 'aiCall':
          result = await canUseAICall(userId, tier);
          break;
        case 'teamMember':
          result = await canAddTeamMember(userId, tier);
          break;
        default:
          result = { allowed: true };
      }

      if (!result.allowed) {
        // Return 403 Forbidden for limit reached
        res.status(403).json({
          success: false,
          error: 'LIMIT_REACHED',
          message: result.reason || 'You have reached the limit for this resource on your current plan.',
          data: {
            currentTier: tier,
            resource,
          },
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export default {
  attachSubscription,
  requireTier,
  requireFeature,
  checkLimit,
};
