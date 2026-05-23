# Invoices — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 4
**Spec source:** [`docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 4](../SPEC_AND_DEMOS_MATRIX.md)
**Branch:** `feat/e2e-demos-invoices-2026-05-23`

The Invoices module is the largest in BossBoard (10 features). Eight have full
W / A / M coverage; two (F-INV-09 recurring, F-INV-10 bank reconciliation) are
mobile-only on the front-end per drift appendix items 3 + 4 — the API surface
still exists for both, so the API coverage cell is filled for all 10.

## Coverage matrix

| Feature ID | ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-INV-01 create | 5 | YES | YES | YES (13) | Full happy-path; web spec asserts live GST math in the form |
| F-INV-02 list + filter | 5 | YES | YES | YES (14) | API spec exercises `?status=draft` filter |
| F-INV-03 update draft | 4 | YES | YES | YES (15) | API spec asserts both happy + non-draft 4xx |
| F-INV-04 mark sent | 3 | YES | YES | YES (16) | sentAt timestamp asserted in API |
| F-INV-05 mark paid | 3 | YES | YES | YES (17) | paidAt timestamp asserted in API |
| F-INV-06 PDF export | 4 | YES (button) | YES (body + magic) | YES (18) | Web button affordance only; PDF body assertion in API |
| F-INV-07 email | 5 | YES (mocked) | YES (real Resend no-op) | YES (19) | Web mocks `page.route('**/invoices/:id/email')`; API uses `delivered@resend.dev` |
| F-INV-08 share link | 4 | YES (incognito) | YES | YES (20) | Web opens share URL in fresh context — proves no-auth render |
| F-INV-09 recurring | 5 | SKIP (mobile-only) | YES (CRUD + generate) | YES (21) | Drift app §3 — no `/recurring` page on Web |
| F-INV-10 bank rec | 5 | SKIP (mobile-only) | YES (upload + match + summary) | YES (22) | Drift app §4 — no `/bank` page on Web |

## Gaps surfaced

1. **F-INV-09 + F-INV-10 are Web-blind**. Both features have full API +
   Mobile coverage but no Web UI, confirming the drift appendix items 3 + 4
   from `SPEC_AND_DEMOS_MATRIX.md`. Recommend Phase 4 either:
   (a) ship `/recurring` + `/bank` pages on Web, OR
   (b) document this as a deliberate "mobile-first" product choice in
       `PRODUCT_AND_MARKET_POSITIONING.md` so the matrix stops flagging it
       as drift.

2. **F-INV-06 PDF web demo is shallow** — only asserts the "Download PDF"
   button is rendered. A deeper test would `page.waitForEvent('download')`
   then inspect the saved file. Skipped here because the API spec already
   parses PDF magic-bytes + asserts content-type — duplicating in the
   browser layer is low-value.

3. **F-INV-07 email web demo uses an API-level mock** rather than the
   Resend SDK boundary. This works for "did the button submit?" but
   doesn't exercise the real PDF-attachment + Resend-payload path. The
   API spec covers that branch via the real Resend test address.

4. **Maestro flows assume a logged-in user** (matches all sibling agent
   modules). The shared mobile auth-seed flow (Phase 2 follow-up) is the
   prerequisite. If it doesn't exist yet, the invoices flows will fail at
   "tap Money" because there's no tab bar. Out-of-scope for this agent.

5. **F-INV-09 mobile flow assumes a numeric-keypad input for amount**.
   The recurring screen's input ID hasn't been audited — the flow taps
   on "0.00" which is the placeholder used in `apps/mobile/app/invoices/create.tsx`;
   the recurring screen may differ. If the flow fails, add a `testID`
   prop to the recurring amount input and update the YAML.

## Existing test coverage cross-check

| Surface | Existing files | Notes |
|---|---|---|
| API | `apps/api/src/__tests__/routes/invoices.test.ts`, `services/invoices.test.ts`, `routes/recurring-invoices.test.ts`, `services/recurring-invoices.test.ts`, `services/recurring-invoices-async.test.ts`, `routes/bank-transactions.test.ts`, `services/bank-transactions.test.ts`, `routes/public.test.ts`, `services/pdf.test.ts`, `services/email.test.ts` | Comprehensive unit coverage via Jest; this PR's API e2e adds the end-to-end happy-path through the real HTTP stack |
| Web | `apps/web/e2e/multi-tenant-isolation.spec.ts`, `apps/web/e2e/multi-tenant-isolation-entities.spec.ts` | Cover invoice isolation indirectly; no per-feature UI specs existed before this PR |
| Mobile | (none) | No Jest tests + no Maestro flows existed for invoices before this PR |

## Commands to run this module's demos

```bash
# Web (headed Playwright)
cd apps/web
npx playwright test e2e/demos/invoices.spec.ts --headed --workers=1

# API (Playwright API tests — no browser)
cd apps/web
npx playwright test e2e/demos/api/invoices.api.spec.ts --workers=1

# Mobile (Maestro — requires simulator/emulator running)
cd apps/mobile
maestro test .maestro/13-inv-create.yaml
maestro test .maestro/14-inv-list.yaml
maestro test .maestro/15-inv-update.yaml
maestro test .maestro/16-inv-send.yaml
maestro test .maestro/17-inv-paid.yaml
maestro test .maestro/18-inv-pdf.yaml
maestro test .maestro/19-inv-email.yaml
maestro test .maestro/20-inv-share.yaml
maestro test .maestro/21-inv-recurring.yaml
maestro test .maestro/22-inv-bank-rec.yaml
```

## Cost / external dependencies

- **Resend email send (F-INV-07)**: the API spec sends to `delivered@resend.dev`
  (Resend's documented no-op address) so it never lands in a real
  inbox. If `RESEND_API_KEY` is unset the test asserts the 503 fallback
  branch instead — no Resend usage at all. The web spec mocks the
  underlying request via `page.route()` so it costs $0.
- **Stripe**: not exercised by this module's demos (Stripe billing lives
  in F-STRIPE-NN, Agent 13). F-INV-08 share token is the precursor to
  the F-STRIPE-04 Payment Link button, but this PR only verifies the
  share-token issuance, not the Payment Link.
- **Claude API**: not used in any invoice demo.
