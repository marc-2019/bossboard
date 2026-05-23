# Compliance — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 2 (compliance)
**Spec source:** [docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 2 — Compliance](../SPEC_AND_DEMOS_MATRIX.md)
**Branch:** `feat/e2e-demos-compliance-2026-05-23`

---

## Per-feature coverage table

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-COMP-01 SWMS generator | 5 | partial (3 of 5 — read-side ACs 1, 4 list visible; ACs 2/3/5 implicit via list rendering) | full (4 of 5 — templates list, single template, generate happy path, validation; AC 5 free-tier limit deferred to subscriptions agent) | partial (4 of 5 — UI flow asserts trade pick, job desc, submit, success; AC 5 free-tier-limit not exercised) | Web is read-only by design; generation is mobile-first. |
| F-COMP-02 Risk assessment | 5 | partial (1 of 5 — list-status grouping demonstrates persisted state; no edit page on web) | partial (1 of 5 — PUT round-trip covered; AC 2 separate AI sub-route N/A — see drift) | partial (read-only display; no inline-edit UI yet) | Inline hazard add/remove UI is a mobile gap (detail screen renders only). |
| F-COMP-03 NZ regulations | 4 | partial (1 of 4 — site/client NZ context visible; regulations[] field not rendered on web) | partial (2 of 4 — template path includes NZ-reg text; soft-match assertion only) | partial (1 of 4 — HSWA 2015 disclaimer surfaces on generate screen) | Spec says regulations[] is a structured field; code path actually mixes template + AI-augmented body. No dedicated detail page on web. |
| F-COMP-04 PDF export + sign | 5 | partial (1 of 5 — signed-badge in list) | full for SIGN ACs (3, 4 covered) — PDF AC BLOCKED (no `GET /api/v1/swms/:id/pdf` route exists) | partial (sign covered; PDF export NOT covered — share-sheet not Maestro-driveable + no API route) | F-COMP-04 PDF AC is a SPEC-vs-CODE drift gap. |

Legend: full = all ACs covered, partial = ≥1 AC covered but not all, blocked = no implementation found.

---

## Gaps surfaced

