-- Migration: 016_store_iap_receipts.sql
-- Phase 3 native store IAP (App Store / Play Billing) receipt ledger.
-- Idempotent on (transaction_id, platform). Webhooks/store remain billing SSOT.

CREATE TABLE IF NOT EXISTS store_subscription_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(16) NOT NULL CHECK (platform IN ('ios', 'android')),
    product_id VARCHAR(255) NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    tier VARCHAR(32) NOT NULL,
    payload JSONB,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (transaction_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_store_iap_user
    ON store_subscription_receipts (user_id, verified_at DESC);

COMMENT ON TABLE store_subscription_receipts IS
  'Verified App Store / Play Billing purchases mapped to BossBoard subscription tiers.';
