# Subscriptions — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 10 (subscriptions)
**Spec source:** `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 10 — Subscriptions
**Plan reference:** `docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md` Phase 3 TEMPLATE Tasks M.1–M.6

## Module character (read this first)

The Subscriptions module is **predominantly API-driven**. Tier definitions,
gating, usage counters, and limit enforcement are all middleware behaviours
in `apps/api/src/middleware/subscription.ts` and route handlers in
`apps/api/src/routes/subscriptions.ts`. The web app has **no dedicated
subscription page** (see `apps/web/src/app/(dashboard)/` — only the
mobile app at `apps/mobile/app/subscription.tsx` renders the tier
comparison + usage UI).

The matrix correctly marks Module 10 as "primarily API surface
(middleware-driven)". The demos honour this — `api/subscriptions.api.spec.ts`
is the primary file, with the web spec doing smoke / drift-tracking and
the Maestro flows exercising the mobile subscription screen.

## Beta-mode caveat (load-bearing for every assertion)

Per `apps/api/src/services/subscriptions.ts:64` (`isBetaModeFromEnv`),
**`BETA_MODE !== 'false'` (the default) grants every user tradie-level
limits**. This means:

- `requireFeature('quotes')` lets free-tier users through.
- `checkLimit('invoice')` lets free-tier users create unlimited invoices.
- `GET /subscriptions/me` returns `betaMode: true`.

The API tests in this module **branch on `betaMode`** so the suite is
correct under both env states. When `BETA_MODE=false` (Phase B, ~50
users), the negative-path assertions fire; under default beta config,
the bypass-path assertions fire.

## Coverage matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-SUB-01 — View tier definitions | 3 ACs (tiers shape, pricing, mobile/web render) | partial — landing smoke only; no web subscription page | full — 2 tests (GET /tiers shape + canonical NZ pricing; GET /me) | full — `39-sub-tier-view.yaml` asserts Free/Tradie/Team cards + canonical $4.99 / $9.99 | Web AC3 deliberately documented as gap, not broken. |
| F-SUB-02 — Tier gating | 4 ACs (gate fires, error shape, beta bypass, /me feature map) | placeholder — gating affordances not on web | full — 2 tests (POST /quotes branching beta-on/off; GET /me feature map shape) | partial — `40-sub-gating.yaml` exercises the beta banner + upgrade tap; full gating UX deferred until BETA_MODE=false harness exists | API test branches on `betaMode` so the suite is correct in both env states. |
| F-SUB-03 — Usage tracking | 3 ACs (endpoint shape, month-reset, increment-on-POST) | placeholder — no web usage page | full — 3 tests (zero-state shape, increment-after-POST, multi-tenant isolation) | partial — `41-sub-usage.yaml` asserts the "This Month's Usage" section renders | Month-reset (AC2) is not exercised end-to-end — needs a time-travel fixture (Phase 5 candidate). |
| F-SUB-04 — Limit enforcement | 5 ACs (4th invoice 402, 3rd SWMS 402, /limits endpoint, beta bypass, tradie+ unlimited) | placeholder — no web upgrade prompt | full — 3 tests (GET /limits shape; 4th-invoice branching; remaining-is-null on unlimited) | partial — `42-sub-limit-enforcement.yaml` documents the flow and screenshots either the create form (beta-bypass) or upgrade banner (real free) | AC2 (3rd SWMS 402) not separately tested — assumed isomorphic to the AC1 invoice path via the same `checkLimit` middleware. Phase 4 may want a dedicated SWMS-limit test for completeness. |

**Surface totals:**
- W: 4 tests (1 smoke + 3 documented-gap placeholders)
- A: 10 tests across 4 feature IDs (1 + 2 + 3 + 3 + the 4-of-5 negative-path branches)
- M: 4 Maestro flows (one per feature ID, numbered 39-42)

## Gaps surfaced

1. **No web subscription page.** F-SUB-01 AC3 says "Mobile + Web subscription screens render the comparison" but `apps/web/src/app/(dashboard)/subscription/` does not exist. Two product options for Phase 4: (a) ship a Next.js subscription page that mirrors the mobile UI, or (b) update the AC to "Mobile renders, Web defers to mobile". The product is mobile-first per CLAUDE.md so option (b) is the lower-cost path.

2. **No BETA_MODE=false harness toggle.** Every negative-path assertion in the API tests has to branch on `betaMode` because the test runner has no way to flip `BETA_MODE` per test. Phase 5 candidate: add a `BETA_MODE_OVERRIDE` query param honoured only in `NODE_ENV !== 'production'`, OR build a per-test fixture that resets `process.env.BETA_MODE` between cases (the underlying service already reads env at call time per `apps/api/src/services/subscriptions.ts:64`).

3. **F-SUB-03 month-reset (AC2) not exercised end-to-end.** The `getTierUsage` query uses `date_trunc('month', CURRENT_DATE)` (apps/api/src/services/subscriptions.ts:209). Verifying the reset behaviour requires either (a) time-travel via a SQL `now()` override, or (b) a pg fixture that inserts an invoice with `created_at = previous_month`. Phase 5 candidate.

4. **F-SUB-04 AC2 (3rd SWMS 402) not separately tested.** The `checkLimit('swms')` path is identical to `checkLimit('invoice')` so the existing invoice test is a reasonable proxy, but a dedicated SWMS-limit test would catch SWMS-specific drift (e.g. if someone changes the SWMS limit from 2 to 3 in `TIER_LIMITS` but the matrix still says 2). One-line follow-up.

5. **Mobile flows assume an existing logged-in session.** Maestro flows 39-42 don't run `clearState: true` (unlike the `00-smoke` flow) — they assume a prior auth flow has left a session in place. Phase 5: introduce a Maestro pre-flow fixture that registers + logs in, then runs the subscriptions suite.

6. **Stripe checkout (`POST /subscriptions/checkout`) and portal (`POST /subscriptions/portal`) endpoints not covered.** These are explicitly out-of-scope for Phase 3 per the spec matrix (which focuses on F-SUB-01..04 — tier definitions, gating, usage, limits). The Stripe flow is gated by `BETA_MODE=false`. Phase B (~50 users) should add a Module 10b — Stripe Checkout coverage agent.

## Existing test coverage cross-check

- **API** (`apps/api/src/__tests__/`):
  - `routes/subscriptions.test.ts` — unit tests of the route handlers with mocked services + db (covers GET /tiers, /me, /usage, /limits, /checkout, /portal). Phase 3 API demos exercise the same endpoints against the real Express stack with real auth, so they're complementary.
  - `middleware/subscription.test.ts` — exhaustively tests `attachSubscription`, `requireTier`, `requireFeature`, `checkLimit` at the unit level. No surface overlap with Phase 3 (Phase 3 exercises the middleware *transitively* via the endpoints it guards).
  - `services/subscriptions.test.ts` — service-level tests of tier-limit logic, beta-mode, `canCreateInvoice`, `canCreateSwms`, etc. No surface overlap.

- **Web** (`apps/web/e2e/`):
  - No existing subscription-specific E2E. `apps/web/e2e/auth.spec.ts` covers register / login which is the entry point to the subscription screen on mobile.

- **Mobile** (`apps/mobile/__tests__/` and `.maestro/`):
  - No existing Maestro subscription flows before this agent — `00-smoke-app-launches.yaml` is the only pre-existing flow.

## Commands to run this module's demos

```bash
# Web (smoke + drift-tracking)
cd apps/web && npx playwright test e2e/demos/subscriptions.spec.ts --workers=1

