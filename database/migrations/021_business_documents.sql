-- =============================================================================
-- 021_business_documents.sql
-- User-uploaded contracts / T&Cs / other PDFs attached at company, client,
-- or invoice level. Content is the user's responsibility — BossBoard is a
-- storage + delivery aid only (see product disclaimer).
-- =============================================================================

CREATE TABLE IF NOT EXISTS business_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- company = business-wide (e.g. standard T&Cs)
    -- customer = specific client contract
    -- invoice = attached only to one invoice
    scope               VARCHAR(20) NOT NULL
                        CHECK (scope IN ('company', 'customer', 'invoice')),

    customer_id         UUID REFERENCES customers(id) ON DELETE CASCADE,
    invoice_id          UUID REFERENCES invoices(id) ON DELETE CASCADE,

    title               VARCHAR(255) NOT NULL,
    doc_kind            VARCHAR(40) NOT NULL DEFAULT 'terms'
                        CHECK (doc_kind IN ('terms', 'contract', 'other')),

    filename            VARCHAR(255) NOT NULL,
    original_filename   VARCHAR(255),
    mime_type           VARCHAR(100) NOT NULL,
    file_size           INTEGER,
    storage_path        TEXT NOT NULL,

    -- When true, auto-list on invoices for this company/client (user can still uncheck)
    include_on_invoices BOOLEAN NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT business_documents_scope_fk CHECK (
      (scope = 'company'  AND customer_id IS NULL AND invoice_id IS NULL) OR
      (scope = 'customer' AND customer_id IS NOT NULL AND invoice_id IS NULL) OR
      (scope = 'invoice'  AND invoice_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_business_documents_user
  ON business_documents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_documents_customer
  ON business_documents(customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_documents_invoice
  ON business_documents(invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON TABLE business_documents IS
  'User-owned contract/T&Cs files. BossBoard does not author or endorse legal content.';
