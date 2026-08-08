-- =============================================================================
-- 020_customer_pii_encryption_audit.sql
-- 1) Widen PII columns so AES-GCM ciphertext fits (TEXT)
-- 2) email_blind for equality search without storing plaintext index
-- 3) data_access_audit_log for client create/read/update/delete/list
-- =============================================================================

-- Customers: room for enc:v1:... ciphertext
ALTER TABLE customers ALTER COLUMN email TYPE TEXT;
ALTER TABLE customers ALTER COLUMN phone TYPE TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email_blind VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_customers_user_email_blind
  ON customers(user_id, email_blind)
  WHERE email_blind IS NOT NULL;

COMMENT ON COLUMN customers.email_blind IS
  'HMAC-style blind index (sha256) of normalized email for exact match search; email column holds encrypted value when FIELD_ENCRYPTION_KEY is set.';

-- Business profile bank / tax identifiers — room for ciphertext
ALTER TABLE business_profiles ALTER COLUMN ird_number TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN gst_number TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN company_phone TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN company_email TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN bank_account_name TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN bank_account_number TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN bank_name TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN intl_bank_account_name TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN intl_iban TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN intl_swift_bic TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN intl_bank_name TYPE TEXT;
ALTER TABLE business_profiles ALTER COLUMN intl_routing_number TYPE TEXT;

-- Append-only data access audit (customers / sensitive profile)
CREATE TABLE IF NOT EXISTS data_access_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(50) NOT NULL,  -- 'customer', 'business_profile'
    entity_id       UUID,
    action          VARCHAR(20) NOT NULL,  -- 'create','read','list','update','delete'
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata        JSONB,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_access_audit_actor
  ON data_access_audit_log(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_access_audit_entity
  ON data_access_audit_log(entity_type, entity_id, created_at DESC);

COMMENT ON TABLE data_access_audit_log IS
  'Append-only audit of access to client and business-profile PII. Best-effort; never blocks primary ops.';
