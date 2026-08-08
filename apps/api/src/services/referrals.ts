/**
 * SaaS referral + free-month grants
 *
 * Rules (Marc 2026-08-08):
 *  - Any paid user can refer (tradie | team)
 *  - Friend link: on referee paid activation, BOTH get +1 free month
 *  - Stack free months with hard cap 12
 *  - One redemption per referee; no self-referral
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import { createError } from '../middleware/error.js';
import { config } from '../config/index.js';
import type { SubscriptionTier } from '../types/index.js';

const FREE_MONTH_CAP = 12;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export type FreeMonthGrantReason =
  | 'referral_referrer'
  | 'referral_referee'
  | 'bug_hunt'
  | 'manual';

export interface ReferralMeResponse {
  eligible: boolean;
  code: string | null;
  shareUrl: string | null;
  freeMonthsBalance: number;
  pendingReferralCode: string | null;
  stats: {
    pending: number;
    activated: number;
  };
  offerCopy: string;
}

function isPaidTier(tier: string | null | undefined): boolean {
  return tier === 'tradie' || tier === 'team';
}

function publicAppBase(): string {
  // Prefer configured return URL host (web app)
  const ret = config.stripe?.returnUrl || process.env.APP_URL || 'https://bossboard.instilligent.com';
  try {
    const u = new URL(ret);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://bossboard.instilligent.com';
  }
}

function generateCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `BB${out}`;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Ensure paid user has a referral code; create if missing.
 */
export async function ensureReferralCode(userId: string): Promise<{ code: string; shareUrl: string }> {
  const user = await db.query<{ subscription_tier: SubscriptionTier }>(
    'SELECT subscription_tier FROM users WHERE id = $1 AND is_active = true',
    [userId]
  );
  if (user.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }
  if (!isPaidTier(user.rows[0].subscription_tier)) {
    throw createError(
      'Only paid BossBoard subscribers can invite mates',
      403,
      'REFERRAL_NOT_ELIGIBLE'
    );
  }

  const existing = await db.query<{ code: string }>(
    'SELECT code FROM referral_codes WHERE user_id = $1',
    [userId]
  );
  if (existing.rows.length > 0) {
    const code = existing.rows[0].code;
    return { code, shareUrl: `${publicAppBase()}/r/${code}` };
  }

  // Insert with rare collision retry
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await db.query(
        `INSERT INTO referral_codes (id, user_id, code) VALUES ($1, $2, $3)`,
        [uuidv4(), userId, code]
      );
      return { code, shareUrl: `${publicAppBase()}/r/${code}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('referral_codes_code_key') || msg.includes('unique')) {
        continue;
      }
      throw err;
    }
  }
  throw createError('Could not generate referral code', 500, 'REFERRAL_CODE_GEN_FAILED');
}

export async function getReferralMe(userId: string): Promise<ReferralMeResponse> {
  const user = await db.query<{
    subscription_tier: SubscriptionTier;
    free_months_balance: number;
    pending_referral_code: string | null;
  }>(
    `SELECT subscription_tier,
            COALESCE(free_months_balance, 0) AS free_months_balance,
            pending_referral_code
     FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );
  if (user.rows.length === 0) {
    throw createError('User not found', 404, 'USER_NOT_FOUND');
  }

  const row = user.rows[0];
  const eligible = isPaidTier(row.subscription_tier);
  let code: string | null = null;
  let shareUrl: string | null = null;

  if (eligible) {
    const ensured = await ensureReferralCode(userId);
    code = ensured.code;
    shareUrl = ensured.shareUrl;
  } else {
    const existing = await db.query<{ code: string }>(
      'SELECT code FROM referral_codes WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0) {
      code = existing.rows[0].code;
      shareUrl = `${publicAppBase()}/r/${code}`;
    }
  }

  const stats = await db.query<{ status: string; count: string }>(
    `SELECT r.status, COUNT(*)::text AS count
     FROM referral_redemptions r
     JOIN referral_codes c ON c.id = r.referral_code_id
     WHERE c.user_id = $1
     GROUP BY r.status`,
    [userId]
  );
  const pending = parseInt(stats.rows.find((s) => s.status === 'pending')?.count || '0', 10);
  const activated = parseInt(stats.rows.find((s) => s.status === 'activated')?.count || '0', 10);

  return {
    eligible,
    code,
    shareUrl,
    freeMonthsBalance: row.free_months_balance ?? 0,
    pendingReferralCode: row.pending_referral_code,
    stats: { pending, activated },
    offerCopy:
      'Give a mate a free month of BossBoard — when they pay, you both get a free month. Free months stack up to 1 year.',
  };
}

/**
 * Validate code exists (public / lightweight).
 */
