# BossBoard store-submission re-verify (IAP-tied)

**Purpose:** Real check for `store-submission-readiness-before-launch` — do **not** trust the CF LLM waive.  
**When:** Before production App Store / Play binary and before setting **`app_launched_at`**.  
**Related:** `LAUNCH_DUAL_TRACK.md`, `native-iap` dual-rail (`feat/native-iap-store-rail`), `PRE_SUBMISSION_CHECKLIST.md`, `apps/mobile/STORE_LISTING.md`.

Mark each row **PASS / FAIL / N/A** with date + evidence path. Agent or Marc.

---

## Gate S0 — Policy artifacts (repo)

| # | Check | Pass criteria | Seed (2026-07-18) |
|---|--------|---------------|-------------------|
| S0.1 | Store listing / metadata | `apps/mobile/STORE_LISTING.md` present, BossBoard branding (not TradeMate) | **PASS** (file on master) |
| S0.2 | Privacy | `apps/mobile/PRIVACY_POLICY.md` + live privacy URL | **PASS** (file; re-check URL live) |
| S0.3 | Pre-submission checklist | `docs/PRE_SUBMISSION_CHECKLIST.md` reviewed this release | **OPEN** (human pass) |
| S0.4 | AI disclosure | Limited-use / AI copy aligned with Play/App if SWMS AI ships | **PASS** (docs/legal commits; re-check listing) |
| S0.5 | No SMS / CALL_LOG | Android permissions list has no SMS/CALL_LOG | **PASS** (app.json: camera, location, boot, vibrate, net only) |

---

## Gate S1 — Binary / platform

| # | Check | Pass criteria | Seed |
|---|--------|---------------|------|
| S1.1 | Bundle IDs | iOS `nz.instilligent.bossboard`, Android same package | **PASS** |
| S1.2 | targetSdk / Play policy | Meets current Play target API (CF android check if registered) | **OPEN** (confirm EAS/build) |
| S1.3 | Stripe in binary | PaymentSheet OK for **web-adjacent** only; **upgrade CTA on iOS/Android must use IAP** (no Stripe Checkout openURL as primary) | **OPEN** until dual-rail merged to master + build |
| S1.4 | IAP dual-rail code | `payments.ts` native-only IAP; verify API fail-closed | Branch `feat/native-iap-store-rail` — **merge pending** |
| S1.5 | Restore Purchases | Visible on subscription screen (store requirement) | On IAP branch — **merge pending** |

---

## Gate S2 — Console EXTERNAL (Marc)

| # | Check | Pass criteria | Seed |
|---|--------|---------------|------|
| S2.1 | App Store Connect | Weekly auto-renewable Tradie + Team product IDs match config defaults | **DONE 2026-07-30** (Claude Chrome: group BossBoard Plans + both product IDs/prices; display Tradie/Team Weekly) |
| S2.2 | Apple shared secret | `IAP_APPLE_SHARED_SECRET` on API (Railway) | **OPEN** — Marc verify only (do not paste secret). **Also:** Paid Apps Agreement still **unsigned** (blocker for paid IAP). |
| S2.3 | Play Console | Subscription products + base plans for Tradie/Team | **OPEN** |
| S2.4 | Play service account | `IAP_GOOGLE_SERVICE_ACCOUNT_JSON` (or base64) + Android Publisher access | **OPEN** |
| S2.5 | Package name | `IAP_GOOGLE_PACKAGE_NAME=nz.instilligent.bossboard` | **OPEN** |
| S2.6 | Small Business Program | Apple SBP enrolled if eligible (15%) | **OPEN** (Marc) |

Product ID defaults (override only if Console differs):

```text
Apple:  nz.instilligent.bossboard.tradie.weekly
        nz.instilligent.bossboard.team.weekly
Google: bossboard_tradie_weekly
        bossboard_team_weekly
```

---

## Gate S3 — Sandbox proof

| # | Check | Pass criteria | Seed |
|---|--------|---------------|------|
| S3.1 | iOS sandbox purchase | Sandbox Apple ID → IAP sheet → `POST /iap/verify` 200 → tier | **OPEN** |
| S3.2 | Android license tester | License tester → purchase → verify 200 → tier | **OPEN** |
| S3.3 | Restore | Second device / reinstall → Restore Purchases restores tier | **OPEN** |
| S3.4 | Fail-closed | Without secrets, verify returns 503 (not free tier grant) | **PASS** (unit tests on IAP branch) |

---

## Gate S4 — Flip CF guardrail (only when S0–S3 done)

When S0–S3 are PASS (or N/A with Marc note):

```sql
-- Run only after checklist complete; set evidence path
UPDATE cf_product_guardrails
SET status = 'passing',
    last_verified_at = NOW(),
    last_verified_by = 'store-reverify-<date>',
    evidence_url = 'docs/STORE_SUBMISSION_REVERIFY.md#completed-<date>',
    waiver_reason = NULL,
    waiver_expires_at = NULL
WHERE product_slug = 'bossboard'
  AND directive_slug = 'store-submission-readiness-before-launch';
```

Until then: leave **waived** or explicitly Marc-waive with **expiry** — never claim app launched.

---

## Lite security pass (bonus — quarterly hygiene)

| # | Check | Notes | Seed 2026-07-18 |
|---|--------|-------|-----------------|
| L1 | Auth gates return 401 unauthenticated | `/api/v1/swms`, subscriptions | Prior Gate 0 PASS |
| L2 | Feedback export requires service token | No JWT-only export of all feedback | Code in PR #55 merge |
| L3 | IAP verify requires user JWT + store proof | Fail-closed without credentials | IAP service tests |
| L4 | No secrets in git | secret-scan PASS | **PASS** (reverify 2026-07-18) |
| L5 | Tenant / team writes from session | Spot-check if Team tier sold | Soft until Team push |

Full `security-review-quarterly` can cite this table + date when you want that row flipped.

---

## Ship order (ties to dual-track)

1. Feedback live in prod (web open).  
2. Merge IAP dual-rail → master → mobile store build.  
3. Complete **S2–S3** (Console + sandbox).  
4. Flip store-submission guardrail → set `app_launched_at` only after **real** paid IAP client.

---

## Changelog

- 2026-07-18: Initial re-verify checklist after CF waive review; secrets+deps flipped to passing separately.
