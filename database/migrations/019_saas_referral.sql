-- Migration: 019_saas_referral.sql
-- SaaS free-month + friend referral (BossBoard subscription promo).
-- Product: give a mate a free month; on paid activation both get +1 month; stack cap 12.

-- Balance of free months remaining to apply (0–12)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS free_months_balance INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_free_months_balance_range
    CHECK (free_months_balance >= 0 AND free_months_balance <= 12);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Pending code captured before paid activation (signup /r/CODE or Settings attach)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_referral_code VARCHAR(32) NULL;

-- One shareable code per user (created when they become eligible / first open Invite)
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(16) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes (code);

-- One redemption per referee account
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referee_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'activated', 'void')),
  referrer_granted BOOLEAN NOT NULL DEFAULT FALSE,
  referee_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_code
  ON referral_redemptions (referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_status
  ON referral_redemptions (status);

-- Audit ledger for free-month grants
CREATE TABLE IF NOT EXISTS free_month_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  months INTEGER NOT NULL CHECK (months > 0),
  reason VARCHAR(64) NOT NULL,
  referral_redemption_id UUID NULL REFERENCES referral_redemptions(id) ON DELETE SET NULL,
  balance_after INTEGER NOT NULL,
  stripe_credit_cents INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_free_month_grants_user
  ON free_month_grants (user_id, created_at DESC);

COMMENT ON COLUMN users.free_months_balance IS 'Stacked free SaaS months remaining (cap 12)';
COMMENT ON COLUMN users.pending_referral_code IS 'Friend code attached before paid activation';
COMMENT ON TABLE referral_codes IS 'Shareable referral codes for paid BB users';
COMMENT ON TABLE referral_redemptions IS 'Referee attach + activate on paid conversion';
COMMENT ON TABLE free_month_grants IS 'Audit log of free-month grants (referral, bug hunt, manual)';
