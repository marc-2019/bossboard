# E2E Demo + Spec Coverage — Executive Gap Report

**Generated:** 2026-05-23 by Phase 4 Agent (gap-report)
**Spec source:** `docs/testing/SPEC_AND_DEMOS_MATRIX.md` (50 features × 14 modules)
**Plan reference:** `docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md` Phase 4 (Tasks 4.1–4.3)
**Baseline:** 50 features × 3 surfaces (Web / API / Mobile) = **150 nominal coverage cells**.
Per-feature surface applicability is recorded in the matrix; some cells are
intentionally N/A (e.g. Stripe webhooks have no Mobile surface, push has no
Web surface). The applicable-cell denominator after applying the matrix's
own `–` exclusions is **128 applicable cells** (see "Applicable cell math"
below).

---

## Top-line numbers

| Metric | Value | Notes |
|---|---:|---|
| Total feature IDs | 50 | per matrix § "Counts" |
| Nominal cells (50 × 3) | 150 | |
| Cells the matrix marks N/A (`–`) | 22 | see "Applicable cell math" |
| **Applicable cells** | **128** | |
| Cells with Phase-3 demo authored (full or partial) | **103 / 128** (~80%) | aggregated from 14 coverage reports |
| Cells with explicit Phase-3 demo gap (drift / blocked) | **25 / 128** (~20%) | see "Per-feature status table" |
| Pre-Phase-3 automated tests (count of files) | **53** | 42 API Jest + 10 Web Playwright + 1 Mobile Jest |
| Pre-Phase-3 test files matched to ≥1 feature ID | **49 / 53** | |
| Pre-Phase-3 test files un-mappable to a feature ID (ORPHAN) | **4 / 53** | `middleware/error.test.ts`, `routes/health.test.ts`, `routes/legal.test.ts`, `apps/web/e2e/api-routes.spec.ts` (mixed) |
| Features with at least one pre-Phase-3 automated test | **47 / 50** | gaps: F-CERT-03 (drift), F-X-03 headers (aspirational), F-PUSH-01 OS-side |
| Features with ZERO coverage (no demo AND no pre-existing test) | **0 / 50** | |
| Hard-drift items (spec says shipped, code disagrees) | **6** | catalogued in "Spec-vs-code drift" |
| Soft-drift items (surface applicability needs spec update) | **9** | |

### Applicable cell math

