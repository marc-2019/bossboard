-- Migration: 017_feedback.sql
-- In-app customer feedback capture (universal feedback process, product side).
-- Users submit feedback (bug reports, ideas, ratings) from the web dashboard
-- and mobile settings screen via POST /api/v1/feedback. Rows start at
-- status 'new'; the CortexForge ingestion poller (separate task) reads
-- status='new' rows and marks them 'ingested'. Additive-only and idempotent:
-- CREATE TABLE/INDEX IF NOT EXISTS only; no destructive statements; safe to re-run.

CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('bug', 'idea', 'other', 'rating')),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5), -- optional 1-5, NULL when not given
    message TEXT NOT NULL,
    page_context TEXT, -- where in the app it was submitted from (e.g. '/invoices', 'settings')
    app_version TEXT,  -- client build, e.g. 'web-0.5.1', 'ios-0.5.0'
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'ingested', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Poller query path: WHERE status = 'new' ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at);

-- User-scoped listing
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at);

COMMENT ON TABLE feedback IS 'In-app user feedback (bug/idea/other/rating). status: new -> ingested (CF poller) -> closed.';
