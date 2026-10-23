-- Required before deploying the durable checkout service. Apply through the
-- normal numbered migration path; never clear ambiguous requests to retry.
-- Release order: verify this migration completed, then the repaired API, then
-- expose web purchases. index.ts currently continues startup after migration
-- failure, so process readiness alone is not proof this table was installed.
CREATE TABLE IF NOT EXISTS stripe_billing_requests (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('customer', 'checkout')),
    idempotency_key UUID NOT NULL,
    params JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    provider_id TEXT,
    expires_at TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'open', 'expired', 'complete')),
    PRIMARY KEY (user_id, kind)
);
COMMENT ON TABLE stripe_billing_requests IS 'Durable Stripe request identity and exact parameters. Unknown outcomes older than the safe idempotency retry horizon require reconciliation, not deletion.';
