-- Invoice email BCC: optional business mailbox for a copy of every emailed invoice.
-- Best practice: BCC the *company* (accounts/office), not necessarily the human who clicked Send.
-- Resolution at send time (API): invoice_bcc_email → company_email → user.email

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS invoice_bcc_email TEXT;

COMMENT ON COLUMN business_profiles.invoice_bcc_email IS
  'Optional email for BCC on invoice sends. When null, API falls back to company_email then the sender user email.';
