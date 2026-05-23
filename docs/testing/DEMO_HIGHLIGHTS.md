# BossBoard Demo Highlights

**For stakeholders / asynchronous review.** Each feature below has (or is expected to have, once `npm run demo:all` is run end-to-end) a recorded video on Web (Playwright `video: 'on'`) and a screenshot sequence on Mobile (Maestro `takeScreenshot`). Stakeholders can click through this index without watching the demos live.

**Spec source:** [`docs/testing/SPEC_AND_DEMOS_MATRIX.md`](./SPEC_AND_DEMOS_MATRIX.md)
**How to regenerate:** `npm run demo:all` (see [`docs/testing/DEMO_RUNBOOK.md`](./DEMO_RUNBOOK.md))
**Per-module coverage reports:** [`docs/testing/coverage/`](./coverage/)

## Artifact path conventions

- **Web video:** `apps/web/test-results/<test-name>/video.webm` (Playwright auto-names the directory from the test title; the convention used by the demo suite is to include the feature ID, e.g. `F-AUTH-01-register-account-chromium/video.webm`).
- **Mobile screenshot:** `apps/mobile/.maestro/screenshots/<NN>-<flow-step>.png` (Maestro flows are numbered `02-`, `03-`, … per the matrix's mobile flow numbering).
- **API:** no visual artifact — the Playwright API spec output (JSON / HTML report) is the record of truth. See `apps/web/playwright-report-demos/` after `npm run demo:api`.

## Surface legend

`W` = Web (Playwright headed video) · `A` = API (Playwright API spec) · `M` = Mobile (Maestro screenshots) · `–` = N/A for this surface (per matrix's surface-applicability table).

---

## Module 1 — Authentication (5 features)

### F-AUTH-01 — Register account
- Surfaces: W A M
- Web: `apps/web/test-results/F-AUTH-01-register-account-chromium/video.webm`
- API: `apps/web/playwright-report-demos/` (look for `F-AUTH-01 api` test)
- Mobile: `apps/mobile/.maestro/screenshots/02-after-register.png` (flow `02-auth-register.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-AUTH-01

### F-AUTH-02 — Login
- Surfaces: W A M
- Web: `apps/web/test-results/F-AUTH-02-login-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/03-after-login.png` (flow `03-auth-login.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-AUTH-02

### F-AUTH-03 — Email verification (6-digit code)
- Surfaces: W (blocked — see Drift Appendix item 1) A M
- Web: blocked pending `/verify-email` page decision
- Mobile: `apps/mobile/.maestro/screenshots/04-verify-email.png` (flow `04-auth-verify-email.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-AUTH-03

### F-AUTH-04 — Password reset (6-digit code)
- Surfaces: W A M
- Web: `apps/web/test-results/F-AUTH-04-password-reset-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/05-password-reset.png` (flow `05-auth-password-reset.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-AUTH-04

### F-AUTH-05 — Onboarding wizard (trade type, company, bank)
- Surfaces: W (partial — Settings page) A M
- Web: `apps/web/test-results/F-AUTH-05-onboarding-chromium/video.webm` (exercises `/settings` business-profile flow)
- Mobile: `apps/mobile/.maestro/screenshots/06-onboarding-step{1,2,3}.png` (flow `06-auth-onboarding.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-AUTH-05

---

## Module 2 — Compliance (4 features)

### F-COMP-01 — SWMS generator (AI-powered)
- Surfaces: W A M
- Web: `apps/web/test-results/F-COMP-01-swms-generate-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/07-swms-generated.png` (flow `07-comp-swms-generate.yaml`)
- Cost note: real Claude API call — capped at 1–2 per full run (see plan Phase 3 risk callout).
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-COMP-01

### F-COMP-02 — Risk assessment builder
- Surfaces: W (partial) A M
- Mobile: `apps/mobile/.maestro/screenshots/07b-swms-edit-hazard.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-COMP-02

### F-COMP-03 — WorkSafe checklists / NZ regulation references
- Surfaces: W (read-only) A M (read-only)
- Web: `apps/web/test-results/F-COMP-03-regulations-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/07c-swms-regulations.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-COMP-03

### F-COMP-04 — SWMS PDF export + digital signature
- Surfaces: W A M
- Web: `apps/web/test-results/F-COMP-04-swms-pdf-sign-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/08-swms-pdf-sign.png` (flow `08-comp-swms-pdf-sign.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-COMP-04

---

## Module 3 — Certifications (3 features)

### F-CERT-01 — Create/list/edit certifications
- Surfaces: W A M
- Web: `apps/web/test-results/F-CERT-01-certifications-crud-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/13-cert-added.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-CERT-01

### F-CERT-02 — Expiry tracking + scheduled notifications (30/14/7/1 days)
- Surfaces: W (partial — banner / badge) A M (push delivery)
- Web: `apps/web/test-results/F-CERT-02-expiring-banner-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/14-cert-expiring-banner.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-CERT-02

### F-CERT-03 — Cert document upload (photo attachment)
- Surfaces: W A M
- Web: `apps/web/test-results/F-CERT-03-cert-photo-upload-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/15-cert-photo-attached.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-CERT-03

---

## Module 4 — Invoices (10 features)

### F-INV-01 — Create invoice (with line items + GST)
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-01-create-invoice-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/16-invoice-created.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-01

### F-INV-02 — List invoices (filter by status)
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-02-list-invoices-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/17-invoice-list-filtered.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-02

### F-INV-03 — Update invoice (draft only)
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-03-update-invoice-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/18-invoice-updated.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-03

### F-INV-04 — Mark as sent
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-04-mark-sent-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/19-invoice-sent.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-04

### F-INV-05 — Mark as paid
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-05-mark-paid-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/20-invoice-paid.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-05

### F-INV-06 — PDF export
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-06-invoice-pdf-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/21-invoice-pdf.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-06

### F-INV-07 — Email invoice to customer (one-tap send)
- Surfaces: W A M
- Web: `apps/web/test-results/F-INV-07-email-invoice-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/22-invoice-emailed.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-07

### F-INV-08 — Public share link (no auth)
- Surfaces: W A M –
- Web: `apps/web/test-results/F-INV-08-public-share-chromium/video.webm`
- Mobile: N/A (share link opens in OS browser, not in-app)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-08

### F-INV-09 — Recurring invoices
- Surfaces: W (partial — no page yet, Drift item 3) A M
- Mobile: `apps/mobile/.maestro/screenshots/23-recurring-created.png` (flow `09-inv-recurring.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-09

### F-INV-10 — Bank reconciliation (auto-match)
- Surfaces: W (partial — no page yet, Drift item 4) A M
- Mobile: `apps/mobile/.maestro/screenshots/24-bank-recon.png` (flow `10-inv-bank-recon.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-INV-10

---

## Module 5 — Quotes (3 features)

### F-QUO-01 — Create quote
- Surfaces: W A M
- Web: `apps/web/test-results/F-QUO-01-create-quote-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/25-quote-created.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-QUO-01

### F-QUO-02 — Quote PDF export
- Surfaces: W A M
- Web: `apps/web/test-results/F-QUO-02-quote-pdf-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/26-quote-pdf.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-QUO-02

### F-QUO-03 — Convert quote to invoice
- Surfaces: W A M
- Web: `apps/web/test-results/F-QUO-03-convert-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/27-quote-converted.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-QUO-03

---

## Module 6 — Expenses (3 features)

### F-EXP-01 — Create expense (with category + receipt photo)
- Surfaces: W A M
- Web: `apps/web/test-results/F-EXP-01-create-expense-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/28-expense-created.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-EXP-01

### F-EXP-02 — List/filter expenses + monthly summary
- Surfaces: W A M
- Web: `apps/web/test-results/F-EXP-02-expense-list-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/29-expense-filtered.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-EXP-02

### F-EXP-03 — Update / delete expense
- Surfaces: W A M
- Web: `apps/web/test-results/F-EXP-03-expense-edit-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/30-expense-updated.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-EXP-03

---

## Module 7 — Job logs (3 features)

### F-JOB-01 — Create job log + clock in
- Surfaces: W A M
- Web: `apps/web/test-results/F-JOB-01-clock-in-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/31-job-clocked-in.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-JOB-01

### F-JOB-02 — Clock out + add notes
- Surfaces: W A M
- Web: `apps/web/test-results/F-JOB-02-clock-out-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/32-job-clocked-out.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-JOB-02

### F-JOB-03 — Job log stats
- Surfaces: W A M
- Web: `apps/web/test-results/F-JOB-03-job-stats-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/33-job-stats.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-JOB-03

---

## Module 8 — Photos (2 features)

### F-PHOTO-01 — Upload photo from camera/gallery
- Surfaces: W A M
- Web: `apps/web/test-results/F-PHOTO-01-upload-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/34-photo-uploaded.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-PHOTO-01

### F-PHOTO-02 — List photos by entity + fetch file
- Surfaces: W A M
- Web: `apps/web/test-results/F-PHOTO-02-list-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/35-photo-gallery.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-PHOTO-02

---

## Module 9 — Teams (4 features)

### F-TEAM-01 — Create team (owner)
- Surfaces: W A M
- Web: `apps/web/test-results/F-TEAM-01-create-team-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/36-team-created.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-TEAM-01

### F-TEAM-02 — Invite member (6-char invite code)
- Surfaces: W A M
- Web: `apps/web/test-results/F-TEAM-02-invite-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/37-team-invite.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-TEAM-02

### F-TEAM-03 — Accept/decline invite
- Surfaces: W A M
- Web: `apps/web/test-results/F-TEAM-03-accept-invite-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/38-team-accepted.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-TEAM-03

### F-TEAM-04 — Member role management + leave
- Surfaces: W A M
- Web: `apps/web/test-results/F-TEAM-04-roles-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/39-team-roles.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-TEAM-04

---

## Module 10 — Subscriptions (4 features)

### F-SUB-01 — View tier definitions
- Surfaces: W A M
- Web: `apps/web/test-results/F-SUB-01-tiers-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/40-sub-tiers.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-SUB-01

### F-SUB-02 — Tier gating (feature access)
- Surfaces: W (partial) A M (partial)
- Web: `apps/web/test-results/F-SUB-02-gating-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/41-sub-gated.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-SUB-02

### F-SUB-03 — Usage tracking (invoice / SWMS counts)
- Surfaces: W A M
- Web: `apps/web/test-results/F-SUB-03-usage-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/42-sub-usage.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-SUB-03

### F-SUB-04 — Limit enforcement (free: 3 invoices/mo, 2 SWMS/mo)
- Surfaces: A · W (partial — upgrade prompt) · M (partial — upgrade prompt)
- Web: `apps/web/test-results/F-SUB-04-limit-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/43-sub-limit.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-SUB-04

---

## Module 11 — Stats & insights (1 feature)

### F-STAT-01 — Dashboard stats + insights
- Surfaces: W A M
- Web: `apps/web/test-results/F-STAT-01-dashboard-chromium/video.webm`
- Mobile: `apps/mobile/.maestro/screenshots/44-dashboard-insights.png`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-STAT-01

---

## Module 12 — Push notifications (1 feature)

### F-PUSH-01 — Cert expiry reminders via Expo Push
- Surfaces: W – · A M
- Mobile: `apps/mobile/.maestro/screenshots/45-push-received.png` (flow `11-push-cert-expiry.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-PUSH-01

---

## Module 13 — Public invoice sharing

Covered as **F-INV-08** in Module 4 (no separate feature ID).

---

## Module 14 — Stripe billing (4 features)

### F-STRIPE-01 — Checkout session creation (tradie tier)
- Surfaces: W A M –
- Web: `apps/web/test-results/F-STRIPE-01-checkout-tradie-chromium/video.webm`
- Mobile: N/A (mobile redirects to browser/WebView)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-STRIPE-01

### F-STRIPE-02 — Checkout session creation (team tier)
- Surfaces: W A M –
- Web: `apps/web/test-results/F-STRIPE-02-checkout-team-chromium/video.webm`
- Mobile: N/A
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-STRIPE-02

### F-STRIPE-03 — Webhook handling (subscription lifecycle)
- Surfaces: W – · A · M –
- API only: see `apps/web/playwright-report-demos/` for the webhook signature-verify spec result.
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-STRIPE-03

### F-STRIPE-04 — Public invoice "Pay Now" (Stripe Payment Link)
- Surfaces: W A M –
- Web: `apps/web/test-results/F-STRIPE-04-pay-now-chromium/video.webm`
- Mobile: N/A
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-STRIPE-04

---

## Cross-cutting features (3)

### F-X-01 — Multi-tenant isolation
- Surfaces: W A M –
- Web: `apps/web/test-results/F-X-01-isolation-chromium/video.webm`
- Existing reference tests: `apps/web/e2e/multi-tenant-isolation.spec.ts`, `apps/web/e2e/multi-tenant-isolation-entities.spec.ts`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-X-01

### F-X-02 — Offline-first sync (Mobile)
- Surfaces: W – · A · M
- Mobile: `apps/mobile/.maestro/screenshots/46-offline-sync.png` (flow `12-x-offline-sync.yaml`)
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-X-02

### F-X-03 — Security headers / CSP / branding
- Surfaces: W A (headers only) M –
- Web: `apps/web/test-results/F-X-03-branding-chromium/video.webm`
- Existing reference tests: `apps/web/e2e/branding.spec.ts`, `apps/web/e2e/page-content-smoke.spec.ts`, `apps/web/e2e/nav-link-smoke.spec.ts`, `apps/web/e2e/production-smoke.spec.ts`
- Spec ACs: see SPEC_AND_DEMOS_MATRIX.md § F-X-03

---

## Counts (verification)

- Total feature entries listed above: **50** (5 + 4 + 3 + 10 + 3 + 3 + 3 + 2 + 4 + 4 + 1 + 1 + 4 + 3).
- Module 13 intentionally redirects to Module 4 (no separate feature IDs).
- Matches `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Counts (verification gate).
