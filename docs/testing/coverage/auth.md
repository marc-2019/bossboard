# Authentication — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 1 (auth)
**Spec source:** `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 1 — Authentication
**Plan reference:** `docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md` Phase 3 TEMPLATE Tasks M.1–M.6

## Coverage matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-AUTH-01 — Register account | 5 ACs | partial — 1 test covers AC1 + AC3 + AC4 + AC5 via headed flow; AC2 (duplicate email) lives on API surface | full — 4 tests (AC1, AC2, AC3, AC4) | full — 01-auth-register.yaml | Web routes to `/dashboard` not `/verify-email` (drift item #1 already in matrix); demo tolerates either landing. |
| F-AUTH-02 — Login | 5 ACs | full — 1 test covers AC5 (login + redirect + reload persistence) | full — 2 tests cover AC1+3+4 (round-trip) + AC2 (wrong pw) | full — 02-auth-login.yaml | Maestro flow uses a known seeded account; for fully self-contained runs the sequence should be `01 → 02`. |
| F-AUTH-03 — Email verification | 5 ACs | drift-tracking only (no `/verify-email` web page) | full — 3 tests cover AC1+2 (verify w/ correct code), AC3 (wrong code 4xx), AC4 (resend regenerates) | full — 03-auth-verify-email.yaml | API tests `.skip()` when `verificationCode` is not in the response (i.e. running against `NODE_ENV=production` env). Phase 5: Resend capture mock removes the skip. |
| F-AUTH-04 — Password reset | 5 ACs | full — 1 test covers AC5 (forgot → success → reset screen with email pre-filled) | partial — AC1 (forgot anti-enumeration), AC3 (bad-code 4xx) both done; AC3+4 success path is `.skip()`-deferred to Phase 5 Resend mock | full — 04-auth-password-reset.yaml | Mobile flow uses `openLink` because the mobile login screen does not yet expose a "Forgot password?" affordance — flagged as future product enhancement. |
| F-AUTH-05 — Onboarding wizard | 5 ACs | drift-tracking only (no `/onboarding` web page) | full — 1 test covers AC1+2+3 (PUT /me + PUT /business-profile + POST /complete-onboarding + GET /me) | full — 05-auth-onboarding.yaml | Mobile wizard exists; Web users currently onboard via `/settings`. Matrix drift item #2 captured in test. |

**Surface totals:**
- W: 5 tests (3 functional + 2 drift-tracking)
- A: 11 tests across 5 feature IDs
- M: 5 Maestro flows (one per feature ID)

## Gaps surfaced

1. **Web `/verify-email` missing (matrix drift item #1).** Web register lands on `/dashboard` directly (`apps/web/src/app/(auth)/register/page.tsx:27`), skipping verification entirely. Either (a) add a Web verify-email page that polls the API and gates dashboard access, or (b) document that web users are auto-verified at register-time and remove the Mobile verify-email screen — current state has them inconsistent.

2. **Web `/onboarding` wizard missing (matrix drift item #2).** Web users do not get the 3-step wizard. Settings page covers the same data shape (`PUT /api/v1/business-profile`), but the onboarding-completion flag (`completeOnboarding`) appears Mobile-only on the UI side. Consider whether to (a) build the Web wizard, or (b) auto-flip `onboardingCompleted` on Web at register-time.

3. **Mobile login screen has no "Forgot password?" link.** The route `/(auth)/forgot-password` exists and is reachable via deep link (which the Maestro flow exploits), but there is no in-app tap target on the login screen. Cheap product fix.

4. **F-AUTH-04 reset-success path is execution-deferred.** Without a Resend capture mock or a dev-mode response field, the test cannot read the reset code mid-flight. Two options for Phase 5: (a) extend the API to surface `resetCode` in non-prod responses (mirrors the existing `verificationCode` pattern), or (b) ship a Resend-capture stub server.

5. **Brute-force lockout (429) thresholds are not exercised.** `apps/api/src/routes/auth.ts:14` sets `MAX_CODE_ATTEMPTS=5`, but no demo intentionally hammers the endpoint to verify the 429 path. Could be added as an AC-6 to F-AUTH-03 and F-AUTH-04.

## Existing test coverage cross-check

- **API** (`apps/api/src/__tests__/`):
  - `routes/auth.test.ts` — covers register / login / refresh / logout / verify-email / forgot-password / reset-password with mocked auth service. Phase 3 demos exercise the same endpoints against the real Express stack, so this is complementary rather than overlapping.
  - `services/auth.test.ts` — service-level (Drizzle) tests. No surface overlap with Phase 3.
  - `middleware/auth.test.ts` — JWT decode + claim tests. No overlap.
  - `routes/business-profile.test.ts` — exercised indirectly by F-AUTH-05 demo (PUT /business-profile during onboarding).
- **Web** (`apps/web/e2e/`):
  - `auth.spec.ts` — covers login / register form rendering + validation + "API down" error message. The Phase 3 `demos/auth.spec.ts` is **functional** rather than rendering-focused, so the two are complementary.
  - `api-routes.spec.ts` — Next.js API-route proxy tests. Hits the proxy layer; Phase 3 API spec hits Express directly. Both are valuable.
  - `password-reset-smoke.spec.ts` — prod-URL smoke for the forgot/reset endpoints. Phase 3 demo is dev-stack focused. Together they catch both regressions and deploy drift.
  - `multi-tenant-isolation.spec.ts` / `multi-tenant-isolation-entities.spec.ts` — relies on register flow; uses the same `helpers/test-data.ts` patterns Phase 3 imports.
- **Mobile** (`apps/mobile/__tests__/`):
  - `contexts/AuthContext.test.tsx` — unit-level coverage of the context's `login` / `register` / `logout` state transitions. No Maestro overlap.

## Verification (no execution — env not running)

Per the dispatching prompt, Marc's dev environment is NOT running (no docker containers, no `.env` file). Execution is **deferred**. Syntax-checked via:

- **Playwright list output** — see PR description for the captured `npx playwright test --list` output. Verifies the spec files parse and tests register without throwing at module-evaluation time.
- **Maestro YAML parse** — each `.maestro/*.yaml` parsed with `python3 -c "import yaml; list(yaml.safe_load_all(open('<flow>.yaml')))"`. All 5 flows parse OK.

Live execution will happen in Phase 4 / Phase 5 once the env-bootstrap landing is complete.

## Commands to run this module's demos (post-env-bootstrap)

```bash
# Web (headed, serial, video on — per the demo config that Phase 4 will land)
cd apps/web
npx playwright test e2e/demos/auth.spec.ts --headed --workers=1

# API only (no browser)
cd apps/web
npx playwright test e2e/demos/api/auth.api.spec.ts --workers=1

# Mobile (requires a running iOS simulator or Android emulator)
cd apps/mobile
maestro test .maestro/01-auth-register.yaml .maestro/02-auth-login.yaml \
              .maestro/03-auth-verify-email.yaml .maestro/04-auth-password-reset.yaml \
              .maestro/05-auth-onboarding.yaml

# Or the entire batch
cd apps/mobile
maestro test .maestro/0{1..5}-auth-*.yaml
```

## Files this PR adds

- `apps/web/e2e/demos/auth.spec.ts` — 5 Playwright tests (one per feature ID)
- `apps/web/e2e/demos/api/auth.api.spec.ts` — 11 API tests across 5 feature IDs
- `apps/web/e2e/demos/helpers/auth.ts` — unique-email gen, demo persona pool, cleanup helpers
- `apps/mobile/.maestro/01-auth-register.yaml`
- `apps/mobile/.maestro/02-auth-login.yaml`
- `apps/mobile/.maestro/03-auth-verify-email.yaml`
- `apps/mobile/.maestro/04-auth-password-reset.yaml`
- `apps/mobile/.maestro/05-auth-onboarding.yaml`
- `docs/testing/coverage/auth.md` — this file