# API (primary surface — 10 tests across F-SUB-01..04)
cd apps/web && npx playwright test e2e/demos/api/subscriptions.api.spec.ts --workers=1

# Mobile (requires simulator + authenticated session)
cd apps/mobile && maestro test .maestro/39-sub-tier-view.yaml
cd apps/mobile && maestro test .maestro/40-sub-gating.yaml
cd apps/mobile && maestro test .maestro/41-sub-usage.yaml
cd apps/mobile && maestro test .maestro/42-sub-limit-enforcement.yaml
# Or all four at once:
cd apps/mobile && maestro test .maestro/ --include-tags=subscriptions
```

## Real-services cost note

- **Stripe**: no Stripe API calls are made — the checkout / portal endpoints are out of scope for this agent.
- **Resend**: no email sends.
- **Claude API**: no AI calls.
- **Database**: every test registers + cleans up an ephemeral user (`@example.test` domain). User cleanup cascades to any invoices created (F-SUB-03 / F-SUB-04 setup).

Net cost per full run: **$0**.

## Out-of-scope items observed during this work (for Phase 4 pickup)

1. The CLAUDE.md `Stripe metadata field 'trademate_user_id'` warning is a renaming-contract guard, not a test gap — flagged so Phase 4 doesn't accidentally propose renaming it.

2. The subscription route uses `req.user!.userId` non-null assertion (`apps/api/src/routes/subscriptions.ts:56,90,124`). The authenticate middleware does enforce this, but a defensive guard wouldn't hurt — out of scope here (it's a refactor, not a test).

3. The mobile subscription screen does NOT show usage when `usage` state is null (`apps/mobile/app/subscription.tsx:305`). If the API call to `/usage` fails silently (line 134 `catch { /* Silently fail */ }`), the user gets a degraded screen with no error. UX gap — flagged for product, not for tests.
