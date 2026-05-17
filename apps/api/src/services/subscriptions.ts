/**
 * Subscription Service
 * Manages subscription tiers, usage tracking, and tier enforcement
 * Phase A: Free for all during beta, tier fields + limits ready
 * Phase B (~50 users): Stripe integration
 */

import db from './database.js';
import { SubscriptionTier, SubscriptionInfo, TierLimits, TierUsage } from '../types/index.js';
import { createError } from '../middleware/error.js';

// =============================================================================
// TIER DEFINITIONS
// =============================================================================

const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    tier: 'free',
    invoicesPerMonth: 3,
    swmsPerMonth: 2,
    aiCallsPerMonth: 5,
    teamMembers: null, // No team access
    pdfExport: false,
    emailInvoice: false,
    quotes: false,
    expenses: false,
    jobLogs: false,
    photos: false,
  },
  tradie: {
    tier: 'tradie',
    invoicesPerMonth: null, // unlimited
    swmsPerMonth: null, // unlimited
    aiCallsPerMonth: 50,
    teamMembers: null, // No team access (single user)
    pdfExport: true,
    emailInvoice: true,
    quotes: true,
    expenses: true,
    jobLogs: true,
    photos: true,
  },
  team: {
    tier: 'team',
    invoicesPerMonth: null, // unlimited
    swmsPerMonth: null, // unlimited
    aiCallsPerMonth: 200,
    teamMembers: 5,
    pdfExport: true,
    emailInvoice: true,
    quotes: true,
    expenses: true,
    jobLogs: true,
    photos: true,
  },
};

// Beta override: everyone gets tradie-level access for free.
// Env-driven so prod can toggle without a code change. Defaults to true (beta on)
// for safety — explicit BETA_MODE=false is required to enable real paid checkout.
// Evaluated at CALL time, not import time, so tests can pin the env per case
// without needing jest.resetModules() (the prior module-level const made
// `isBetaMode()` nondeterministic across test runs with mixed env state).
function isBetaModeFromEnv(): boolean {
  return process.env.BETA_MODE !== 'false';
}

// =============================================================================
// TIER INFO
// =============================================================================

/**
 * Get tier limits for a subscription tier
 * During beta, all users get tradie-level access
 */
export function getTierLimits(tier: SubscriptionTier): TierLimits {
  if (isBetaModeFromEnv()) {
    return { ...TIER_LIMITS.tradie, tier };
  }
  return TIER_LIMITS[tier];
}

/**
 * Get all tier definitions (for displaying pricing/features)
 */
export function getAllTiers(): TierLimits[] {
  return [TIER_LIMITS.free, TIER_LIMITS.tradie, TIER_LIMITS.team];
}

/**
 * Check if beta mode is active.
 * Reads `BETA_MODE` env var at call time — see `isBetaModeFromEnv` note above.
 */
export function isBetaMode(): boolean {
  return isBetaModeFromEnv();
}

// =============================================================================
// USER SUBSCRIPTION
// =============================================================================

/**
 * Get user subscription info
 */
export async function getUserSubscription(userId: string): Promise<SubscriptionInfo> {
  const result = await db.query<{
    subscription_tier: SubscriptionTier;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_started_at: Date | null;
    subscription_expires_at: Date | null;
  }>(
    `SELECT subscription_tier, stripe_customer_id, stripe_subscription_id,
            subscription_started_at, subscription_expires_at
     FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  const row = result.rows[0];
  return {
    tier: row.subscription_tier,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    startedAt: row.subscription_started_at,
    expiresAt: row.subscription_expires_at,
  };
}

/**
 * Update user subscription tier (admin/internal use)
 */
export async function updateSubscriptionTier(
  userId: string,
  tier: SubscriptionTier,
  stripeData?: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    startedAt?: Date;
    expiresAt?: Date;
  }
): Promise<SubscriptionInfo> {
  const fields: string[] = ['subscription_tier = $2'];
  const values: unknown[] = [userId, tier];
  let paramIndex = 3;

  if (stripeData?.stripeCustomerId !== undefined) {
    fields.push(`stripe_customer_id = $${paramIndex++}`);
    values.push(stripeData.stripeCustomerId);
  }
  if (stripeData?.stripeSubscriptionId !== undefined) {
    fields.push(`stripe_subscription_id = $${paramIndex++}`);
    values.push(stripeData.stripeSubscriptionId);
  }
  if (stripeData?.startedAt !== undefined) {
    fields.push(`subscription_started_at = $${paramIndex++}`);
    values.push(stripeData.startedAt);
  }
  if (stripeData?.expiresAt !== undefined) {
    fields.push(`subscription_expires_at = $${paramIndex++}`);
    values.push(stripeData.expiresAt);
  }

  fields.push('updated_at = NOW()');

  const result = await db.query<{
    subscription_tier: SubscriptionTier;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_started_at: Date | null;
    subscription_expires_at: Date | null;
  }>(
    `UPDATE users SET ${fields.join(', ')}
     WHERE id = $1 AND is_active = true
     RETURNING subscription_tier, stripe_customer_id, stripe_subscription_id,
               subscription_started_at, subscription_expires_at`,
    values
  );

  if (result.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  const row = result.rows[0];
  return {
    tier: row.subscription_tier,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    startedAt: row.subscription_started_at,
    expiresAt: row.subscription_expires_at,
  };
}

// =============================================================================
// USAGE TRACKING
// =============================================================================

/**
 * Get current month's usage for a user
 */
export async function getTierUsage(userId: string): Promise<TierUsage> {
  // Count invoices created this month
  const invoiceResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM invoices
     WHERE user_id = $1
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [userId]
  );

  // Count SWMS created this month
  const swmsResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM swms_documents
     WHERE user_id = $1
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [userId]
  );

  // Count AI calls this month
  const aiResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ai_usage_log
     WHERE user_id = $1
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [userId]
  );

  // Count team members (if user owns a team)
  const teamResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM team_members
     WHERE team_id IN (
       SELECT id FROM teams WHERE owner_id = $1
     )`,
    [userId]
  );

  return {
    invoicesThisMonth: parseInt(invoiceResult.rows[0].count, 10),
    swmsThisMonth: parseInt(swmsResult.rows[0].count, 10),
    aiCallsThisMonth: parseInt(aiResult.rows[0].count, 10),
    teamMemberCount: parseInt(teamResult.rows[0].count, 10),
  };
}

