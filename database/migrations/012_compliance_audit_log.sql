-- =============================================================================
-- 012_compliance_audit_log.sql
-- Append-only audit log for compliance document changes (SWMS today; risk
-- assessments + WorkSafe checklists in future).
--
-- WHY: WorkSafe NZ audits routinely ask "who changed this SWMS, when, and
-- what changed?" Without an audit trail, a tradie has no defensible
-- answer. This table captures every create/update/delete/sign event with
-- enough context to reconstruct the change after the fact.
--
-- SHAPE:
-- - One row per compliance event.
-- - entity_type + entity_id locates the affected document.
-- - action is a small enum so we can index/filter.
-- - actor_user_id may be NULL for system-generated events (cron, etc.).
-- - changes is a JSONB diff (old/new) for UPDATE actions; NULL for others.
-- - metadata captures action-specific context (e.g. signature role for SIGN).
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(50) NOT NULL,  -- 'swms', 'risk_assessment', 'checklist'
    entity_id       UUID NOT NULL,
    action          VARCHAR(20) NOT NULL,  -- 'create', 'update', 'delete', 'sign'
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    changes         JSONB,                 -- {field: {old, new}} for updates
    metadata        JSONB,                 -- action-specific context
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-document chronological lookup ("show me everything that happened to SWMS X").
CREATE INDEX IF NOT EXISTS idx_compliance_audit_entity
    ON compliance_audit_log(entity_type, entity_id, created_at DESC);

-- Per-user lookup ("show me everything user Y changed").
CREATE INDEX IF NOT EXISTS idx_compliance_audit_actor
    ON compliance_audit_log(actor_user_id, created_at DESC);

-- Action-type filter (e.g. "all SIGN events this month for accreditation report").
CREATE INDEX IF NOT EXISTS idx_compliance_audit_action
    ON compliance_audit_log(action, created_at DESC);

COMMENT ON TABLE compliance_audit_log IS
    'Append-only audit trail for compliance document changes. Required for WorkSafe NZ audit defensibility — every create/update/delete/sign event is logged with actor, timestamp, and diff.';