export async function lookupReferralCode(rawCode: string): Promise<{
  code: string;
  referrerName: string | null;
} | null> {
  const code = normalizeCode(rawCode);
  if (!code || code.length < 4) return null;

  const result = await db.query<{ code: string; name: string | null; tier: string }>(
    `SELECT c.code, u.name, u.subscription_tier AS tier
     FROM referral_codes c
     JOIN users u ON u.id = c.user_id
     WHERE c.code = $1 AND u.is_active = true`,
    [code]
  );
  if (result.rows.length === 0) return null;
  // Code remains valid even if referrer lapsed; grant time re-checks paid.
  return {
    code: result.rows[0].code,
    referrerName: result.rows[0].name,
  };
}

/**
 * Attach a friend code to the current user (before paid activation).
 */
export async function attachReferralCode(userId: string, rawCode: string): Promise<{
  code: string;
  status: 'pending';
}> {
  const code = normalizeCode(rawCode);
  if (!code) {
    throw createError('Referral code is required', 400, 'REFERRAL_CODE_REQUIRED');
  }

  const codeRow = await db.query<{
    id: string;
    user_id: string;
    code: string;
  }>(
    `SELECT c.id, c.user_id, c.code
     FROM referral_codes c
     JOIN users u ON u.id = c.user_id
     WHERE c.code = $1 AND u.is_active = true`,
    [code]
  );
  if (codeRow.rows.length === 0) {
    throw createError('Invalid referral code', 404, 'REFERRAL_CODE_INVALID');
  }

  const ref = codeRow.rows[0];
  if (ref.user_id === userId) {
    throw createError('You cannot use your own referral code', 400, 'REFERRAL_SELF');
  }

  // Same email as referrer → self
  const emails = await db.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE id = ANY($1::uuid[])',
    [[userId, ref.user_id]]
  );
  const refereeEmail = emails.rows.find((r) => r.id === userId)?.email?.toLowerCase();
  const referrerEmail = emails.rows.find((r) => r.id === ref.user_id)?.email?.toLowerCase();
  if (refereeEmail && referrerEmail && refereeEmail === referrerEmail) {
    throw createError('You cannot use your own referral code', 400, 'REFERRAL_SELF');
  }

  // Already activated / pending for this referee?
  const existing = await db.query<{ id: string; status: string }>(
    'SELECT id, status FROM referral_redemptions WHERE referee_user_id = $1',
    [userId]
  );
  if (existing.rows.length > 0) {
    if (existing.rows[0].status === 'activated') {
      throw createError('A referral was already used on this account', 409, 'REFERRAL_ALREADY_USED');
    }
    // Update pending to new code
    await db.query(
      `UPDATE referral_redemptions
       SET referral_code_id = $1, status = 'pending', activated_at = NULL,
           referrer_granted = false, referee_granted = false
       WHERE referee_user_id = $2`,
      [ref.id, userId]
    );
  } else {
    await db.query(
      `INSERT INTO referral_redemptions (id, referral_code_id, referee_user_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [uuidv4(), ref.id, userId]
    );
  }

  await db.query(
    'UPDATE users SET pending_referral_code = $1, updated_at = NOW() WHERE id = $2',
    [ref.code, userId]
  );

  return { code: ref.code, status: 'pending' };
}

/**
 * Add free months to a user (capped at 12). Returns new balance and months actually granted.
 */
export async function grantFreeMonths(opts: {
  userId: string;
  months: number;
  reason: FreeMonthGrantReason;
  referralRedemptionId?: string | null;
}): Promise<{ granted: number; balanceAfter: number }> {
  const want = Math.max(0, Math.floor(opts.months));
  if (want <= 0) {
    return { granted: 0, balanceAfter: 0 };
  }

  return db.transaction(async (client) => {
    const cur = await client.query<{ free_months_balance: number }>(
      `SELECT COALESCE(free_months_balance, 0) AS free_months_balance
       FROM users WHERE id = $1 FOR UPDATE`,
      [opts.userId]
    );
    if (cur.rows.length === 0) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }
    const before = cur.rows[0].free_months_balance ?? 0;
    const room = Math.max(0, FREE_MONTH_CAP - before);
    const granted = Math.min(want, room);
    const after = before + granted;

    if (granted > 0) {
      await client.query(
        `UPDATE users SET free_months_balance = $1, updated_at = NOW() WHERE id = $2`,
        [after, opts.userId]
      );
      await client.query(
        `INSERT INTO free_month_grants
           (id, user_id, months, reason, referral_redemption_id, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          opts.userId,
          granted,
          opts.reason,
          opts.referralRedemptionId ?? null,
          after,
        ]
      );
    }

    return { granted, balanceAfter: after };
  });
}

/**
 * Called when a user becomes paid (Stripe checkout or IAP).
 * Activates pending referral redemption and grants both sides +1 month.
 */