// =============================================================================
// LIMIT CHECKS
// =============================================================================

/**
 * Check if user can create an invoice (within tier limit)
 */
export async function canCreateInvoice(userId: string, tier: SubscriptionTier): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getTierLimits(tier);

  if (limits.invoicesPerMonth === null) {
    return { allowed: true };
  }

  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM invoices
     WHERE user_id = $1
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [userId]
  );

  const count = parseInt(result.rows[0].count, 10);
  if (count >= limits.invoicesPerMonth) {
    return {
      allowed: false,
      reason: `Free plan allows ${limits.invoicesPerMonth} invoices per month. Upgrade to Tradie plan for unlimited invoices.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can create a SWMS document (within tier limit)
 */
export async function canCreateSwms(userId: string, tier: SubscriptionTier): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getTierLimits(tier);

  if (limits.swmsPerMonth === null) {
    return { allowed: true };
  }

  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM swms_documents
     WHERE user_id = $1
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [userId]
  );

  const count = parseInt(result.rows[0].count, 10);
  if (count >= limits.swmsPerMonth) {
    return {
      allowed: false,
      reason: `Free plan allows ${limits.swmsPerMonth} SWMS documents per month. Upgrade to Tradie plan for unlimited.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use AI (within tier limit)
 */
export async function canUseAICall(userId: string, tier: SubscriptionTier): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getTierLimits(tier);

  if (limits.aiCallsPerMonth === null) {
    return { allowed: true };
  }

  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ai_usage_log
     WHERE user_id = $1
     AND created_at >= date_trunc('month', CURRENT_DATE)
     AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [userId]
  );

  const count = parseInt(result.rows[0].count, 10);
  if (count >= limits.aiCallsPerMonth) {
    return {
      allowed: false,
      reason: `You've used your ${limits.aiCallsPerMonth} monthly AI calls. Upgrade your plan to get more AI assistance.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can add a team member
 */
export async function canAddTeamMember(userId: string, tier: SubscriptionTier): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getTierLimits(tier);

  if (tier === 'free') {
    return {
      allowed: false,
      reason: 'Team features require the Team plan. Upgrade to add team members.',
    };
  }

  if (tier === 'tradie') {
    return {
      allowed: false,
      reason: 'Team features require the Team plan. Upgrade from Tradie to Team plan to add members.',
    };
  }

  if (limits.teamMembers === null) {
    return { allowed: true };
  }

  // Count non-owner team members only (owner is automatically a member but shouldn't count against the limit)
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     WHERE t.owner_id = $1
       AND tm.user_id != $1`,
    [userId]
  );

  const count = parseInt(result.rows[0].count, 10);
  if (count >= limits.teamMembers) {
    return {
      allowed: false,
      reason: `Team plan allows up to ${limits.teamMembers} additional team members. Contact support for larger teams.`,
    };
  }

  return { allowed: true };
}

/**
 * Record an AI call in the usage log
 */
export async function recordAICall(
  userId: string,
  action: string,
  model: string,
  provider: 'anthropic' | 'local'
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO ai_usage_log (user_id, action, model, provider)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, model, provider]
    );
  } catch (error) {
    // Best effort: don't break the application if logging fails
    console.error('[subscriptions] Failed to record AI call usage:', error);
  }
}

/**
 * Check if a feature is available for a tier
 */
export function isFeatureAvailable(tier: SubscriptionTier, feature: keyof Omit<TierLimits, 'tier' | 'invoicesPerMonth' | 'swmsPerMonth' | 'teamMembers'>): boolean {
  const limits = getTierLimits(tier);
  return limits[feature] as boolean;
}

export default {
  getTierLimits,
  getAllTiers,
  isBetaMode,
  getUserSubscription,
  updateSubscriptionTier,
  getTierUsage,
  canCreateInvoice,
  canCreateSwms,
  canUseAICall,
  recordAICall,
  canAddTeamMember,
  isFeatureAvailable,
};
