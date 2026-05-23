# BossBoard Demo Runbook

Operator-facing how-to for running the v0.5.0 e2e demo + spec coverage suite.

**Companion docs:**
- [`SPEC_AND_DEMOS_MATRIX.md`](./SPEC_AND_DEMOS_MATRIX.md) — the 50-feature spec the demos exercise.
- [`DEMO_HIGHLIGHTS.md`](./DEMO_HIGHLIGHTS.md) — stakeholder index of recorded videos / screenshots after a run.
- [`env-required.md`](./env-required.md) — env-var inventory from Phase 0 (may be absent if Phase 0 hasn't landed; see "Environment note" below).
- [`coverage/`](./coverage/) — per-module spec-vs-demo coverage reports from Phase 3.

---

## Pre-requisites

1. **Infrastructure up.** From repo root:
   ```bash
   docker compose up -d
   # Brings up bossboard-postgres (29432) + bossboard-redis (29379).
   ```
   Verify:
   ```bash
   docker exec bossboard-postgres pg_isready -U bossboard
   docker exec bossboard-redis redis-cli ping
   ```

2. **API running.** New terminal:
   ```bash
   cd apps/api && npm run dev
   # Listens on http://localhost:29000
   ```

3. **Web running.** New terminal:
   ```bash
   cd apps/web && npm run dev
   # Listens on http://localhost:3000
   ```

4. **Mobile simulator running** (for mobile demos only — `demo:mobile` and the mobile portion of `demo:all`):
   - **iOS:** `xcrun simctl boot "iPhone 15"` (or open Xcode → Simulator → boot any device)
   - **Android:** open Android Studio → AVD Manager → start an emulator
   - Maestro auto-detects whichever simulator/emulator is running.

5. **Env vars set.** See `docs/testing/env-required.md` for the required set. Phase 0 of the plan documents what was actually configured in May 2026.

   **Environment note (2026-05-23):** Phase 0 found that the dev env was **not** fully configured (no docker containers up, no `apps/api/.env`). The Phase 3 module agents (per their TEMPLATE) were authorised to use mocks/stubs for Stripe webhooks, Resend captured-only sends, and Claude canned SWMS responses when live services were unavailable. See `audit/marc-decision-bb-session-learnings-2026-05-23.md` (if present) for L1/L2 context. Until env-required.md is filled in by a Phase 0 run, **assume the demos use mocks** for Stripe, Resend and Claude. Switching to real services is a separate Phase 0 verification.

---

## Run all demos

```bash
npm run demo:all
```

Wall clock: **~45–60 min** with all surfaces (Web headed at `workers=1` for watchability is the long pole). Output:

- Web videos in `apps/web/test-results/<test-name>/video.webm`
- Playwright HTML report in `apps/web/playwright-report-demos/` (open `index.html` in a browser)
- Mobile screenshots in `apps/mobile/.maestro/screenshots/`

`demo:all` runs (in this order):
1. **Phase 0 preflight** — runs `docs/testing/preflight.sh` if present; otherwise skips with a note.
2. **Web demos** — `cd apps/web && npx playwright test e2e/demos/ --headed --workers=1`
3. **API demos** — `cd apps/web && npx playwright test e2e/demos/api/ --workers=2`
4. **Mobile demos** — `cd apps/mobile && maestro test .maestro/`. Mobile failures are logged but do **not** abort the run (so Web + API artifacts are preserved even when no simulator is attached).

---

## Run a single surface

```bash
npm run demo:web      # Playwright headed, serial (workers=1)
npm run demo:api      # Playwright API, workers=2
npm run demo:mobile   # Maestro flows (requires simulator)
```

---

## Run a single feature

Replace `F-AUTH-01` with the feature ID from `SPEC_AND_DEMOS_MATRIX.md` and the spec filename with the correct module file:

```bash
# Web — headed video of one feature
cd apps/web && npx playwright test e2e/demos/auth.spec.ts -g "F-AUTH-01" --headed

# API — one feature
cd apps/web && npx playwright test e2e/demos/api/auth.api.spec.ts -g "F-AUTH-01"

# Mobile — one Maestro flow by file
cd apps/mobile && maestro test .maestro/02-auth-register.yaml
```

The grep flag `-g` matches against the test title. Maestro doesn't have a per-test grep — it runs whole `.yaml` files.

---

## Reset state between runs

A clean DB makes demos repeatable (otherwise unique-email guards prevent re-running F-AUTH-01, invoice limit counts carry over, etc.):

```bash
cd apps/api && npm run db:migrate && npm run db:seed
# Or, nuclear option (drops + recreates volumes):
docker compose down -v && docker compose up -d
cd apps/api && npm run db:migrate && npm run db:seed
```

Maestro flows that use `clearState: true` already reset the mobile app's local state per launch — so mobile is usually re-runnable without DB intervention.

---

## Stakeholder asynchronous review

Point stakeholders at `docs/testing/DEMO_HIGHLIGHTS.md`. After `npm run demo:all` lands, the file paths it lists are populated. The Playwright HTML report (`apps/web/playwright-report-demos/index.html`) embeds the videos directly — share that single file for a self-contained handoff.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Maestro: no devices connected` | No simulator/emulator running | Start one (iOS: `xcrun simctl boot "iPhone 15"`; Android: AVD Manager). The runner logs a WARN but continues. |
| Playwright web tests time out connecting to `localhost:3000` | apps/web not running | `cd apps/web && npm run dev` |
| API tests return 500 / ECONNREFUSED `:29000` | apps/api not running, or docker services down | Start API (`cd apps/api && npm run dev`); verify `docker compose ps` shows postgres + redis. |
| `401 Unauthorized` from Stripe in F-STRIPE-* | `STRIPE_TEST_SECRET_KEY` not set, or it's a live-mode key | Set a test-mode key (`sk_test_...`); see Phase 0 preflight. |
| `Resend 422` (from-domain not verified) | Resend from-address is a domain you haven't verified | Use `onboarding@resend.dev` + `delivered@resend.dev` recipient in tests (Resend test-mode helpers). |
| Claude API 401 / 429 | `ANTHROPIC_API_KEY` missing or rate-limited | Set the key; SWMS gen tests are capped at 1–2 calls per full run by plan Phase 3 risk callout. |
| `demo:all` exits after web phase | Web demo failed | Run `npm run demo:web` standalone to see the failure inline; check `apps/web/playwright-report-demos/`. |
| Video files missing under `test-results/` | `video: 'on'` not configured for this run | Confirm `apps/web/playwright.demos.config.ts` has `use: { video: 'on' }` (set by Phase 3 Module agents). |
| F-AUTH-01 fails with "email already exists" on second run | Stale DB state | Reset DB (see above). |
| Mobile flow fails mid-run with `tapOn: element not found` | App state drift (e.g. logged in already when flow assumed logged out) | Most Maestro flows use `clearState: true`; if not, manually uninstall + reinstall the app, or add `clearState: true` to the flow. |

---

## Known mock/real-service caveats (2026-05-23)

The Phase 3 module agents shipped demos against mocked external services because the dev env wasn't fully configured at the time. The following features have demos that are **mock-backed by default** until Phase 0 lands a verified real-services run:

- **F-COMP-01 / F-COMP-02 / F-COMP-03** — Claude SWMS generation: canned response unless `ANTHROPIC_API_KEY` is set + a real-services config flag is flipped.
- **F-INV-07** — Resend email send: captured-only (no real outbound email) unless `RESEND_API_KEY` is set.
- **F-STRIPE-01 / F-STRIPE-02 / F-STRIPE-03 / F-STRIPE-04** — Stripe checkout / webhooks: stubbed unless `STRIPE_TEST_SECRET_KEY` + `STRIPE_TEST_WEBHOOK_SECRET` are set.
- **F-PUSH-01** — Expo Push: dispatched to a captured-only test sink unless `EXPO_PUSH_*` is configured.

Each module's `docs/testing/coverage/<module>.md` report flags whether the demos used real or mocked services.

---

## CI integration (out of scope, but noted)

`npm run demo:all` is currently designed for **operator-driven local runs** (headed Playwright; needs a simulator for mobile; ~45–60 min wall-clock). CI integration is out of scope for Phase 5. A headless variant for CI would drop `--headed`, drop the Maestro step (CI runners don't have iOS simulators), and rely on the existing `apps/api/__tests__/` Jest suite for API regressions. Tracked as a Phase 6+ follow-up.