export async function activateReferralOnPaid(userId: string): Promise<{
  activated: boolean;
  referrerGranted: number;
  refereeGranted: number;
}> {
  // Prefer redemption row; fall back to pending_referral_code on user
  let redemption = await db.query<{
    id: string;
    referral_code_id: string;
    status: string;
    referrer_user_id: string;
    referrer_tier: string;
    referee_email: string;
    referrer_email: string;
  }>(
    `SELECT r.id, r.referral_code_id, r.status,
            c.user_id AS referrer_user_id,
            ru.subscription_tier AS referrer_tier,
            eu.email AS referee_email,
            ru.email AS referrer_email
     FROM referral_redemptions r
     JOIN referral_codes c ON c.id = r.referral_code_id
     JOIN users ru ON ru.id = c.user_id
     JOIN users eu ON eu.id = r.referee_user_id
     WHERE r.referee_user_id = $1`,
    [userId]
  );

  if (redemption.rows.length === 0) {
    // Lazy attach from pending_referral_code
    const pending = await db.query<{ pending_referral_code: string | null }>(
      'SELECT pending_referral_code FROM users WHERE id = $1',
      [userId]
    );
    const code = pending.rows[0]?.pending_referral_code;
    if (code) {
      try {
        await attachReferralCode(userId, code);
        redemption = await db.query(
          `SELECT r.id, r.referral_code_id, r.status,
                  c.user_id AS referrer_user_id,
                  ru.subscription_tier AS referrer_tier,
                  eu.email AS referee_email,
                  ru.email AS referrer_email
           FROM referral_redemptions r
           JOIN referral_codes c ON c.id = r.referral_code_id
           JOIN users ru ON ru.id = c.user_id
           JOIN users eu ON eu.id = r.referee_user_id
           WHERE r.referee_user_id = $1`,
          [userId]
        );
      } catch (err) {
        console.warn('[Referral] attach on paid failed:', err);
        return { activated: false, referrerGranted: 0, refereeGranted: 0 };
      }
    }
  }

  if (redemption.rows.length === 0) {
    return { activated: false, referrerGranted: 0, refereeGranted: 0 };
  }

  const row = redemption.rows[0];
  if (row.status === 'activated') {
    return { activated: false, referrerGranted: 0, refereeGranted: 0 };
  }
  if (row.referrer_user_id === userId) {
    await voidRedemption(row.id, 'self');
    return { activated: false, referrerGranted: 0, refereeGranted: 0 };
  }
  if (
    row.referee_email &&
    row.referrer_email &&
    row.referee_email.toLowerCase() === row.referrer_email.toLowerCase()
  ) {
    await voidRedemption(row.id, 'self_email');
    return { activated: false, referrerGranted: 0, refereeGranted: 0 };
  }

  // Referrer must be paid at grant time
  if (!isPaidTier(row.referrer_tier)) {
    console.warn(
      `[Referral] referrer ${row.referrer_user_id} not paid at activation; voiding redemption ${row.id}`
    );
    await voidRedemption(row.id, 'referrer_not_paid');
    return { activated: false, referrerGranted: 0, refereeGranted: 0 };
  }

  // Mark activated first (idempotency under concurrent webhooks)
  const flipped = await db.query(
    `UPDATE referral_redemptions
     SET status = 'activated', activated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [row.id]
  );
  if ((flipped.rowCount ?? 0) === 0) {
    return { activated: false, referrerGranted: 0, refereeGranted: 0 };
  }

  const refereeGrant = await grantFreeMonths({
    userId,
    months: 1,
    reason: 'referral_referee',
    referralRedemptionId: row.id,
  });
  const referrerGrant = await grantFreeMonths({
    userId: row.referrer_user_id,
    months: 1,
    reason: 'referral_referrer',
    referralRedemptionId: row.id,
  });

  await db.query(
    `UPDATE referral_redemptions
     SET referee_granted = $2, referrer_granted = $3
     WHERE id = $1`,
    [row.id, refereeGrant.granted > 0, referrerGrant.granted > 0]
  );

  await db.query(
    'UPDATE users SET pending_referral_code = NULL, updated_at = NOW() WHERE id = $1',
    [userId]
  );

  // Best-effort Stripe customer balance credit + IAP expiry extension
  try {
    const { applyFreeMonthBillingCredit } = await import('./referral-billing.js');
    await applyFreeMonthBillingCredit(userId, refereeGrant.granted);
    await applyFreeMonthBillingCredit(row.referrer_user_id, referrerGrant.granted);
  } catch (err) {
    console.warn('[Referral] billing credit apply failed (DB grant still recorded):', err);
  }

  console.log(
    `[Referral] activated ${row.id}: referee=${userId}(+${refereeGrant.granted}) referrer=${row.referrer_user_id}(+${referrerGrant.granted})`
  );

  return {
    activated: true,
    referrerGranted: referrerGrant.granted,
    refereeGranted: refereeGrant.granted,
  };
}

async function voidRedemption(id: string, reason: string): Promise<void> {
  await db.query(
    `UPDATE referral_redemptions SET status = 'void', activated_at = NOW() WHERE id = $1`,
    [id]
  );
  console.log(`[Referral] voided ${id}: ${reason}`);
}

export default {
  ensureReferralCode,
  getReferralMe,
  lookupReferralCode,
  attachReferralCode,
  grantFreeMonths,
  activateReferralOnPaid,
};
