# BossBoard launch progress (dual-track)

**Updated:** 2026-07-29 (Railway env probe + GA4; E1 BETA already false)  
**Policy:** `docs/LAUNCH_DUAL_TRACK.md`  
**Card:** dual-track is a **company KR** (not task) — residual card `ec01e123` cancelled earlier

## Paid flip runbook (agent prep 2026-07-29)

**SSOT procedure:** [`PAID_FLIP_RUNBOOK_2026-07-29.md`](./PAID_FLIP_RUNBOOK_2026-07-29.md)  
Gate0 PASS; `web_launched_at` still null. **E1 BETA_MODE=false already on Railway (2026-07-29 probe).** E2 first paid still OPEN.

## Paid KR status (2026-07-26 probe)

| Item | Status | Evidence |
|------|--------|----------|
| API health | **PASS** | `api.instilligent.com/health` 200, db+redis, version 0.5.0 |
| Marketing web | **PASS** | bossboard.instilligent.com 200 |
| Feedback endpoint | **PASS** (auth-gated) | GET `/api/v1/feedback` → 401 without JWT (endpoint live) |
| Subscriptions plans | **PASS** (auth-gated) | GET `/api/v1/subscriptions/plans` → 401 without JWT |
| **web_launched_at** | **null** | No real paid Stripe client recorded |
| **BETA_MODE** | **`false` on Railway API (E1 DONE)** | Env probe 2026-07-29; live Stripe `sk_live_…` + return URL set |
| Paid-client detector | **not built** | Listed in LAUNCH_DUAL_TRACK automation table |

### Paid KR — what advances “3/4 → 4/4”

1. ~~Confirm live Stripe keys + return URL + webhook~~ → **DONE** (Railway probe 2026-07-29).
2. ~~Flip `BETA_MODE=false`~~ → **DONE** on Railway `bossboard-api` production.
3. **One real paid Tradie sub** (money charged) → set `web_launched_at` + evidence id (no secrets in git).  
4. App IAP track remains independent (Console EXTERNAL).

**E2 first customer paid (2026-08-02):** MARKET→SELL funnel outcome — GTM owns path to pay (publish/CTA/channel).  
Rails green (E1 done). **Not** standing Marc EXTERNAL “self-checkout.” Agent stamps `web_launched_at` after real charge evidence. Optional Marc rail-smoke only if he chooses.

---

## Dual-track scoreboard

| Flag | Value | Evidence |
|------|--------|----------|
| **web_open** | **true** | Feedback live 2026-07-18 (API 401 on /feedback without JWT) |
| **web_launched_at** | **null** | No real paid Stripe client yet |
| **app_open** | **pending** | Needs feedback + store/TestFlight billing path |
| **app_launched_at** | **null** | No real IAP paid client yet |
| **feedback_live** | **true** | Migrated 017; token set; railway up API+web |
| **bug_hunt_live** | **false** | Process written; wait for feedback prod |

## Gate 0 (preflight) — last probe 2026-07-18

| Item | Status | Evidence |
|------|--------|----------|
| API health | **PASS** | `api.instilligent.com/health` 200, db+redis connected |
| Marketing web | **PASS** | bossboard.instilligent.com 200 |
| Auth 401 shape | **PASS** | (prior session) |
| BETA_MODE / Stripe env | **PASS** | (prior session; re-check on deploy day) |

## Product path

| Item | Status | Notes |
|------|--------|--------|
| Home / app launch | **PASS** | Prior device evidence |
| SWMS generate success | **OPEN** | Automate via API; device optional |
| Subscription UI | **OPEN** | Device or web billing page |
| Feedback web + mobile | **CODE READY** | Merge #55 + migrate + token |
| Web Stripe first dollar | **OPEN** | Blocks `web_launched_at` |
| App IAP first dollar | **OPEN** | ASC products **DONE 2026-07-30**; Paid Apps Agreement **SIGNED 2026-07-31**; residual = shared-secret Marc-verify + EAS/TestFlight sandbox |
| Maestro XCTest | **BLOCKED** | Soft — does not block open or launch flags |
| Bug hunt free month | **PROCESS READY** | Manual grant; see `BUG_HUNT_FREE_MONTH.md` |

## Guardrail re-verify (2026-07-18)

| Directive | Status |
|-----------|--------|
| secrets-credentials-hygiene | **passing** (agent-evidence) |
| dependency-vulnerability-hygiene | **passing** (agent-evidence) |
| store-submission-readiness | still waived — use `STORE_SUBMISSION_REVERIFY.md` |

## Apple (2026-07-18)

| Item | Status |
|------|--------|
| IAP dual-rail on master | **yes** `cd1d93b` |
| ASC app id | **6760329559** (eas.json) |
| Public App Store | **no** (lookup 0) |
| Marc next | Shared secret verify on Railway (yes/no) + `eas build` → TestFlight sandbox (Paid Apps **signed 2026-07-31**) |
| Runbook | `docs/APPLE_STORE_LAUNCH.md` |

## Ship train (active)

1. [ ] Merge PR #55 feedback → master → Railway deploy  
2. [ ] Apply migration `017_feedback` on prod  
3. [ ] Set `FEEDBACK_SERVICE_TOKEN` on API; smoke POST feedback  
4. [ ] Set `feedback_live=true`, `web_open=true` (if product path OK)  
5. [ ] Enable bug-hunt copy; create Stripe coupon template  
6. [ ] First real web paid client → `web_launched_at`  
7. [ ] Merge IAP dual-rail + Console secrets → app track  
8. [ ] First real IAP paid → `app_launched_at`  
9. [ ] Paid-client detector automation  

## Where things run

See `RUNTIME_WHERE_THINGS_RUN.md` — vision is **local on Mac**.
