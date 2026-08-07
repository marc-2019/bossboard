-- BossBoard Database Initialization
-- PostgreSQL 16
-- Version: 0.1.0

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS & AUTHENTICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    phone VARCHAR(50),
    trade_type VARCHAR(50), -- electrician, plumber, builder, landscaper, other
    business_name VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS magic_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- COMPLIANCE MODULE
-- =============================================================================

-- SWMS Documents
CREATE TABLE IF NOT EXISTS swms_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    template_type VARCHAR(50) NOT NULL, -- electrician, plumber, builder
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft', -- draft, signed, archived

    -- Job Details
    job_description TEXT,
    site_address TEXT,
    client_name VARCHAR(255),
    expected_duration VARCHAR(50),

    -- Form Data (JSON)
    hazards JSONB DEFAULT '[]',
    controls JSONB DEFAULT '[]',
    ppe_required JSONB DEFAULT '[]',
    emergency_plan TEXT,
    isolation_procedure TEXT,

    -- Signatures
    worker_signature TEXT, -- Base64 encoded
    worker_signed_at TIMESTAMP WITH TIME ZONE,
    supervisor_signature TEXT,
    supervisor_signed_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    pdf_url VARCHAR(500),
    is_synced BOOLEAN DEFAULT FALSE,
    local_id VARCHAR(100), -- For offline sync
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    swms_id UUID REFERENCES swms_documents(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    site_address TEXT,

    -- Assessment Data (JSON array of hazards with risk ratings)
    assessments JSONB DEFAULT '[]',
    -- Format: [{hazard, likelihood, consequence, risk_level, controls}]

    overall_risk_level VARCHAR(20), -- low, medium, high, extreme
    review_date DATE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- CERTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- electrical, gas, plumbing, lpg, first_aid, site_safe, other
    name VARCHAR(255) NOT NULL,
    cert_number VARCHAR(100),
    issuing_body VARCHAR(255),
    issue_date DATE,
    expiry_date DATE,
    document_url VARCHAR(500),
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INVOICES
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,

    -- Client info
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,

    -- Job link (optional)
    swms_id UUID REFERENCES swms_documents(id) ON DELETE SET NULL,
    job_description TEXT,

    -- Line items as JSONB
    line_items JSONB NOT NULL DEFAULT '[]',

    -- Amounts (stored in cents to avoid float issues)
    subtotal INTEGER NOT NULL DEFAULT 0,
    -- Discount applied before GST (see migration 018)
    discount_type VARCHAR(16) NOT NULL DEFAULT 'none'
      CHECK (discount_type IN ('none', 'fixed', 'percent')),
    discount_value INTEGER NOT NULL DEFAULT 0,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    discount_label TEXT,
    gst_amount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,

    -- Status
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,

    -- Bank details (per invoice for flexibility)
    bank_account_name TEXT,
    bank_account_number TEXT,

    -- Notes
    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- DOCUMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- swms, risk_assessment, certification, visa, contract, other
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100),
    file_size INTEGER,
    storage_path VARCHAR(500),
    expiry_date DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- SYNC TRACKING (for offline support)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- swms, risk_assessment, certification
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- create, update, delete
    local_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'pending', -- pending, synced, conflict
    conflict_data JSONB
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_trade_type ON users(trade_type);

CREATE INDEX IF NOT EXISTS idx_swms_user_id ON swms_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_swms_status ON swms_documents(status);
CREATE INDEX IF NOT EXISTS idx_swms_local_id ON swms_documents(local_id);

CREATE INDEX IF NOT EXISTS idx_certifications_user_id ON certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_certifications_expiry ON certifications(expiry_date);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sync_log_user_entity ON sync_log(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(sync_status);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_swms_updated_at
    BEFORE UPDATE ON swms_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_risk_assessments_updated_at
    BEFORE UPDATE ON risk_assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_certifications_updated_at
    BEFORE UPDATE ON certifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SEED DATA (Development)
-- =============================================================================

-- Note: Only runs if users table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
        -- Insert test user
        INSERT INTO users (email, name, trade_type, business_name, is_verified)
        VALUES (
            'test@bossboard.nz',
            'Test Tradie',
            'electrician',
            'Test Electrical Ltd',
            true
        );
    END IF;
END $$;

-- Log completion
DO $$ BEGIN RAISE NOTICE 'BossBoard database initialized successfully'; END $$;
