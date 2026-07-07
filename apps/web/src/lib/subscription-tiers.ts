/**
 * Pure display logic for subscription tiers.
 *
 * Everything here derives strictly from the API's /subscriptions/tiers
 * response (tier limits + pricing + beta flag). No prices, limits, or
 * features are hardcoded — if the backend TIER_LIMITS change, this renders
 * the new truth. Kept free of React/Next imports so it can be unit-tested
 * with `node --test` (see __tests__/subscription-tiers.test.ts).
 */

import type { SubscriptionTier, TierLimits } from '@bossboard/shared';

// ---------------------------------------------------------------------------
// API response shapes (GET /api/v1/subscriptions/tiers et al.)
// ---------------------------------------------------------------------------

export interface TierPricing {
  price: number;
  period: string; // 'forever' | 'week'
  monthlyEquivalent?: number;
  currency?: string; // 'NZD'
}

export interface TiersPayload {
  tiers: TierLimits[];
  betaMode: boolean;
  pricing: Partial<Record<SubscriptionTier, TierPricing>>;
}

/** POST /subscriptions/checkout — beta short-circuit vs real Stripe session. */
export interface CheckoutBetaResponse {
  betaMode: true;
  message: string;
}
export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}
export type CheckoutResponse = CheckoutBetaResponse | CheckoutSessionResponse;

export function isBetaCheckout(r: CheckoutResponse): r is CheckoutBetaResponse {
  return (r as CheckoutBetaResponse).betaMode === true;
}

/** POST /subscriptions/portal — beta short-circuit vs real portal URL. */
export type PortalResponse = { betaMode: true; message: string } | { url: string };

export function isBetaPortal(r: PortalResponse): r is { betaMode: true; message: string } {
  return (r as { betaMode?: boolean }).betaMode === true;
}

// ---------------------------------------------------------------------------
// Display model
// ---------------------------------------------------------------------------

export interface TierDisplay {
  tier: SubscriptionTier;
  name: string;
  /** e.g. "$0" or "$4.99" */
  priceLabel: string;
  /** e.g. "forever" or "per week" */
  periodLabel: string;
  /** e.g. "~$19.99/month" or null when no monthly equivalent (free tier) */
  monthlyLabel: string | null;
  /** Feature lines derived from the tier's limits object */
  features: string[];
  isPaid: boolean;
}

export function tierName(tier: SubscriptionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatAmount(n: number): string {
  // Whole dollars render without cents ($0), otherwise 2dp ($4.99).
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function formatPricing(pricing: TierPricing | undefined): {
  priceLabel: string;
  periodLabel: string;
  monthlyLabel: string | null;
} {
  if (!pricing) {
    // Tier present but no pricing entry — render an honest placeholder
    // rather than inventing a number.
    return { priceLabel: '—', periodLabel: '', monthlyLabel: null };
  }
  const priceLabel = formatAmount(pricing.price);
  // 'forever' is never rendered: the free-forever qualifier was recalled
  // 2026-05-11 (marketing-truths.json recall_history, Rule G). Use the
  // approved landing copy "to get started" instead.
  const periodLabel = pricing.period === 'forever' ? 'to get started' : `per ${pricing.period}`;
  const monthlyLabel =
    pricing.monthlyEquivalent != null
      ? `~${formatAmount(pricing.monthlyEquivalent)}/month`
      : null;
  return { priceLabel, periodLabel, monthlyLabel };
}

/**
 * Turn a TierLimits object into human-readable feature lines.
 * Only states what the limits object actually grants.
 */
export function featureLines(limits: TierLimits): string[] {
  const lines: string[] = [];

  lines.push(
    limits.invoicesPerMonth === null
      ? 'Unlimited invoices'
      : `${limits.invoicesPerMonth} invoices / month`,
  );
  lines.push(
    limits.swmsPerMonth === null
      ? 'Unlimited SWMS'
      : `${limits.swmsPerMonth} SWMS / month`,
  );
  lines.push(
    limits.aiCallsPerMonth === null
      ? 'Unlimited AI calls'
      : `${limits.aiCallsPerMonth} AI calls / month`,
  );

  if (limits.quotes) lines.push('Quotes & estimates');
  if (limits.expenses) lines.push('Expense tracking');
  if (limits.jobLogs) lines.push('Job logs & time tracking');
  if (limits.photos) lines.push('Photo attachments');
  if (limits.pdfExport) lines.push('PDF export');
  if (limits.emailInvoice) lines.push('Email invoices');

  lines.push(
    limits.teamMembers === null
      ? 'Single user'
      : `Up to ${limits.teamMembers} team members`,
  );

  return lines;
}

const TIER_ORDER: SubscriptionTier[] = ['free', 'tradie', 'team'];

/** Rank used for upgrade-vs-downgrade labelling. Unknown tiers rank lowest. */
export function tierRank(tier: SubscriptionTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Build the ordered display models for the pricing/subscription pages from
 * the raw /subscriptions/tiers payload.
 */
export function buildTierDisplays(payload: TiersPayload): TierDisplay[] {
  const byTier = new Map(payload.tiers.map((t) => [t.tier, t]));
  const ordered = [
    ...TIER_ORDER.filter((t) => byTier.has(t)),
    ...payload.tiers.map((t) => t.tier).filter((t) => !TIER_ORDER.includes(t)),
  ];

  return ordered.map((tier) => {
    const limits = byTier.get(tier)!;
    const { priceLabel, periodLabel, monthlyLabel } = formatPricing(payload.pricing[tier]);
    return {
      tier,
      name: tierName(tier),
      priceLabel,
      periodLabel,
      monthlyLabel,
      features: featureLines(limits),
      isPaid: (payload.pricing[tier]?.price ?? 0) > 0,
    };
  });
}

/**
 * Usage meter percentage. Returns null when the limit is unlimited (null)
 * or zero (nothing to meter) — callers hide the bar in that case.
 */
export function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(Math.round((used / limit) * 100), 100);
}
