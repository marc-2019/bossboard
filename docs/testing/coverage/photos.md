# Photos — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 8
**Spec source:** `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 8 — Photos
**Branch:** `feat/e2e-demos-photos-2026-05-23`

## Surface notation

- **W** = `apps/web` (Next.js, Playwright headed)
- **A** = `apps/api` (Express, Playwright API tests)
- **M** = `apps/mobile` (Expo React Native, Maestro YAML flows)

## Feature × surface matrix

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-PHOTO-01 — Upload from camera/gallery | 4 ACs | partial (smoke + file-input capability) | full | partial (action sheet + camera/gallery branches) | Mobile cannot drive simulator camera shutter — flow exercises the OS dialog branch + Maestro permissions grant. |
| F-PHOTO-02 — List by entity + fetch + delete | 4 ACs | placeholder (synthetic gallery contract) | full | partial (gallery thumbnail tap + preview modal) | Web has no dedicated photos page — gallery is embedded in entity detail pages. |

### F-PHOTO-01 — Upload from camera/gallery

**Spec ACs:**
1. `POST /api/v1/photos` (multipart) with `entityType` + `entityId` accepts a file.
2. Subscription gate `requireFeature('photos')`.
3. File size + mime-type validation.
4. Storage location.

**API demos:** `apps/web/e2e/demos/api/photos.api.spec.ts` covers
- Authentication required (401 without bearer token).
- Validation: missing file → 400 VALIDATION_ERROR.
- Validation: non-UUID `entityId` → 400 + UUID message.
- Validation: invalid `entityType` → 400.
- Validation: non-image mime type → 400 INVALID_FILE_TYPE.
- Validation: >10MB → 400 FILE_TOO_LARGE.
- Happy path: 201 + photo record (entity_type, entity_id, caption, url, mime_type).

**Web demo:** `apps/web/e2e/demos/photos.spec.ts` covers
- App boots (smoke).
- `setInputFiles()` capability with in-memory PNG buffer (no on-disk fixture).

**Mobile demos:**
- `.maestro/32-photo-camera-capture.yaml` — camera branch of action sheet, permission grant.
- `.maestro/33-photo-gallery-pick.yaml` — gallery branch of action sheet, picker dismissal.

### F-PHOTO-02 — List by entity + fetch file + delete

**Spec ACs:**
1. `GET /api/v1/photos/:entityType/:entityId` returns the photo list.
2. `GET /api/v1/photos/:id/file` returns binary.
3. `DELETE /api/v1/photos/:id` deletes (owner-only).
4. Multi-tenant isolated.

**API demos:** `apps/web/e2e/demos/api/photos.api.spec.ts` covers
- List endpoint returns 2-photo collection ordered DESC, contains expected captions.
- List rejects invalid entity type → 400.
- GET /:id/file streams bytes (asserts PNG magic header 89 50 4E 47).
- GET /:id/file is multi-tenant isolated (outsider gets 404).
- DELETE removes photo; second DELETE → 404.
- DELETE by outsider → 404; owner GET /:id/file still 200 (proves outsider's DELETE was a no-op).

**Web demo:** `apps/web/e2e/demos/photos.spec.ts` covers
- Synthetic gallery render contract (placeholder — real assertion when entity pages adopt `<PhotoGallery />`).

**Mobile demo:** `.maestro/34-photo-list-by-entity.yaml`
- Entity detail page renders "Photos (N)" header.
- Tap thumbnail → preview modal opens.
- Caption renders in modal.
- Close button dismisses modal.

## Gaps surfaced

1. **No dedicated `/photos` web page.** Photos are embedded inside entity-detail pages (invoice/expense/quote/swms/job-log). The web spec uses a synthetic page for the gallery render contract; this becomes a real assertion when entity detail pages ship a `<PhotoGallery />` web component. Phase 4 should flag this as W-surface drift between the spec and code.
2. **Simulator cannot drive real camera shutter.** Maestro can grant permissions and tap "Camera" in the action sheet, but it cannot simulate the device camera capturing a frame. Flow 32 exercises the dialog branch; full upload + thumbnail-appears assertion requires a real device with a seeded camera roll.
3. **No web-side multi-tenant photo isolation test.** The API spec covers this fully via cross-user 404 assertions; if a web Photos page lands, the multi-tenant matrix in `multi-tenant-isolation-entities.spec.ts` should add a `photos` row.
4. **Subscription gate (`requireFeature('photos')`) not exercised in beta mode.** Beta mode (`SUBSCRIPTIONS_BETA_MODE=true`) currently passes all users through the gate. The negative case (free-tier user with beta-mode OFF gets 403) belongs in the F-SUB module, not here, but is cross-referenced.
5. **Path-traversal guard (route line 184) not exercised.** The owner-fetch happy path validates the positive branch; building a crafted-`path` photo record to hit the 403 branch needs DB-level fixture insertion — out of scope for this agent.

## Existing test coverage cross-check

- **API Jest:** `apps/api/src/__tests__/routes/photos.test.ts` covers route-level validation with mocked service. Our Playwright suite complements with real-services E2E (multipart, real DB writes, file streaming, multi-tenant isolation). No overlap risk — Jest mocks the service, Playwright hits the live stack.
- **Web Playwright:** no prior `photos*.spec.ts` in `apps/web/e2e/`. Our `photos.spec.ts` is the first.
- **Mobile:** no Maestro flows for photos prior to this branch. 32/33/34 are the first.

## Real-services cost note

The photos module does **not** hit Claude, Stripe, or Resend. Costs:
- DB writes: 1 photo INSERT per upload (~11 uploads across the API spec).
- Disk writes: ~10 small (67-byte) PNGs in `apps/api/uploads/photos/`; a periodic
  cleanup (or test teardown) is recommended but not blocking — total disk
  footprint < 1KB per run.
- Network: localhost only.

## Commands to run this module's demos

```bash
# Web (headed):
cd apps/web && npx playwright test e2e/demos/photos.spec.ts --headed --workers=1

# API:
cd apps/web && npx playwright test e2e/demos/api/photos.api.spec.ts --workers=1

# Mobile (requires running simulator + a logged-in user with at least one
# entity that embeds PhotoAttachments):
cd apps/mobile && maestro test .maestro/32-photo-camera-capture.yaml
cd apps/mobile && maestro test .maestro/33-photo-gallery-pick.yaml
cd apps/mobile && maestro test .maestro/34-photo-list-by-entity.yaml

# Or all photo flows by tag:
cd apps/mobile && maestro test .maestro/ --include-tags=photos
```

## Drift / blockers

- **Drift A:** Spec line 759 ("Storage location TBD by Phase 3 (local disk vs object store).") — code uses `apps/api/uploads/photos/` (local disk; see `services/photos.ts:12`). Spec doc should be updated by Phase 4.
- **Blocker (mobile):** the Maestro flows assume a logged-in session with at least one entity. The Phase 2 smoke flow uses `clearState: true` — our flows deliberately use `clearState: false` to preserve session, but a dedicated photo-seed flow (or shared auth seed flow) belongs in Phase 4.
