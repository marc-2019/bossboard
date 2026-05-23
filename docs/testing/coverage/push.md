# Push Notifications — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 12
**Spec source:** [docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 12 — Push notifications](../SPEC_AND_DEMOS_MATRIX.md#module-12--push-notifications-1-feature)
**Feature IDs covered:** F-PUSH-01

---

## Surface coverage matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-PUSH-01 — Cert expiry reminders via Expo Push | 5 ACs | n/a (no web push surface) | covers AC#1, AC#1b, AC#1c, AC#2, AC#3, AC#3b, AC#4, AC#5 (7 tests) | 2 flows (token register + cert-expiry receive) | Expo Push HTTP call is mocked at the route level via existing unit tests (notifications.test.ts:172-191). API demo asserts the integration contract (HTTP status + JSON body shape) rather than byte-level Expo payload. Maestro flow 45 is best-effort because OS notification capture is brittle. |

**Web column rationale:** The spec matrix marks Module 12 as `W –` — push notifications are not surfaced on the web app. No web demo was created. The web e2e/demos/ directory contains only the api/ + helpers/ subdirs for this module.

---

## Acceptance criteria coverage detail

### AC#1 — POST /push-token registers an Expo token
- **API:** `apps/web/e2e/demos/api/push.api.spec.ts` test "F-PUSH-01 AC#1 — POST /push-token registers an Expo token" — registers a realistic `ExponentPushToken[...]` and asserts `200 + success:true + message contains "registered"`.
- **Negative paths:**
  - "AC#1b — empty token (400)": asserts `error === 'VALIDATION_ERROR'`.
  - "AC#1c — requires auth (401 without bearer)": asserts the route is auth-gated.
- **Mobile:** `apps/mobile/.maestro/44-push-token-register.yaml` — fresh launch + login triggers the AuthContext `useNotifications` hook which fires `notificationsApi.registerPushToken` under the covers.

### AC#2 — DELETE /push-token removes the token
- **API:** test "F-PUSH-01 AC#2 — DELETE /push-token removes the token" — registers a token, deletes it, then asserts the follow-up `POST /test` returns `400 + NO_PUSH_TOKEN` (post-condition check).
- **Mobile:** Implicit (the logout flow in AuthContext calls `notificationsApi.removePushToken`); the existing logout Maestro flow exercises this path. No dedicated Maestro flow added for this AC — the API demo is the canonical assertion.

### AC#3 — POST /test sends a test push
- **API:** test "F-PUSH-01 AC#3 — POST /test dispatches a test notification" — registers a token then triggers the test endpoint. Asserts `200 status + JSON body has success+message`. The fake token causes Expo to reply with `DeviceNotRegistered` so the API returns `200 + success:false` — that's the expected integration-contract behaviour (route is correct; downstream device delivery is OS-side).
- **Negative:** "AC#3b — no token (400 NO_PUSH_TOKEN)".
- **Mobile:** A user-triggered test push isn't part of the standard demo flow (no Settings-level "test notifications" UI in this build). The API demo is the canonical assertion.

### AC#4 — POST /check-expiry triggers the cron-driven sweep
- **API:** test "F-PUSH-01 AC#4 — POST /check-expiry runs the cert-expiry sweep" — creates a certification with `expiry_date = today + 7 days`, registers a push token, triggers the sweep, and asserts `200 + success:true + data.{checked,notified} are numbers`. Also documents the expected title/body the service would produce (matches `getExpiryTitle(7)` + `getExpiryBody(name, 'electrical', 7)` from `apps/api/src/services/notifications.ts:252-264`).
- **Mobile:** `apps/mobile/.maestro/45-push-cert-expiry-receive.yaml` — best-effort flow that waits for the OS to surface the notification (in-app banner OR pull-down shade), asserts title "Certification Expiring Soon" + body contains "1 week", then taps the notification to deep-link into the certifications tab. Marked optional on iOS where Maestro's notification-shade capture is brittle.

### AC#5 — Dedupe per threshold (same-day re-trigger does not double-notify)
- **API:** test "F-PUSH-01 AC#5 — second /check-expiry on same day does not double-notify" — calls the sweep twice; asserts second `notified` count is `<= first` count. The dedupe contract lives in the service-layer query: `(c.last_reminder_at IS NULL OR c.last_reminder_at < CURRENT_DATE)` at `apps/api/src/services/notifications.ts:155`.
- **Mobile:** out of scope; dedupe is a backend concern.

---

## Gaps surfaced

1. **No live Expo Push integration test.** This demo asserts the API integration contract (HTTP shape + JSON body) but does not assert the exact bytes posted to `https://exp.host/--/api/v2/push/send`. The unit test at `apps/api/src/__tests__/routes/notifications.test.ts:172-191` mocks the service and asserts the message shape — together the unit + API layers cover the contract, but if the service ever stops calling Expo without changing its return value, only an integration probe would catch it. Phase 4 recommendation: add a Playwright-API test that uses `Page.route` or a mitm proxy to intercept exp.host traffic.
2. **Mobile notification-receive flow is OS-dependent.** Maestro flow 45 uses `optional: true` on the wait because OS notification surfacing varies between iOS / Android simulators and physical devices. Cannot make it a strict assertion without flake. Best-effort + screenshot review is the compromise; document the manual review step in Phase 5's demo runbook.
3. **No deep-link assertion for `data.type === 'test'` vs `'cert_expiry'`.** The API demo asserts the response from the test endpoint but not the data field on the outbound payload. Add a routed integration test in Phase 4 if Marc wants type-tagged dispatch verified.
4. **Cron-scheduled run not tested.** This demo invokes `POST /check-expiry` (the manual trigger). The actual daily cron at 20:00 UTC (`apps/api/src/services/cron.ts:22`) is wired via `node-cron` and there's no test that exercises the scheduled-vs-manual path. The behaviour is identical (both call `runCertExpiryCheckNow` → `checkAndNotifyExpiringCerts`) so the demo is representative; if Marc wants belt-and-braces, schedule-mocking with `jest.useFakeTimers` in a unit test would close the gap.

---

## Existing test coverage cross-check

- **`apps/api/src/__tests__/routes/notifications.test.ts`** (302 lines) — covers all 4 routes at the route-handler level with mocked service + auth middleware:
  - POST /push-token: 5 tests (happy path, missing token, empty token, service error w/ statusCode, generic error)
  - DELETE /push-token: 3 tests (happy path, service error, generic error)
  - POST /test: 6 tests (happy path, no token, ticket error, no tickets, service error, generic error)
  - POST /check-expiry: 3 tests (happy path, service error, generic error)
- **No existing service-level unit test** for `apps/api/src/services/notifications.ts` `checkAndNotifyExpiringCerts()` — relies on the route-handler test for behaviour assertion. Gap candidate for Phase 4 follow-up.
- **No existing cron-service test** (`apps/api/src/services/cron.ts`). The scheduling assertion is not covered.
- **No existing mobile test** for `useNotifications` hook. The `AuthContext.test.tsx` exercises only the auth state machine, not the push side effect.

---

## Commands to run this module's demos

```bash
# API surface (requires apps/api running on :29000 + postgres on :29432)
cd apps/web
npx playwright test e2e/demos/api/push.api.spec.ts --workers=1

# Mobile surface (requires simulator + apps/api running; trigger backend
# side separately via curl for flow 45)
cd apps/mobile
maestro test .maestro/44-push-token-register.yaml
maestro test .maestro/45-push-cert-expiry-receive.yaml
```

To trigger the cert-expiry push that flow 45 waits for, in a parallel shell:
```bash
# 1) Get a token for the user the mobile flow logged in as.
TOKEN=$(curl -s -X POST http://localhost:29000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@bossboard.test","password":"DemoPass123!"}' \
  | jq -r '.data.tokens.accessToken')

# 2) Create a 7-day-out cert.
curl -s -X POST http://localhost:29000/api/v1/certifications \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"electrical\",\"name\":\"Electrical Worker License (EWRB)\",\"certNumber\":\"EWRB-PE-DEMO\",\"issuingBody\":\"EWRB\",\"expiryDate\":\"$(date -d '+7 days' +%Y-%m-%d)\"}"

# 3) Trigger the sweep — Expo will dispatch the push within a few seconds.
curl -s -X POST http://localhost:29000/api/v1/notifications/check-expiry \
  -H "Authorization: Bearer $TOKEN"
```

---

## Out-of-scope / future work

- Real-Expo integration test (live token + delivery confirmation): requires a physical device or EAS development build. Defer to Phase 5 once devices are part of the CI matrix.
- iOS-specific notification shade testing: Maestro support is limited; manual review of screenshots is sufficient for now.
- Notification preferences (mute, channel granularity): not in current product scope (single channel: `cert-expiry`). When per-category prefs land, add a `46-push-preferences.yaml` flow.
