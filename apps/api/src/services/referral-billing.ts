/**
 * Apply free-month grants to billing rails (Stripe customer balance / IAP expiry).
 * DB free_months_balance is the stack source of truth; this is best-effort credit.
 */

import db from './database.js';
import { config } from '../config/index.js';

/** NZD cents for one month of each tier (published pricing). */
const MONTHLY_CENTS: Record<string, number> = {
  tradie: 1999,
  team: 3999,
};

/**
 * Credit the user for N free months on their billing rail.
 * - Stripe: customer balance credit (next invoice(s) absorb it)
 * - IAP / no Stripe: extend subscription_expires_at by ~30 days per month
 */
export async function applyFreeMonthBillingCredit(
  userId: string,
  months: number
): Promise<void> {
  if (months <= 0) return;

  const user = await db.query<{
    subscription_tier: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_expires_at: Date | null;
  }>(
    `SELECT subscription_tier, stripe_customer_id, stripe_subscription_id, subscription_expires_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (user.rows.length === 0) return;
  const row = user.rows[0];

  const centsPerMonth = MONTHLY_CENTS[row.subscription_tier] ?? MONTHLY_CENTS.tradie;
  const creditCents = centsPerMonth * months;

  if (row.stripe_customer_id && config.stripe?.secretKey) {
    try {
      // Lazy import to avoid circular deps with stripe service
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(config.stripe.secretKey, {
        apiVersion: '2025-02-24.acacia',
      });
      // Negative amount = credit on customer balance
      await stripe.customers.createBalanceTransaction(row.stripe_customer_id, {
        amount: -creditCents,
        currency: 'nzd',
        description: `BossBoard referral free month x${months}`,
        metadata: {
          bossboard_user_id: userId,
          kind: 'referral_free_month',
          months: String(months),
        },
      });
      // Best-effort audit: stamp latest grant row for this user
      await db.query(
        `UPDATE free_month_grants SET stripe_credit_cents = $1
         WHERE id = (
           SELECT id FROM free_month_grants
           WHERE user_id = $2
             AND reason IN ('referral_referrer', 'referral_referee')
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [creditCents, userId]
      ).catch(() => undefined);
      console.log(
        `[ReferralBilling] Stripe credit ${creditCents}c NZD for user ${userId} (${months} mo)`
      );
      return;
    } catch (err) {
      console.warn('[ReferralBilling] Stripe credit failed, falling back to expiry extend:', err);
    }
  }

  // IAP / fallback: extend expires_at
  const days = months * 30;
  await db.query(
    `UPDATE users
     SET subscription_expires_at = COALESCE(subscription_expires_at, NOW()) + ($1 || ' days')::interval,
         updated_at = NOW()
     WHERE id = $2`,
    [String(days), userId]
  );
  console.log(
    `[ReferralBilling] Extended subscription_expires_at by ${days}d for user ${userId}`
  );
}
