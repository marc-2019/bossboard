# Certifications — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 3 (certifications)
**Spec source:** [docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 3](../SPEC_AND_DEMOS_MATRIX.md#module-3--certifications-3-features)
**Branch:** `feat/e2e-demos-certifications-2026-05-23`

## Coverage matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Status | Notes |
|---|---|---|---|---|---|---|
| F-CERT-01 (create/list/edit) | 5 | ACs 2, 5 (read-only) | ACs 1, 2, 3, 4, 5 | ACs 1, 2 (create+list) | 🟡 | Web is read-only — cannot create/edit certs from web today. Mobile is the canonical write surface. |
| F-CERT-02 (expiry + notifications) | 5 | AC 1 (Expired badge), AC 1 (Expiring-soon badge) | ACs 1, 4 | AC 1 (badge), AC 5 (context line) | 🟡 | AC 2 (daily cron) is not exercised — would require a scheduled-job test harness. AC 3 (exactly-once per threshold) is implementation-asserted but not e2e-asserted (would need 2 runs separated by ≥24h). AC 5 (deep link) blocked on missing mobile cert detail route. |
| F-CERT-03 (photo attachment) | 5 | n/a (drift) | AC 1 pinned-as-drift | n/a (form has no photo picker) | 🔴 | **HARD DRIFT.** Photos zod schema does not include `'certification'` as a valid `entityType`. F-CERT-03 is currently un-implemented despite the spec claim. API spec contains a pinned-failure test that flips to green when the schema is updated. |

## Files authored this PR

| File | Surface | Coverage |
|---|---|---|
| `apps/web/e2e/demos/certifications.spec.ts` | Web | F-CERT-01, F-CERT-02 (5 tests) |
| `apps/web/e2e/demos/api/certifications.api.spec.ts` | API | F-CERT-01 (6 tests), F-CERT-02 (2 tests), F-CERT-03 drift-pin (1 test) |
| `apps/web/e2e/demos/helpers/certifications.ts` | shared | 7 fixtures, createCertViaApi, daysFromNow |
| `apps/mobile/.maestro/10-cert-create.yaml` | Mobile | F-CERT-01 AC1, AC2 |
| `apps/mobile/.maestro/11-cert-list.yaml` | Mobile | F-CERT-01 AC2, F-CERT-02 AC1 (Valid badge) |
| `apps/mobile/.maestro/12-cert-expiry-notification.yaml` | Mobile | F-CERT-02 AC1 (Expiring-soon badge), AC5 (context line) |
| `docs/testing/coverage/certifications.md` | docs | this file |

## Gaps surfaced

### G-CERT-01: Photo attachment for certs is not implemented (HARD DRIFT)

**Spec claim (F-CERT-03 AC1):** "POST /api/v1/photos with `entityType=certification`, `entityId=<cert id>` uploads the file."

**Code reality (apps/api/src/routes/photos.ts line 51):**
```typescript
const entityTypeSchema = z.enum(['swms', 'invoice', 'expense', 'job_log']);
```

`'certification'` is missing from the enum. Calls to `POST /api/v1/photos` with `entityType=certification` return 400 VALIDATION_ERROR today.

**Pinned in:** `apps/web/e2e/demos/api/certifications.api.spec.ts` — the test asserts the 400 response and includes a message asking the next maintainer to flip the assertion when the schema is updated.

**Recommended fix (separate PR):**
1. Add `'certification'` to the entity-type enum in `apps/api/src/routes/photos.ts`.
2. Add a cert-photo isolation test to `apps/web/e2e/multi-tenant-isolation-entities.spec.ts`.
3. Add a `photo-picker` UI to `apps/mobile/app/certifications/add.tsx` (the form has no photo input today).
4. Update this test's `expect([400, 422])` to `expect(201)`.

### G-CERT-02: No mobile cert-detail route

**Spec claim (F-CERT-02 AC5):** "Notifications include cert name + days remaining + a deep link to the cert detail."

**Code reality:** `apps/mobile/app/certifications/` has `index.tsx`, `add.tsx`, `_layout.tsx` — but no `[id].tsx` detail route. The push notification payload built by `services/notifications.ts` includes `certificationId` in the `data` field but there is no in-app target for the deep link.

**Pinned in:** `apps/mobile/.maestro/11-cert-list.yaml` — the tap-into-detail step is marked `optional: true` so the flow still passes today.

**Recommended fix (separate PR):**
1. Add `apps/mobile/app/certifications/[id].tsx` rendering name, type, dates, status badge, attached photo (after G-CERT-01 fix), and a "Renew" CTA.
2. Wire the Expo Push receiver in `_layout.tsx` to route by `data.type === 'cert_expiry'` → `certifications/${data.certificationId}`.
3. Remove the `optional: true` from the Maestro flow.

### G-CERT-03: Web cannot create/edit certs

**Spec claim (F-CERT-01):** "W ✓ A ✓ M ✓" — implies write parity across surfaces.

**Code reality:** `apps/web/src/app/(dashboard)/certifications/page.tsx` is read-only. The empty-state copy explicitly says "The web view is read-only" — so this is a known UX limitation, not an accidental omission.

**Recommended action:** Update F-CERT-01 spec to "W (read-only) ✓ A ✓ M ✓" so the matrix reflects reality. No code change needed unless we decide to add web-create.

### G-CERT-04: Cron exactly-once-per-threshold is not e2e-asserted

**Spec claim (F-CERT-02 AC3):** "Push notification is sent at each threshold (30/14/7/1 days) — exactly once per threshold per cert."

**Code reality:** `services/notifications.ts` uses `last_reminder_at < CURRENT_DATE` as the dedup guard (line 155). This is a per-day guard, not per-threshold. If the cron runs at 30, 14, 7, 1 days and the cert moves through each, the guard works. If the cron runs twice in the same day, the guard blocks the second. If the cert is recreated mid-window, the guard does not deduplicate based on threshold — only based on `last_reminder_at`.

**Why not e2e-asserted:** Would need to either (a) advance the system clock (Docker-level), (b) seed `last_reminder_at` directly via SQL, or (c) wait 24h between assertions. None are appropriate for a Phase 3 demo agent's scope.

**Recommended action:** Add a unit test in `apps/api/src/__tests__/services/notifications.test.ts` that exercises the dedup branch with a SQL fixture, separate from this e2e PR.

## Existing test coverage cross-check

- `apps/api/src/__tests__/routes/certifications.test.ts` — covers F-CERT-01 (mocked service: POST validation, GET list, GET expiring, GET by id, PUT, DELETE)
- `apps/api/src/__tests__/services/certifications.test.ts` — service-level unit tests
- `apps/api/src/__tests__/routes/notifications.test.ts` — covers F-CERT-02 partial (push-token register, check-expiry endpoint shape)
- `apps/web/e2e/multi-tenant-isolation-entities.spec.ts` — does NOT include certifications today; this PR's `F-CERT-01 AC5` test is the first multi-tenant isolation e2e for certs
- `apps/mobile/__tests__/` — no certification tests

## Commands to run this module's demos

Pre-flight (per `docs/testing/env-required.md`):
```bash
docker compose up -d
cd apps/api && npm run dev  # http://localhost:29000
cd apps/web && npm run dev  # http://localhost:3000
# Mobile: start iOS simulator OR Android emulator, then
cd apps/mobile && npm start
```

Web demos (headed for stakeholder viewing):
```bash
cd apps/web && npx playwright test e2e/demos/certifications.spec.ts --headed --workers=1
```

API demos:
```bash
cd apps/web && npx playwright test e2e/demos/api/certifications.api.spec.ts --workers=1
```

Mobile demos (requires a running simulator/emulator + signed-in user):
```bash
cd apps/mobile && maestro test .maestro/10-cert-create.yaml .maestro/11-cert-list.yaml .maestro/12-cert-expiry-notification.yaml
```

## Real-services cost note

- **No Claude API calls** in this module.
- **No Resend / Stripe calls** in this module.
- **Expo Push:** 1 outbound HTTP per `check-expiry` invocation; deliberately uses a non-deliverable test token so no real device is touched and no cost is incurred.
- **PostgreSQL writes:** ~10 rows per full run (certs + push tokens), all cleaned up by `afterEach`.
