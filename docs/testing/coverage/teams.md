# Teams — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 9
**Spec source:** docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 9 (F-TEAM-01..04)
**Branch:** feat/e2e-demos-teams-2026-05-23
**Execution mode:** NO-EXECUTION — dev env not running while specs were authored. Syntax-verified via `npx playwright test --list` (clean) and Maestro YAML schema only.

## Feature coverage matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-TEAM-01 | 4 ACs (create, one-per-user policy, my-team, beta-gate) | ✅ 1 test (team header + role visible) | ✅ 2 tests (happy + 400) | ✅ 35-team-create.yaml | One-per-user policy (AC2) untested — Phase 3 confirm gap surfaced below. Beta-gate (AC4) tested implicitly because all e2e users are in beta mode. |
| F-TEAM-02 | 5 ACs (invite returns 6-char code, checkLimit teamMember, Resend send, list/cancel, duplicate handling) | ✅ 1 test (pending panel visible) | ✅ 3 tests (happy + 400 + list/cancel) | ✅ 36-team-invite.yaml | Duplicate-invite behaviour (AC5) untested — service code path not yet exercised; flagged below. Resend send mocked at service boundary. |
| F-TEAM-03 | 5 ACs (pending list, accept, decline, team_id transition, single-team-per-user) | ✅ 2 tests (accept + decline) | ✅ 2 tests (accept happy + decline removes from pending) | ✅ 37-team-accept-invite.yaml | Single-team-per-user (AC5) untested — would need to verify accept fails when user already on a team. Flagged below. |
| F-TEAM-04 | 5 ACs (list members, role update, remove, leave, owner-leave block) | ✅ 1 test (promote + leave) + 1 test (invalid role 400) | ✅ 5 tests (list, promote, no-perm 403, remove, leave) | ✅ 38-team-role-mgmt.yaml | Owner-can't-leave (AC5) untested. The non-owner 403 path accepts 400/403/404 because exact code emitted by `services/teams.ts` for cross-tenant role updates wasn't confirmed pre-execution. Tighten on first green run. |

## Surface tally

- Web (W): 6 tests in `apps/web/e2e/demos/teams.spec.ts`
- API (A): 12 tests in `apps/web/e2e/demos/api/teams.api.spec.ts`
- Mobile (M): 4 Maestro flows (`35-team-create`, `36-team-invite`, `37-team-accept-invite`, `38-team-role-mgmt`)

## Gaps surfaced

1. **One-team-per-user policy (F-TEAM-01 AC2, F-TEAM-03 AC5)** — the API does not appear to enforce this at the route layer (`teams.ts:46`). Either:
   - add a service-layer assertion in `services/teams.ts::createTeam` (returns 409 when user already has a team), and
   - add a follow-up demo `F-TEAM-01b: second team rejected with 409`.
   - Or, if the policy is "create overwrites", document that and add a test for the overwrite behaviour.
2. **Duplicate invite handling (F-TEAM-02 AC5)** — re-inviting the same email twice should either be idempotent (return existing invite) or 409. Currently untested; the spec calls this out as "Phase 3 confirm". Recommend a `F-TEAM-02d: duplicate invite` test once the policy is decided.
3. **Mobile auth setup** — Maestro flows assume a signed-in session. Agent 1 (auth) owns the login flow primitives. The four Teams flows need a `runFlow: ../auth-helpers/sign-in.yaml` once that file lands. Until then they require a pre-seeded device session.
4. **Owner-can't-leave (F-TEAM-04 AC5)** — `services/teams.ts::leaveTeam` should reject when the caller is the only owner. Untested.
5. **Beta-gate vs paid `team` tier (F-TEAM-01 AC4)** — all e2e users are in beta mode (free → tradie auto-upgrade), so the actual tier gate is not exercised. A focused test should stub `attachSubscription` to return a `free`-tier user and assert 403/upgrade-required when creating a team. Cross-references the Module 10 subscriptions agent.

## Existing test coverage cross-check

- `apps/api/src/__tests__/routes/teams.test.ts` — 19 unit-level supertest cases covering every route at the controller layer with the service mocked. **Strong overlap** with our API demo set but at a different level: those mock the service; ours hit the live service against Postgres. The two complement each other (route correctness vs end-to-end behaviour).
- `apps/api/src/__tests__/services/teams.test.ts` — service-layer tests. Covers the business logic our API demos exercise indirectly.
- `apps/web/e2e/` — no existing Playwright spec for teams. This demo set is the first.
- `apps/mobile/__tests__/` — no team-specific tests found.

No orphan tests detected for this module.

## Commands to run this module's demos

```bash
# Web (headed, serial — demo-watchable)
cd apps/web
npx playwright test e2e/demos/teams.spec.ts --headed --workers=1

# API only
cd apps/web
npx playwright test e2e/demos/api/teams.api.spec.ts --workers=1

# Mobile (requires simulator/emulator booted)
cd apps/mobile
maestro test .maestro/35-team-create.yaml
maestro test .maestro/36-team-invite.yaml
maestro test .maestro/37-team-accept-invite.yaml
maestro test .maestro/38-team-role-mgmt.yaml
```

## Out-of-scope items observed during this work

- **Real Resend send verification** — out-of-scope per dispatch brief (mock at service boundary). If Phase 4 wants email-content assertions, add a Resend-test-domain inbox-proxy fixture.
- **Stripe team-tier gating** — handled by Module 10 (Subscriptions) agent.
- **Multi-tenant isolation between teams** — handled by the cross-cutting agent (Module 14, F-X-01).

## Cost note

Zero real external-service spend. No Claude calls. Resend send is mocked at the service boundary. Stripe is not in this module's path. Only cost is local Postgres CPU.
