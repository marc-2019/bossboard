# Cross-cutting — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 14 (cross-cutting)
**Spec source:** docs/testing/SPEC_AND_DEMOS_MATRIX.md § Cross-cutting features

## Coverage matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-X-01 | 3 ACs | partial — see "what this PR adds" | covered (existing) + extended | n/a | Existing P0 specs `multi-tenant-isolation.spec.ts` + `multi-tenant-isolation-entities.spec.ts` are LOAD-BEARING; this PR adds web-surface smoke + SWMS/cert/subscription gaps. |
| F-X-02 | 5 ACs | n/a (Web has no offline mode) | covered — 5 contract tests in `api/cross-cutting.api.spec.ts` | covered (Android-only) — 2 Maestro flows | iOS cannot exercise airplane-mode toggle via Maestro; documented. |
| F-X-03 | 3 ACs | regression-guard tests for 5 headers across 4 public + 5 authed pages | sanity check on `/health` headers | n/a | All 5 headers are `aspirational` today — Next.js config does not set them. Tests land green and surface targets via annotations. |

## What this PR explicitly does NOT duplicate

The following existing tests are the LOAD-BEARING coverage for cross-cutting concerns. This PR references them and FILLS GAPS only — it does not re-implement their assertions:

| Existing spec | Covers | Why we don't duplicate |
|---|---|---|
| `apps/web/e2e/multi-tenant-isolation.spec.ts` | invoices GET-by-id + list isolation | P0 pin; canonical pattern; ours uses the same helper |
| `apps/web/e2e/multi-tenant-isolation-entities.spec.ts` | customers, quotes, expenses, job_logs, photos (parametrised) | covers 5 of the 7 entity types; we add SWMS + certifications |
| `apps/web/e2e/middleware.spec.ts` | auth redirect for protected paths (`/dashboard`, `/swms`, `/certifications`, `/settings`, `/teams`, `/expenses`) | covers REDIRECT logic; doesn't assert response headers |
| `apps/web/e2e/branding.spec.ts` | navy/orange palette, `<title>BossBoard</title>` | covers visual brand; doesn't full-page-scan body text for stale "TradeMate" or assert security headers |
| `apps/web/e2e/page-content-smoke.spec.ts` | per-page core content visible | content not headers |
| `apps/web/e2e/nav-link-smoke.spec.ts` | navigation link integrity | content not headers |
| `apps/web/e2e/production-smoke.spec.ts` | prod URL reachability | content not headers |
| `apps/api/src/__tests__/routes/sync.test.ts` | sync/batch + sync/status with MOCKED db | unit-level; we add E2E with real postgres + auth |

## What this PR ADDS (gap-fill, not duplication)

### Files

| File | Tests added | Surface |
|---|---|---|
| `apps/web/e2e/demos/cross-cutting.spec.ts` | 1 web-surface isolation test (F-X-01) + 9 header tests (F-X-03, 4 public + 5 authed) + 1 brand-leak scan | Web (Playwright headed) |
| `apps/web/e2e/demos/api/cross-cutting.api.spec.ts` | 2 isolation gap tests (SWMS, certifications) + 1 subscription-self test + 5 sync contract tests + 1 API header sanity | API (Playwright request) |
| `apps/web/e2e/demos/helpers/cross-cutting.ts` | shared header expectations + isolation entity table + tradie-pair helper | Web + API |
| `apps/mobile/.maestro/46-offline-create.yaml` | offline invoice create with airplane mode ON | Mobile (Android-only) |
| `apps/mobile/.maestro/47-online-sync.yaml` | sync drain after airplane mode OFF | Mobile (Android-only) |
| `docs/testing/coverage/cross-cutting.md` | this document | — |

### Specific assertions added (gap-fill against existing baseline)

#### F-X-01 — Multi-tenant isolation (gaps filled)

1. **SWMS isolation** (`api/v1/compliance/swms/:id`) — Tradie B cannot read A's SWMS. **Not in either existing isolation spec.**
2. **Certifications isolation** (`api/v1/certifications/:id`) — Tradie B cannot read A's certifications. **Not in either existing isolation spec.**
3. **Subscription self-only** (`api/v1/subscriptions/me`) — A's `/me` response never references B's email and vice versa. **Different shape from id-based probes; not previously tested.**
4. **Web surface smoke** — B signed into web app navigating to `/invoices/<A-id>` does not see A's tagged client name in the rendered DOM. **Existing isolation specs are API-only; this is the customer-facing failure mode.**

#### F-X-02 — Offline sync (full coverage)

1. **POST /sync/batch happy path** — invoice create op accepted, results echoed with same `id`
2. **Empty operations array → 400**
3. **51-op batch → 400** (enforces the 50-op cap)
4. **GET /sync/status shape** — `last_sync_at`, `pending_operations`, `server_timestamp` all present and well-typed
5. **Auth-gated** — no token returns 401 on both endpoints
6. **Mobile end-to-end** — airplane-mode-on → create → airplane-mode-off → assert drain (Android only via Maestro `setAirplaneMode`)

#### F-X-03 — Security headers (regression guard for target state)

