-- Migration: 014_ai_usage.sql
-- Track AI calls for subscription gating and cost control
-- Phase 4.3: AI Cost Control

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- e.g. 'generate_hazard_suggestions', 'generate_control_measures', 'generate_risk_assessment'
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'anthropic' or 'local'
    tokens_used INTEGER, -- reserved for future use
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for monthly usage queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_date ON ai_usage_log(user_id, created_at);

-- Add comment for visibility
COMMENT ON TABLE ai_usage_log IS 'Logs every AI call (Claude/LM Studio) to enforce tier-based caps.';