1. **DRIFT: agent prompt referenced non-existent compliance/ai/* routes.**
   The prompt said to mock `/api/v1/compliance/ai/hazards` and
   `/api/v1/compliance/ai/controls`. Neither route exists. The actual
   AI-backed surface is `POST /api/v1/swms/generate` (apps/api/src/routes/
   swms.ts:99), with the Claude call in-process via swms.service →
   apps/api/src/services/claude.ts. **Demos mock the real route.**
   *Proposed fix:* update the spec matrix wording so future agents see
   the correct path; consider extracting hazard/control AI to its own
   `/api/v1/compliance/ai/*` namespace if the product wants a stable
   AI-suggestion micro-endpoint for third-party use.

2. **DRIFT: F-COMP-04 PDF AC has no implementing route.**
   Spec AC 1 says "PDF export endpoint returns Content-Type: application/
   pdf". apps/api/src/routes/swms.ts has no `:id/pdf` route. The PDF
   generator (apps/api/src/services/pdf.ts) is wired for invoices and
   quotes only.
   *Proposed fix:* either add a `GET /api/v1/swms/:id/pdf` route that
   reuses pdf.ts with a SWMS template, OR update the spec to scope F-COMP-04
   to sign-only with PDF deferred.

3. **GAP: free-tier SWMS limit (AC 5) not exercised by this module's demos.**
   Subscription limit enforcement (2 SWMS/month for free tier) is checked
   by `checkLimit('swms')` middleware. Cross-module coverage lives with
   the Subscriptions agent (Module 10). This module's demos register
   throwaway users who default to whichever beta tier is active —
   `useAI: false` + single SWMS per test stays under the limit either way.

4. **GAP: web edit page for SWMS does not exist.**
   `apps/web/src/app/(dashboard)/swms/page.tsx` is list-only. No
   `swms/[id]/edit/page.tsx`. F-COMP-02 web edit demos are intentionally
   limited to list-side observability.

5. **GAP: mobile inline hazard add/remove UI not built.**
   `apps/mobile/app/swms/[id].tsx` renders hazards read-only. F-COMP-02
   AC 5 ("Mobile view shows editable hazard list with add/remove
   affordances") is not implementable from the current UI. Maestro flow
   07 asserts the read-side only.

6. **GAP: real-Claude cost guard.**
   Per parent plan, real Claude calls are capped at 2 per full run. All
   API demos use `useAI: false` to stay deterministic and cost-zero. A
   single `.skip`'d AI-ON test in `compliance.api.spec.ts` can be opted
   into via `--grep "AI-ON"` for occasional live validation. Cost: ~$0.01.

---

## Existing test coverage cross-check

| File | Feature coverage |
|---|---|
| `apps/api/src/__tests__/routes/swms.test.ts` (494 lines) | F-COMP-01 (templates list, generate happy path), F-COMP-02 (update), F-COMP-04 (sign). Mocks the service layer — unit-level, not end-to-end. |
| `apps/api/src/__tests__/services/swms.test.ts` | Service-level coverage of SWMS persistence + template merge. |
| `apps/api/src/__tests__/services/claude.test.ts` | Mocked Claude unit tests — verifies prompt shape, not real API. |
| `apps/api/src/__tests__/services/pdf.test.ts` | Invoice/quote PDF only — no SWMS PDF (see drift #2). |
| `apps/web/e2e/*` | **No existing web e2e for compliance.** This module adds the first web spec for SWMS. |
| `apps/mobile/__tests__/*` | **No existing mobile compliance tests.** This module adds the first Maestro flows. |

**Net new coverage delivered by this module:**
- Web: 5 Playwright tests (apps/web/e2e/demos/compliance.spec.ts) — first compliance web e2e
- API: 7 Playwright API tests (apps/web/e2e/demos/api/compliance.api.spec.ts) — end-to-end vs the mocked-service Jest tests
- Mobile: 4 Maestro flows (apps/mobile/.maestro/06-09) — first compliance mobile e2e

---

## Commands to run this module's demos

> NOTE: Authoring-only verification per Phase 3 agent instructions. The dev
> env is NOT running on this branch. The commands below are the canonical
> invocation pattern for when the env IS running (Phase 5 / demo-runner
> phase).

**Web demos (headed, serial):**
```bash
cd apps/web
npx playwright test e2e/demos/compliance.spec.ts --headed --workers=1
```

**API demos (no headed browser needed):**
```bash
cd apps/web
npx playwright test e2e/demos/api/compliance.api.spec.ts --workers=1
```

**API demos including the real-Claude opt-in test (~$0.01 cost):**
```bash
cd apps/web
npx playwright test e2e/demos/api/compliance.api.spec.ts --workers=1 --grep "AI-ON"
```

**Mobile demos (Maestro — requires simulator/emulator running):**
```bash
cd apps/mobile
maestro test .maestro/06-compliance-swms-create.yaml
maestro test .maestro/07-compliance-risk-assessment.yaml
maestro test .maestro/08-compliance-checklist.yaml
maestro test .maestro/09-compliance-pdf-export.yaml
```

**Authoring-only verification (no env required):**
```bash
# Verify Playwright test file parses + lists all tests:
cd apps/web && npx playwright test --list e2e/demos/compliance.spec.ts e2e/demos/api/compliance.api.spec.ts

# Verify Maestro YAML parses (Maestro CLI needed):
cd apps/mobile && maestro test --help # then visually inspect each .yaml
```

---

## Real-services cost note

| Surface | Service | Per-run cost | Mitigation |
|---|---|---|---|
| Web demos | None (all routes mocked via page.route) | $0 | full mock coverage |
| API demos | Postgres + Redis (docker), JWT signing | $0 (local) | `useAI: false` on all SWMS generations |
| API demos [AI-ON] | Anthropic Claude (claude-sonnet-4-20250514) | ~$0.01 / test | `.skip` by default; opt-in via `--grep` |
| Mobile demos | Whatever the mobile build points at | depends on API config | Run mobile build pointing at `USE_LOCAL_LLM=true` or a stub |

---

## Out-of-scope items observed (for Phase 4 to pick up)

- Free-tier SWMS limit (F-COMP-01 AC 5) → Subscriptions module (10).
- Photo attachments on SWMS detail → Photos module (8).
- Push notification on signing → Push module (12).
- Stripe gating for AI-call quota → Stripe module (14) + Subscriptions module (10).