For each of 5 headers (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`):
- 4 public web pages probed (`/`, `/login`, `/register`, `/forgot-password`)
- 5 authed-redirect web pages probed (`/dashboard`, `/swms`, `/certifications`, `/invoices`, `/settings`)
- 1 API endpoint probed (`/health`)
- 1 landing-page scan for legacy `TradeMate` string leakage

## Gaps surfaced

1. **Next.js does not set any of the 5 expected security headers today.** `apps/web/next.config.ts` is minimal (output: 'standalone' + body size limit) and `apps/web/src/middleware.ts` does not call `NextResponse.next({ headers })`. The tests in this PR are in **regression-guard mode**: they record the target state via Playwright annotations rather than failing the build. A follow-up PR should:
   - Add a `headers()` function in `next.config.ts` returning CSP + X-Frame-Options + HSTS + X-Content-Type-Options + Referrer-Policy.
   - Switch each header in `SECURITY_HEADERS` (helpers/cross-cutting.ts) from `mode: 'aspirational'` to `'required'`.
   - The same tests then become hard gates.
2. **Sync conflict resolution** — spec F-X-02 AC #5 mentions "conflicts are surfaced (Phase 3 confirm conflict policy)". The current server code in `apps/api/src/routes/sync.ts` returns `ConflictStrategy.SERVER_WINS` by default (per `apps/mobile/src/services/syncQueue.ts:25`) but doesn't actively detect conflicts. This is unchanged from the spec; flagged for Phase 4.
3. **iOS offline testing is blocked** — Maestro's `setAirplaneMode` is Android-only. iOS coverage of F-X-02 currently relies on the unit tests in `apps/mobile/src/services/__tests__/` (need verification — Phase 4 task).
4. **Web has no offline mode** — F-X-02 is explicitly Mobile + API only. Confirmed against `apps/web/src/` — no offline service worker or queue. Out-of-scope for this PR.
5. **Legal compliance pages (F-X-04 candidate)** — `docs/testing/SPEC_AND_DEMOS_MATRIX.md` drift note #7 suggests adding F-X-04 for `/api/v1/legal/*`. Out of scope for this PR; flagging for Phase 4.

## Existing test coverage cross-check (full)

### apps/web/e2e (10 specs)
- `multi-tenant-isolation.spec.ts` — F-X-01 (invoices)
- `multi-tenant-isolation-entities.spec.ts` — F-X-01 (customers, quotes, expenses, job_logs, photos)
- `middleware.spec.ts` — F-X-03-adjacent (auth redirect)
- `branding.spec.ts` — F-X-03 (brand visuals)
- `page-content-smoke.spec.ts` — F-X-03-adjacent (content sanity)
- `nav-link-smoke.spec.ts` — F-X-03-adjacent (nav sanity)
- `production-smoke.spec.ts` — F-X-03-adjacent (prod URL)
- `auth.spec.ts` — F-AUTH module (not F-X)
- `api-routes.spec.ts` — multiple modules
- `password-reset-smoke.spec.ts` — F-AUTH-04 (not F-X)

### apps/api/__tests__
- `routes/sync.test.ts` — F-X-02 (sync unit-level with mocked db)
- Multi-tenant scoping is unit-tested implicitly via `routes/*.test.ts` for each entity but not as a standalone leak probe.

### apps/mobile/__tests__
- `contexts/AuthContext.test.tsx` — F-AUTH related, limited.
- No existing offline-sync test coverage on the mobile side (this is the F-X-02 mobile gap that 46-/47- fills).

## Commands to run this module's demos

> dev env NOT running during PR build (per Phase 3 brief — no execution). Commands below are for the reviewer / a later Phase 4 pass.

- **Web (Playwright headed):**
  ```bash
  cd apps/web && npx playwright test e2e/demos/cross-cutting.spec.ts --headed --workers=1
  ```
- **API (Playwright request):**
  ```bash
  cd apps/web && npx playwright test e2e/demos/api/cross-cutting.api.spec.ts --workers=1
  ```
- **Mobile (Maestro, Android emulator required, see flow headers for caveats):**
  ```bash
  cd apps/mobile && maestro test .maestro/46-offline-create.yaml .maestro/47-online-sync.yaml
  ```

## Verification done in this PR

- `npx playwright test --list` on the web spec — see PR description for output.
- `npx playwright test --list` on the API spec — see PR description for output.
- Maestro YAML parse — `python3 -c "import yaml; yaml.safe_load(open(p))"` for both flows.
- No execution (no real Stripe/Resend/Claude calls): Phase 3 brief is **NO EXECUTION**.

## Real-services cost note

When this suite is later executed (Phase 4 or stakeholder demo):
- Sync API tests do NOT call external services (postgres only).
- Isolation tests call `POST /api/v1/compliance/swms` which **may** invoke Claude if the route falls back to AI hazard generation when explicit hazards aren't sufficient. Cost: ~$0.01 per full run. The fixture in `helpers/cross-cutting.ts:createSwms` supplies pre-filled hazards to minimise this.
- No Resend, no Stripe, no third-party calls.
