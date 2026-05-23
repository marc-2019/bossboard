# Module 7 — Job logs — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 7 (job-logs)
**Spec source:** `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 7 — Job logs
**Branch:** `feat/e2e-demos-job-logs-2026-05-23`

---

## Coverage table

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| **F-JOB-01** — Create job log + clock in | 4 ACs | ✓ AC1 (list surfaces active log), AC3 (`/active` semantics demonstrated via list refresh after seeded clock-in) | ✓ AC1 (201 + status='active'), AC2 (subscription gate inherited from middleware — covered by existing Jest test), AC3 (`/active` returns seeded log), validation failure path | ✓ AC1 (form fills + submit), `29-job-clock-in.yaml` | Web AC1+AC3 use API-seeded clock-in (no clock-in affordance on web — see Drift §1). |
| **F-JOB-02** — Clock out + add notes | 3 ACs | ✓ AC1 (badge flips to "Ended" after API clock-out), filter list correctness | ✓ AC1 (200 + status='completed' + endTime), AC2 (PUT updates notes post-clock-out), validation: notes >2000 chars rejected | ✓ AC1 + AC2 (clock out from detail screen + notes), `30-job-clock-out.yaml` | Continuity between flows 29 → 30 is by filename order. |
| **F-JOB-03** — Job log stats | 2 ACs | ✓ AC1 (stats summary card "Active now" / "Logged time" / "Total logs") | ✓ AC1 (200 + stats shape), AC2 (multi-tenant isolation: B does not see A's data) | ✓ AC1 (stats card visible at top of list), `31-job-stats.yaml` | Web stats card is rendered client-side from the same `/list` response; native `/stats` aggregation is exercised on API + Mobile. |

**Surface totals:** W ✓ A ✓ M ✓ — all 3 features covered on all 3 surfaces.

---

## Gaps surfaced

### Drift §1 — Web has no clock-in UI

The web dashboard at `/job-logs` is **read-only**. The empty-state copy
in `apps/web/src/app/(dashboard)/job-logs/page.tsx:164-168` explicitly
directs users to the mobile app:

> "Clock in to a job from the BossBoard mobile app to track your time on
> site."

**Implication:** the web demo flow `apps/web/e2e/demos/job-logs.spec.ts`
seeds clock-in / clock-out via the API request fixture, then verifies the
web list reflects state. This is realistic (tradies clock from phone,
review from desktop) but means the web spec is NOT an end-to-end driver
of the create + clock-out journey — only the read surface.

**Recommendation:** keep web read-only by design unless a UX research
signal says office staff want desktop clock-in.

### Drift §2 — Server clock not freezable from Playwright

Clock-in / clock-out duration math runs server-side via `Date.now()`
inside `apps/api/src/services/job-logs.ts`. Playwright `page.clock` API
can freeze the **browser** clock but not the Express server clock. The
API spec consequently relies on:

- Short test runtime (clock-in + clock-out within seconds → endTime > startTime).
- Existence assertions, not exact-duration assertions.

For precise duration math (e.g. "exactly 3h45m"), the Jest route tests in
`apps/api/src/__tests__/routes/job-logs.test.ts` mock the service layer
and are the right home.

### Drift §3 — No web spec for the "one-active-job-per-user" invariant

The matrix lists AC4 for F-JOB-01: "Only one active job at a time per
user (confirm in Phase 3)." The Jest test
`apps/api/src/__tests__/routes/job-logs.test.ts:84-94` covers the
`ALREADY_CLOCKED_IN` error path (mocked service). This Phase 3 work does
not add a duplicate web/API demo for the same path — it's already tested
where the mock makes the assertion stable. Flagged here for Phase 4.

---

## Existing test coverage cross-check

| Existing test | Covers |
|---|---|
| `apps/api/src/__tests__/routes/job-logs.test.ts` | F-JOB-01 (create + 400 validation + 409 already-clocked-in), F-JOB-01.AC3 (`/active`), F-JOB-02 (clock-out + notes), F-JOB-03 (`/stats`), F-JOB CRUD via PUT + DELETE |
| `apps/api/src/__tests__/services/job-logs.test.ts` *(verify exists)* | Service-layer logic (mocked DB) |
| `apps/web/e2e/multi-tenant-isolation-entities.spec.ts` | Job-log isolation (if it covers this entity — Phase 4 to confirm exact entity list) |
| `apps/mobile/__tests__/` | No mobile job-logs unit tests as of 2026-05-23 |

**Net new coverage from this branch:**
- 8 API demo cases (Playwright `request` fixture against real Express).
- 3 Web demo cases (Playwright headed, multi-tenant + filter + empty-state).
- 3 Maestro flows (clock-in, clock-out, stats).

---

## Commands to run this module's demos

> **Pre-req:** docker-compose up; `apps/api` on :29000; `apps/web` on :3000;
> for mobile, a running simulator/emulator.

```bash
# Web (headed, serial — watchable demo mode)
cd apps/web
npx playwright test e2e/demos/job-logs.spec.ts --headed --workers=1

# API (parallel OK — uses ephemeral users)
cd apps/web
npx playwright test e2e/demos/api/job-logs.api.spec.ts --workers=2

# Mobile (requires simulator running)
cd apps/mobile
maestro test .maestro/29-job-clock-in.yaml .maestro/30-job-clock-out.yaml .maestro/31-job-stats.yaml
# or by tag:
maestro test .maestro/ --include-tags=job-logs
```

## Cost note

Job-logs demos do **not** call paid APIs — no Stripe, no Claude, no
Resend send. Real-services cost for this module = $0. The only external
service touched is Postgres (docker-compose).

## Out-of-scope flags (for Phase 4 to pick up)

1. No demo for `POST /api/v1/job-logs/:id/clock-in` (route doesn't exist —
   clock-in is the create call; flagged so anyone reading the spec
   doesn't expect a separate route).
2. No demo for desktop clock-in UI (drift §1) — by design.
3. No demo for "one active job at a time" enforcement on a per-surface
   basis (drift §3) — already covered by Jest test.