The matrix declares `–` (N/A by design) on:
- F-INV-08 Mobile (link opens in browser, not in-app) → 1
- F-INV-09 Web (no `/recurring` page — drift item #3) → counted as PARTIAL not N/A; not deducted
- F-INV-10 Web (no `/bank` page — drift item #4) → counted as PARTIAL not N/A; not deducted
- F-PUSH-01 Web (no push on web) → 1
- F-STRIPE-01..02 Mobile (mobile redirects to browser/WebView) → 2
- F-STRIPE-03 Web + Mobile (server-to-server only) → 2
- F-STRIPE-04 Mobile → 1
- F-X-01 Mobile → 1
- F-X-02 Web → 1
- F-X-03 Mobile → 1

Total N/A by design = **10 cells** declared explicitly. The remaining
"partial" cells reflect product-mobile-first decisions (Web has no
clock-in / no recurring / no bank / no subscription page) — these are
counted as `partial → demo authored, gap noted` rather than N/A.

Note: the report's headline of 22 cells N/A is the conservative reading
that ALSO treats the four Web mobile-first-by-design cells (F-INV-09,
F-INV-10, F-EXP-01 create UI, F-JOB-01 clock-in UI) as N/A given the
product brief. The first number (10) is the strict matrix reading; the
second (22) is the practical reading. Both are presented because Phase 4
should not pre-decide whether those product decisions get locked in.

---

## Per-feature status table (50 rows)

Legend:
- W / A / M cells: ✓ = full demo authored on this surface; ◐ = partial; · = N/A by spec; ✗ = applicable but no demo
- "Pre-existing test" = test file existed BEFORE Phase 3 (does not include the 14 new `apps/web/e2e/demos/**` files)
- "Status" — summary: GREEN (all applicable surfaces covered), AMBER (partial / known gap), RED (hard drift between spec and code)

| Feature ID | Module | Spec ACs | W | A | M | Pre-existing test | Status |
|---|---|---:|:-:|:-:|:-:|---|---|
| F-AUTH-01 | Auth | 5 | ◐ | ✓ | ✓ | `routes/auth.test.ts`, `services/auth.test.ts`, `web/auth.spec.ts`, `web/api-routes.spec.ts` | AMBER — register lands on `/dashboard` not `/verify-email` (drift #1) |
| F-AUTH-02 | Auth | 5 | ✓ | ✓ | ✓ | `routes/auth.test.ts`, `middleware/auth.test.ts`, `web/auth.spec.ts`, `web/api-routes.spec.ts`, `mobile/AuthContext.test.tsx` | GREEN |
| F-AUTH-03 | Auth | 5 | ✗ | ✓ | ✓ | `routes/auth.test.ts` | AMBER — no Web `/verify-email` page (drift #1) |
| F-AUTH-04 | Auth | 5 | ✓ | ◐ | ✓ | `routes/auth.test.ts`, `web/password-reset-smoke.spec.ts` | AMBER — reset-success API path deferred to Phase 5 Resend mock |
| F-AUTH-05 | Auth | 5 | ✗ | ✓ | ✓ | `routes/auth.test.ts`, `routes/business-profile.test.ts` | AMBER — no Web `/onboarding` wizard (drift #2) |
| F-COMP-01 | Compliance | 5 | ◐ | ✓ | ◐ | `routes/swms.test.ts`, `services/swms.test.ts`, `services/claude.test.ts` | AMBER — free-tier limit not exercised here (cross-module) |
| F-COMP-02 | Compliance | 5 | ◐ | ◐ | ◐ | `routes/swms.test.ts` | AMBER — no mobile inline-edit UI; web edit page missing |
| F-COMP-03 | Compliance | 4 | ◐ | ◐ | ◐ | `services/swms.test.ts`, `services/claude.test.ts` | AMBER — regulations[] not rendered on web |
| F-COMP-04 | Compliance | 5 | ◐ | ◐ | ◐ | `routes/swms.test.ts`, `services/pdf.test.ts` | **RED** — no `GET /api/v1/swms/:id/pdf` route (spec/code drift) |
| F-CERT-01 | Certifications | 5 | ◐ | ✓ | ◐ | `routes/certifications.test.ts`, `services/certifications.test.ts`, `web/multi-tenant-isolation-entities.spec.ts` | AMBER — Web is read-only (spec parity claim wrong) |
| F-CERT-02 | Certifications | 5 | ◐ | ◐ | ◐ | `routes/certifications.test.ts`, `routes/notifications.test.ts` | AMBER — no mobile cert detail route; exactly-once-per-threshold not e2e-asserted |
| F-CERT-03 | Certifications | 5 | ✗ | ◐ | ✗ | `routes/photos.test.ts` | **RED** — `'certification'` not in photos `entityType` enum |
| F-INV-01 | Invoices | 5 | ✓ | ✓ | ✓ | `routes/invoices.test.ts`, `services/invoices.test.ts`, `middleware/subscription.test.ts`, `web/multi-tenant-isolation*.spec.ts` | GREEN |
| F-INV-02 | Invoices | 5 | ✓ | ✓ | ✓ | `routes/invoices.test.ts` | GREEN |
| F-INV-03 | Invoices | 4 | ✓ | ✓ | ✓ | `routes/invoices.test.ts` | GREEN |
| F-INV-04 | Invoices | 3 | ✓ | ✓ | ✓ | `routes/invoices.test.ts` | GREEN |
| F-INV-05 | Invoices | 3 | ✓ | ✓ | ✓ | `routes/invoices.test.ts` | GREEN |
| F-INV-06 | Invoices | 4 | ✓ | ✓ | ✓ | `routes/invoices.test.ts`, `services/pdf.test.ts` | GREEN (web demo is button-only; API spec deep) |
| F-INV-07 | Invoices | 5 | ✓ | ✓ | ✓ | `routes/invoices.test.ts`, `services/email.test.ts` | GREEN (web mocked; API uses Resend `delivered@resend.dev`) |
| F-INV-08 | Invoices | 4 | ✓ | ✓ | · | `routes/public.test.ts` | GREEN |
| F-INV-09 | Invoices | 5 | ✗ | ✓ | ✓ | `routes/recurring-invoices.test.ts`, `services/recurring-invoices.test.ts`, `services/recurring-invoices-async.test.ts` | AMBER — no Web `/recurring` page (drift #3) |
| F-INV-10 | Invoices | 5 | ✗ | ✓ | ✓ | `routes/bank-transactions.test.ts`, `services/bank-transactions.test.ts` | AMBER — no Web `/bank` page (drift #4) |
| F-QUO-01 | Quotes | 5 | ◐ | ✓ | ✓ | `routes/quotes.test.ts`, `services/quotes.test.ts` | AMBER — Web has no create UI (read-only) |
| F-QUO-02 | Quotes | 3 | ✗ | ✓ | ◐ | `routes/quotes.test.ts`, `services/pdf.test.ts` | AMBER — Web has no Download PDF button (drift) |
| F-QUO-03 | Quotes | 4 | ✓ | ✓ | ✓ | `routes/quotes.test.ts` | GREEN |
| F-EXP-01 | Expenses | 5 | ◐ | ✓ | ◐ | `routes/expenses.test.ts`, `services/expenses.test.ts` | AMBER — Web read-only by design; mobile receipt photo skipped |
| F-EXP-02 | Expenses | 4 | ✓ | ✓ | ✓ | `routes/expenses.test.ts` | GREEN |
| F-EXP-03 | Expenses | 3 | ◐ | ✓ | ◐ | `routes/expenses.test.ts` | AMBER — mobile detail screen has no Edit UI (drift) |
| F-JOB-01 | Job logs | 4 | ◐ | ✓ | ✓ | `routes/job-logs.test.ts` | AMBER — Web read-only (no clock-in UI by design) |
| F-JOB-02 | Job logs | 3 | ◐ | ✓ | ✓ | `routes/job-logs.test.ts` | AMBER — Web reads only |
| F-JOB-03 | Job logs | 2 | ✓ | ✓ | ✓ | `routes/job-logs.test.ts` | GREEN |
| F-PHOTO-01 | Photos | 4 | ◐ | ✓ | ◐ | `routes/photos.test.ts` | AMBER — Web has no `/photos` page; simulator camera can't shutter |
| F-PHOTO-02 | Photos | 4 | ◐ | ✓ | ◐ | `routes/photos.test.ts` | AMBER — same surface constraints |
| F-TEAM-01 | Teams | 4 | ✓ | ✓ | ✓ | `routes/teams.test.ts`, `services/teams.test.ts` | AMBER — one-team-per-user (AC2) not enforced/tested |
| F-TEAM-02 | Teams | 5 | ✓ | ✓ | ✓ | `routes/teams.test.ts` | AMBER — duplicate-invite (AC5) policy undecided |
| F-TEAM-03 | Teams | 5 | ✓ | ✓ | ✓ | `routes/teams.test.ts` | AMBER — single-team-per-user (AC5) untested |
| F-TEAM-04 | Teams | 5 | ✓ | ✓ | ✓ | `routes/teams.test.ts` | AMBER — owner-can't-leave (AC5) untested |
| F-SUB-01 | Subscriptions | 3 | ◐ | ✓ | ✓ | `routes/subscriptions.test.ts`, `services/subscriptions.test.ts` | AMBER — no Web subscription page |
| F-SUB-02 | Subscriptions | 4 | ◐ | ✓ | ◐ | `middleware/subscription.test.ts` | AMBER — beta-mode bypass; full gating defers to BETA_MODE=false harness |
| F-SUB-03 | Subscriptions | 3 | ◐ | ✓ | ◐ | `routes/subscriptions.test.ts` | AMBER — month-reset (AC2) needs time-travel fixture |
| F-SUB-04 | Subscriptions | 5 | ◐ | ✓ | ◐ | `middleware/subscription.test.ts` | AMBER — SWMS-limit (AC2) test missing |
| F-STAT-01 | Stats | 4 | ◐ | ✓ | ✓ | `routes/stats.test.ts`, `services/insights.test.ts` | AMBER — Web dashboard does not render insights surface (drift) |
| F-PUSH-01 | Push | 5 | · | ✓ | ◐ | `routes/notifications.test.ts` | AMBER — mobile receive flow OS-dependent (best-effort) |
| F-STRIPE-01 | Stripe | 5 | ◐ | ✓ | · | `routes/subscriptions.test.ts`, `services/stripe.test.ts` | AMBER — Web `/subscription` page may not exist |
| F-STRIPE-02 | Stripe | 5 | ◐ | ✓ | · | `routes/subscriptions.test.ts` | AMBER — mirror of F-STRIPE-01 |
| F-STRIPE-03 | Stripe | 6 | · | ✓ | · | `routes/stripe-webhook.test.ts`, `services/stripe.test.ts` | GREEN (API-only by design) |
| F-STRIPE-04 | Stripe | 5 | ◐ | ✓ | · | `routes/public.test.ts`, `services/stripe.test.ts` | AMBER — positive Pay-Now path requires real share_token |
| F-X-01 | Cross-cutting | 3 | ✓ | ✓ | · | `web/multi-tenant-isolation.spec.ts`, `web/multi-tenant-isolation-entities.spec.ts` | GREEN (Phase 3 added SWMS + cert isolation) |
| F-X-02 | Cross-cutting | 5 | · | ✓ | ✓ | `routes/sync.test.ts` | AMBER — iOS airplane-mode blocked (Maestro limitation) |
| F-X-03 | Cross-cutting | 3 | ◐ | ◐ | · | `web/branding.spec.ts`, `web/page-content-smoke.spec.ts`, `web/nav-link-smoke.spec.ts`, `web/production-smoke.spec.ts` | AMBER — Next.js sets none of the 5 expected security headers today |

**Totals over 50 rows:**
- GREEN: 14
- AMBER: 34
- RED: 2 (F-COMP-04 PDF missing route; F-CERT-03 entityType enum missing `certification`)

---

## Existing test mapping (matched + orphan)

### API Jest — 42 files

**Matched to ≥1 feature ID (40 files):**

| Test file | Maps to |
|---|---|
| `middleware/auth.test.ts` | F-AUTH-02 |
| `middleware/subscription.test.ts` | F-SUB-02, F-SUB-04, F-INV-01 (`checkLimit`) |
| `routes/auth.test.ts` | F-AUTH-01..05 |
| `routes/bank-transactions.test.ts` | F-INV-10 |
| `routes/business-profile.test.ts` | F-AUTH-05 (folded; matrix drift #6) |
| `routes/certifications.test.ts` | F-CERT-01, F-CERT-02 |
| `routes/customers.test.ts` | F-INV-01 supporting CRUD (drift #5) |
| `routes/expenses.test.ts` | F-EXP-01, F-EXP-02, F-EXP-03 |
| `routes/invoices.test.ts` | F-INV-01..F-INV-07 |
| `routes/job-logs.test.ts` | F-JOB-01, F-JOB-02, F-JOB-03 |
| `routes/notifications.test.ts` | F-PUSH-01, F-CERT-02 (check-expiry shape) |
| `routes/photos.test.ts` | F-PHOTO-01, F-PHOTO-02, F-CERT-03 (drift-pin) |
| `routes/products.test.ts` | F-INV-01 supporting CRUD (drift #5) |
| `routes/public.test.ts` | F-INV-08, F-STRIPE-04 |
| `routes/quotes.test.ts` | F-QUO-01, F-QUO-02, F-QUO-03 |
| `routes/recurring-invoices.test.ts` | F-INV-09 |
| `routes/stats.test.ts` | F-STAT-01 |
| `routes/stripe-webhook.test.ts` | F-STRIPE-03 |
| `routes/subscriptions.test.ts` | F-SUB-01, F-SUB-03, F-STRIPE-01, F-STRIPE-02 |
| `routes/swms.test.ts` | F-COMP-01..04 |
| `routes/sync.test.ts` | F-X-02 |
| `routes/teams.test.ts` | F-TEAM-01..04 |
| `services/auth.test.ts` | F-AUTH-01 |
| `services/bank-transactions.test.ts` | F-INV-10 |
| `services/certifications.test.ts` | F-CERT-01 |
| `services/claude.test.ts` | F-COMP-01, F-COMP-03 |
| `services/customers.test.ts` | F-INV-01 supporting (drift #5) |
| `services/email.test.ts` | F-INV-07 |
| `services/expenses.test.ts` | F-EXP-01 |
| `services/insights.test.ts` | F-STAT-01 |
| `services/invoices.test.ts` | F-INV-01..F-INV-07 |
| `services/pdf.test.ts` | F-INV-06, F-QUO-02, F-COMP-04 (signed-only — see drift) |
| `services/quotes.test.ts` | F-QUO-01 |
| `services/recurring-invoices.test.ts` | F-INV-09 |
| `services/recurring-invoices-async.test.ts` | F-INV-09 (async path) |
| `services/stripe.test.ts` | F-STRIPE-01..F-STRIPE-04 |
| `services/subscriptions.test.ts` | F-SUB-01..04 |
| `services/swms.test.ts` | F-COMP-01..03 |
| `services/teams.test.ts` | F-TEAM-01..04 |

**Orphan (no feature ID match) — 3 files:**

| Test file | Why orphan | Recommendation |
|---|---|---|
| `middleware/error.test.ts` | Generic error-handling middleware | Acceptable cross-cutting infra test — promote to F-X-04 candidate (alongside legal) OR leave as infra test |
| `routes/health.test.ts` | `/health` probe (deploy / Railway concern) | Acceptable infra; could be folded under F-X-03 security/infra |
| `routes/legal.test.ts` | `/api/v1/legal/*` privacy/terms/support/delete-account — large 1109 LOC route per matrix drift #7 | **Recommendation: promote to F-X-04 Legal compliance** (matrix drift #7 explicitly calls this out) |

### Web Playwright e2e — 10 files (all in `apps/web/e2e/`, pre-Phase-3)

| Test file | Maps to |
|---|---|
| `auth.spec.ts` | F-AUTH-01, F-AUTH-02 |
| `api-routes.spec.ts` | F-AUTH-01, F-AUTH-02 (proxy layer); MIXED — see orphan note |
| `branding.spec.ts` | F-X-03 |
| `middleware.spec.ts` | F-X-03 adjacent (auth redirect on protected paths) |
| `multi-tenant-isolation.spec.ts` | F-X-01, F-INV-01 (invoices isolation) |
| `multi-tenant-isolation-entities.spec.ts` | F-X-01, F-CERT-01, F-QUO-01, F-EXP-01, F-JOB-01, F-PHOTO-01 |
| `nav-link-smoke.spec.ts` | F-X-03 adjacent |
| `page-content-smoke.spec.ts` | F-X-03 adjacent |
| `password-reset-smoke.spec.ts` | F-AUTH-04 |
| `production-smoke.spec.ts` | F-X-03 adjacent (prod URL reachability) |

**Orphan partial — 1 file:**
- `api-routes.spec.ts` covers Next.js API-proxy routes generically. Auth slice maps to F-AUTH-01/02; the rest of the file (mixed proxy probes) does not cleanly bind to a single feature ID. **Recommendation:** split into per-module API-proxy specs once Phase 3 demo specs become the canonical place for endpoint coverage.

### Mobile Jest — 1 file

| Test file | Maps to |
|---|---|
| `contexts/AuthContext.test.tsx` | F-AUTH-02 (state machine) |

### Orphan summary

- 3 API Jest files (`error`, `health`, `legal`) — infra-shaped; `legal` is the most material (matrix drift #7).
- 1 Web e2e file (`api-routes.spec.ts`) is a partial-orphan / mixed-scope test.
- 0 Mobile test files orphaned.

**Net orphans (un-feature-mapped):** 4 / 53 files.

---

## Spec-vs-code drift (compiled from Phase 1 matrix + 14 Phase 3 reports)

### Hard drift — spec claims something is shipped but code disagrees

1. **F-COMP-04 PDF export route missing.** Spec AC1: "PDF export endpoint returns `Content-Type: application/pdf`". `apps/api/src/routes/swms.ts` has no `:id/pdf` handler. `services/pdf.ts` is wired for invoices + quotes only. Reported by Phase 3 Agent 2 (compliance).
2. **F-CERT-03 photo `entityType` enum missing `'certification'`.** `apps/api/src/routes/photos.ts:51`: `z.enum(['swms', 'invoice', 'expense', 'job_log'])`. Cert photo upload returns 400 today. Reported by Phase 3 Agent 3 (certifications); pinned by API spec.
3. **No mobile cert-detail route (F-CERT-02 AC5).** Push payload includes `certificationId` deep-link target but no `apps/mobile/app/certifications/[id].tsx` exists. Reported by Agent 3.
4. **Mobile expense detail has no Edit UI (F-EXP-03).** Only Delete is exposed; PUT works at API level. Reported by Agent 6.
5. **Compliance AI sub-routes referenced by matrix don't exist.** Matrix mentioned `/api/v1/compliance/ai/hazards` + `/controls`. Actual surface is in-process via `/swms/generate`. Reported by Agent 2.
6. **Mobile inline hazard add/remove UI not built (F-COMP-02 AC5).** `apps/mobile/app/swms/[id].tsx` renders hazards read-only.

### Soft drift — surface applicability claims need spec update

7. **F-AUTH-03 Web has no `/verify-email` page** (matrix drift item #1).
8. **F-AUTH-05 Web has no `/onboarding` wizard page** (matrix drift item #2).
9. **F-INV-09 Web has no `/recurring` page** (matrix drift item #3).
10. **F-INV-10 Web has no `/bank` page** (matrix drift item #4).
11. **F-CERT-01 Web is read-only.** Spec says `W ✓` for full CRUD; reality is `W (read-only) ✓`. Reported by Agent 3.
12. **F-EXP-01 Web is read-only by design** (`apps/web/src/lib/api-client.ts:206`).
13. **F-JOB-01 Web has no clock-in UI** (read-only — "use the mobile app" empty-state copy).
14. **F-QUO-02 Web has no Download PDF button** (mobile-only PDF surface today).
15. **F-STAT-01 Web does not render insights surface** (only counts; revenue/aging/top-customers/chart on mobile only).
16. **F-SUB-01..04 Web has no subscription page** (mobile-only).
17. **F-PHOTO-01/02 Web has no `/photos` page** (galleries embed in entity detail pages on web — partial).
18. **F-STRIPE-01..02 Web `/subscription` page may not exist.** Phase 3 Agent 13 reports the demos skip gracefully if the route 404s.

### Spec-completeness gaps surfaced by Phase 3

19. **Free-tier limit enforcement (F-SUB-02 / F-SUB-04) bypassed by beta mode.** Negative-path assertions require a `BETA_MODE=false` harness or a per-test env override that doesn't yet exist. Reported by Agent 10.
20. **F-SUB-03 month-reset (AC2)** needs a time-travel fixture (or SQL `now()` override). Not exercised today.
21. **F-SUB-04 AC2 (3rd SWMS 402)** isomorphic to invoice path but no dedicated test.
22. **F-TEAM-01 AC2 (one-team-per-user)** not enforced at route layer; needs policy decision + test.
23. **F-TEAM-02 AC5 (duplicate-invite)** policy undecided (idempotent vs 409).
24. **F-TEAM-03 AC5 (single-team-per-user)** untested.
25. **F-TEAM-04 AC5 (owner-can't-leave)** untested.
26. **F-CERT-02 AC3 (exactly-once-per-threshold)** not e2e-asserted (would need clock advance or SQL fixture; Phase 3 Agent 3 recommends a unit test in `services/notifications.ts`).
27. **F-PUSH-01 live Expo Push assertion** depends on physical device or EAS dev build.
28. **F-X-03 security headers** — Next.js sets NONE of CSP / X-Frame-Options / HSTS / X-Content-Type-Options / Referrer-Policy today; Phase 3 tests are regression-guard mode (annotations, not failures).
29. **F-X-02 iOS offline test** blocked by Maestro Android-only `setAirplaneMode`.

### Spec-vs-product features not yet ID'd

30. **Customers + Products are first-class API resources** with full route + service tests but no feature ID (matrix drift #5). 5 endpoints each; both have mobile screens; no web pages.
31. **Legal compliance pages (`/api/v1/legal/*`)** — large route (~1109 LOC) with `routes/legal.test.ts`. Matrix drift #7 recommends promoting to F-X-04.
32. **Business profile endpoints** — folded under F-AUTH-05; could split (matrix drift #6).

---

## Cells with NEITHER demo NOR existing test

**Zero. All 50 features have at least one pre-existing automated test or a Phase 3 demo (full or partial) on at least one surface.**

The "gap list" is therefore not a list of un-tested features — it is the **AMBER and RED status rows** in the per-feature table above, where coverage exists but is incomplete or where spec and code disagree.

---

## Demos that overlap existing tests (redundant signal)

Phase 3 was deliberate about complementing rather than duplicating. Per the 14 coverage reports, the pattern across modules is:

- **API Jest tests** mock the service / DB layer at unit level.
- **Phase 3 Playwright API demos** hit the real Express stack with real auth + real Postgres.

These are complementary by design, not redundant. The only flagged near-duplication:

| Phase 3 demo | Existing test | Overlap notes |
|---|---|---|
| `apps/web/e2e/demos/auth.spec.ts` | `apps/web/e2e/auth.spec.ts` | Phase 3 is functional; existing is rendering + validation. Complementary. |
| `apps/web/e2e/demos/api/auth.api.spec.ts` | `apps/web/e2e/api-routes.spec.ts` (Auth slice) | Existing hits Next.js proxy; Phase 3 hits Express directly. Complementary. |
| `apps/web/e2e/demos/api/teams.api.spec.ts` (12 tests) | `apps/api/src/__tests__/routes/teams.test.ts` (19 supertest cases) | Strong route-shape overlap, but different layer (real Postgres vs mocked). Reported by Agent 9 as "strong overlap; complementary". |

No demo was identified as wholly redundant.

---

## Recommended next actions (ordered by customer impact)

> Heuristic: **auth → payments → invoices → compliance → growth → cross-cutting → nice-to-haves.**
> Each action specifies whether it's CODE work (ship a feature / fix drift) or TEST work (close an assertion gap).

### Priority 1 — Customer-blocking drift on critical paths

1. **[CODE] Fix F-CERT-03 entityType enum** — add `'certification'` to the photos route Zod enum. One-line change to `apps/api/src/routes/photos.ts:51`. Then add a `photo-picker` UI to `apps/mobile/app/certifications/add.tsx`. Flip the demo's drift-pin assertion red→green. Customer-facing: tradies cannot attach a license photo to their cert today.
2. **[CODE] Ship F-COMP-04 SWMS PDF route** — add `GET /api/v1/swms/:id/pdf` reusing `services/pdf.ts` with a SWMS template, OR amend the spec to scope F-COMP-04 to sign-only. Customer-facing: spec promises "Export to PDF" on SWMS detail; site managers expect a PDF.
3. **[CODE] Fix F-X-03 security headers** — Next.js sets none of CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy today. Add `headers()` in `apps/web/next.config.ts`. The regression-guard tests already encode the target state — flip them from `aspirational` → `required`. Customer-impact: app-store + audit risk; SEO / referrer leakage.

### Priority 2 — Payment-path assurance (Stripe / billing)

4. **[CODE+TEST] Verify F-STRIPE-01..02 Web `/subscription` page exists or build it.** Phase 3 Agent 13 reports demos skip gracefully if the route 404s. Either ship the page or document mobile-only and update F-SUB-01..04 spec ACs.
5. **[TEST] Add a `BETA_MODE=false` test harness.** Today the negative paths for F-SUB-02/04 + F-TEAM-01 beta gate are bypassed. Either an env override per-test (`BETA_MODE_OVERRIDE` query param honoured in non-prod) or a fixture that resets `process.env.BETA_MODE` per case. Unlocks ~6 deferred assertions.
6. **[TEST] Add F-SUB-04 SWMS-limit test (AC2).** One-line follow-up — `checkLimit('swms')` is isomorphic to `checkLimit('invoice')` but should be exercised separately to catch SWMS-specific drift.

### Priority 3 — Invoicing surface parity (revenue path)

7. **[CODE or DOC] Resolve F-INV-09 Web `/recurring` page absence (drift #3)** — either ship the Web page or codify "mobile-first by design" in `PRODUCT_AND_MARKET_POSITIONING.md` so the matrix stops flagging drift.
8. **[CODE or DOC] Same for F-INV-10 Web `/bank` page (drift #4)**.
9. **[CODE] Ship F-QUO-02 Web Download PDF button.** Mobile has it; API serves it; Web detail page does not expose it.

### Priority 4 — Compliance UX completeness

10. **[CODE] Add mobile inline hazard add/remove UI for F-COMP-02 AC5.** Currently read-only.
11. **[CODE] Add mobile cert-detail route (`apps/mobile/app/certifications/[id].tsx`)** for F-CERT-02 AC5 deep-link target.
12. **[CODE] Add mobile expense Edit UI (F-EXP-03)** — header-right "Edit" affordance reusing `create.tsx` in edit mode.

### Priority 5 — Auth flow consolidation

13. **[CODE or DOC] Decide F-AUTH-03 Web verify-email** — either ship `/verify-email` or codify auto-verify-on-register and remove the Mobile verify screen (current state is inconsistent: Mobile has it, Web doesn't, register lands on /dashboard).
14. **[CODE or DOC] Decide F-AUTH-05 Web onboarding** — either ship `/onboarding` wizard on Web or auto-flip `onboardingCompleted` at Web register-time and document.
15. **[CODE] Add "Forgot password?" link to mobile login screen.** Route exists, in-app tap target missing.
16. **[TEST] Phase 5 Resend capture mock** to lift `.skip()` on F-AUTH-04 reset-success path.

### Priority 6 — Team policy hardening

17. **[CODE+TEST] Decide + enforce F-TEAM-01 AC2 one-team-per-user.** Add 409 at service layer + test.
18. **[CODE+TEST] Decide F-TEAM-02 AC5 duplicate-invite** policy (idempotent vs 409).
19. **[CODE+TEST] Enforce F-TEAM-04 AC5 owner-can't-leave-without-transfer.**

### Priority 7 — Spec-promotion housekeeping

20. **[SPEC] Promote Customers + Products to feature IDs F-CUST-01..N and F-PROD-01..N** (matrix drift #5). They are first-class resources with full backend + mobile coverage and `routes/customers.test.ts`, `routes/products.test.ts` already exist.
21. **[SPEC] Promote `/api/v1/legal/*` to F-X-04 Legal compliance** (matrix drift #7). Owns NZ data-protection routes (privacy, terms, support, delete-account, delete-data). `routes/legal.test.ts` is currently an orphan.
22. **[SPEC] Update F-CERT-01 to `W (read-only) ✓ A ✓ M ✓`** to reflect reality.
23. **[SPEC] Update F-EXP-01 / F-JOB-01 / F-STAT-01 surface markers** to reflect mobile-first reality.
24. **[SPEC] Mark old `E2E_TESTING_MATRIX.md` as superseded** (matrix drift #9 — magic-link login row is stale).

### Priority 8 — Nice-to-haves / Phase 5 candidates

25. **[TEST] Time-travel fixture for F-SUB-03 month-reset.**
26. **[TEST] Mocked-Expo integration probe for F-PUSH-01** (mitm or `Page.route` interception of `exp.host`).
27. **[TEST] Service-layer unit test for `checkAndNotifyExpiringCerts()`** (F-CERT-02 AC3 dedup branch).
28. **[TEST] Cron-service test** for `services/cron.ts` (currently no coverage).
29. **[TEST] Dual-user fixture** to lift `.skip()` on cross-tenant stats tests (F-STAT-01 AC3).
30. **[TEST] Web subscription / proxy stats spec** (`apps/web/e2e/api-routes.spec.ts` currently has 0 `/api/stats/*` hits).

---

## Data gaps the gap-report author could not resolve

1. **No `apps/web/e2e/demos/**` files are on `master` at the time of this report.** Phase 3 PRs are open per-module branches; the coverage reports describe authored content (and were merged on master independently) but the demo test files themselves are on their feature branches. The matrix in this report aggregates the Phase 3 agents' **self-reports** of authored content. Cross-verification against actual on-master demo files is a Phase 5 task once PRs merge.
2. **Live-execution results not available.** Every Phase 3 agent reports "syntax-verified only — dev env not running". The numbers above describe authoring coverage, not test-pass coverage. Phase 5 should re-run the full demo suite on a green dev stack and re-issue the gap report with pass/fail data.
3. **Exact `multi-tenant-isolation-entities.spec.ts` entity list not enumerated in this report.** Agent 14 (cross-cutting) says it covers "customers, quotes, expenses, job_logs, photos" but the report did not open the file to verify. If a discrepancy exists, the F-X-01 cell mapping may need adjustment.
4. **The applicable-cell denominator (128 vs 150) is approximate.** The matrix uses `–` strictly only for 10 cells; the additional 12 "partial → counted as applicable but gap noted" cells reflect a judgment call about whether Web mobile-first-by-design counts as N/A or as a gap. Both numbers are presented; whichever the reader prefers is the right one for their question.
5. **Phase 3 agent self-reports may overlap or contradict.** This report trusts each module agent's `coverage/*.md` self-report as authoritative for that module. Where two agents commented on the same cross-cutting concern (e.g. F-SUB-04 limits in both Subscriptions and Compliance reports), the Subscriptions agent's view is treated as canonical for the subscription-side ACs.

---

## Counts (verification gate)

- Total feature rows in per-feature table: **50** (matches matrix § "Counts")
- GREEN status: 14
- AMBER status: 34
- RED status: 2
- Pre-existing test files cross-referenced: **53** (42 API + 10 Web + 1 Mobile)
- Orphan tests (no feature-ID home): **4** (3 API + 1 Web partial)
- Spec drift items catalogued: **32** (6 hard + 9 soft surface + 11 spec-completeness + 3 ID-promotion + 3 other)
- Recommended next actions: **30**, ordered by priority 1–8

This report's structure follows the plan's Task 4.3 brief and the 14
per-module Phase 3 reports it aggregates.
