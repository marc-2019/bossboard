# BossBoard launch progress (dual-track)

**Updated:** 2026-07-18  
**Policy:** `docs/LAUNCH_DUAL_TRACK.md`  
**Card:** `ec01e123`

## Dual-track scoreboard

| Flag | Value | Evidence |
|------|--------|----------|
| **web_open** | **pending** | Needs feedback live on prod |
| **web_launched_at** | **null** | No real paid Stripe client yet |
| **app_open** | **pending** | Needs feedback + store/TestFlight billing path |
| **app_launched_at** | **null** | No real IAP paid client yet |
| **feedback_live** | **false** | PR #55 open (not on master) |
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
| App IAP first dollar | **OPEN** | Branch `feat/native-iap-store-rail`; Console EXTERNAL |
| Maestro XCTest | **BLOCKED** | Soft — does not block open or launch flags |
| Bug hunt free month | **PROCESS READY** | Manual grant; see `BUG_HUNT_FREE_MONTH.md` |

## Guardrail re-verify (2026-07-18)

| Directive | Status |
|-----------|--------|
| secrets-credentials-hygiene | **passing** (agent-evidence) |
| dependency-vulnerability-hygiene | **passing** (agent-evidence) |
| store-submission-readiness | still waived — use `STORE_SUBMISSION_REVERIFY.md` |

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
