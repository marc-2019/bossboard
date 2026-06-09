-- Migration: 015_photo_entity_types.sql
-- Widen the photos.entity_type CHECK constraint to allow 'certification' and
-- 'quote'. The mobile app already sends entityType="quote" (PhotoAttachments
-- on the quote detail screen) and the product spec calls for attaching photos
-- to certifications (F-CERT-03), but migration 002 only permitted
-- ('swms','invoice','expense','job_log') — so those uploads failed the DB
-- CHECK after passing API validation. This is an additive widening (no rows
-- become invalid).

ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_entity_type_check;

ALTER TABLE photos ADD CONSTRAINT photos_entity_type_check
    CHECK (entity_type IN ('swms', 'invoice', 'expense', 'job_log', 'certification', 'quote'));

COMMENT ON COLUMN photos.entity_type IS 'Entity a photo is attached to: swms, invoice, expense, job_log, certification, quote.';
