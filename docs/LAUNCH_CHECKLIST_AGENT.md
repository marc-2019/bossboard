# BossBoard launch checklist (agent-operated)

**Purpose:** Dual-track launch — web and app scored separately; **launched only with a real paid client**.  
**Owner:** Agent automates probes; Marc owns Console, first paid, announce.  
**Updated:** 2026-07-18  
**Policy SSOT:** `docs/LAUNCH_DUAL_TRACK.md`  
**Card:** residual `ec01e123`

**Rule:** Mark each row **PASS / FAIL / BLOCKED / N/A** with *evidence*. Never claim PASS from assumption.  
**Never claim “BossBoard launched”** without specifying **web** and/or **app** and a paid-client timestamp.

---

## Launch definitions (Marc-confirmed 2026-07-18)

| Track | Open (usable) | Launched |
|-------|----------------|----------|
| **Web** | Feedback live + product path + Gate 0 | **+ ≥1 real Stripe paid client** |
| **App** | Feedback live + app usable + store/TestFlight path | **+ ≥1 real IAP paid client** (default) |

Live product (not waitlist). Feedback required. Bug hunt = manual free month after confirmed bug (`BUG_HUNT_FREE_MONTH.md`).

---

## Gate 0 — Preflight (hard for open)

| # | Check | How | Pass criteria | Status seed |
|---|--------|-----|---------------|-------------|
| 0.1 | API health | `curl -sS https://api.instilligent.com/health` | 200, bossboard-api, db+redis | **PASS** (2026-07-18) |
| 0.2 | Auth gate shape | unauthenticated GET swms/subscriptions | **401** | **PASS** (prior) |
| 0.3 | Marketing web | bossboard.instilligent.com | 200 | **PASS** (2026-07-18) |
| 0.4 | Domain cutover | Railway bossboard-api has api.instilligent.com | Resolves to cutover | **PASS** (prior) |
| 0.5 | Legacy hold | Legacy “Boss Board” service | Do not delete until ≥24h quiet post-announce | **PASS** (hold) |
| 0.6 | BETA_MODE | Railway | `false` for paid launch | **PASS** (prior; re-check) |
| 0.7 | Stripe live | Env names only | Live keys + price IDs | **PASS** (prior) |
| 0.8 | GA4 | measurement + MP secret | Present | **PASS** (prior) |
| 0.9 | Feedback live | POST /api/v1/feedback works on prod | Migration 017 + token + UI | **OPEN** (PR #55) |
| 0.10 | Bug-hunt process | Doc + Stripe coupon ready | Manual path published | **OPEN** |

If 0.1–0.4 or 0.6–0.7 FAIL → **stop**.

---

## Gate W — Web track

| # | Check | Pass criteria | Status |
|---|--------|---------------|--------|
| W.1 | Landing + CTA | Marketing 200, pricing readable | **PASS** |
| W.2 | Feedback (web) | Sidebar Send feedback → 201 | **OPEN** until #55 deploy |
| W.3 | Logged-in path | SWMS/invoice critical path | **OPEN** / automate Playwright |
| W.4 | Checkout starts | Stripe Checkout URL for paid tier | **OPEN** |
| W.5 | **First paid client** | Live sub; tier updated | **OPEN** → sets `web_launched_at` |
| W.6 | Portal | Billing portal if exposed | Soft |

**Web launched** = W.1–W.2 + Gate 0 + **W.5**.

---

## Gate A — App track

| # | Check | Pass criteria | Status |
|---|--------|---------------|--------|
| A.1 | App installable | TestFlight / Play / store build | Partial |
| A.2 | Feedback (mobile) | Settings → Send Feedback | **OPEN** until #55 deploy |
| A.3 | Product path | SWMS success (API or device) | **OPEN** |
| A.4 | IAP dual-rail | Native IAP only on ios/android; no Stripe openURL | Code on `feat/native-iap-store-rail` |
| A.5 | Console credentials | ASC products + secret; Play SA | **Marc EXTERNAL** |
| A.6 | **First IAP paid** | Verified receipt; tier updated | **OPEN** → sets `app_launched_at` |
| A.7 | Restore purchases | Button works | Soft |

**App launched** = A.1–A.3 + A.4–A.5 + **A.6**.

Maestro XCTest **soft** — blocked does not block open/launch if A.3 proven another way.

---

## Gate M — Money (per track)

| # | Check | Web | App |
|---|--------|-----|-----|
| M.1 | Pay | Stripe Checkout / PaymentSheet | StoreKit / Play Billing |
| M.2 | Entitlement | Webhook → `subscription_tier` | `POST /iap/verify` → tier |
| M.3 | Evidence | Stripe sub id (not secret key) | transaction id preview |

---

## Automation plan

1. **Deploy-time / daily:** Gate 0.1–0.3 curl.  
2. **CI:** Playwright web critical path (expand demos).  
3. **Paid detector (todo):** query first live Stripe customer with paid sub; set scoreboard.  
4. **IAP:** fail-closed verify already coded; sandbox then live.  
5. **Do not** loop Maestro while XCTest timeout is known.

---

## Ship train (execute in order)

1. Merge **feedback PR #55** → deploy → migration 017 → `FEEDBACK_SERVICE_TOKEN`.  
2. Smoke feedback web + mobile.  
3. Publish bug-hunt blurb; create Stripe free-month coupon template.  
4. Complete **web** first paid → `web_launched_at`.  
5. Merge **IAP dual-rail**; Marc Console secrets; first IAP paid → `app_launched_at`.  
6. Close residual `ec01e123` when scoreboard reflects open + paid paths or explicit Marc sign-off on partial.

---

## Definition of ready

| Claim | Requires |
|-------|----------|
| Open for customers (web) | Gate 0 + feedback live + product usable |
| **Web launched** | Above + real paid Stripe client |
| Open for customers (app) | Feedback + app usable + billing path available |
| **App launched** | Above + real paid IAP client |
| Portfolio “100%” | Not claimed; dual-track only |

---

## Agent tools

```bash
curl -sS https://api.instilligent.com/health
curl -sS -o /dev/null -w '%{http_code}\n' https://bossboard.instilligent.com
# After feedback deploy:
# POST /api/v1/feedback with user JWT
```

Scoreboard file: `docs/LAUNCH_PROGRESS_NOW.md`.

---

## Changelog

- 2026-07-18: Dual-track; paid-client-only launch; feedback + bug hunt; automation plan; IAP re-opened for app track.  
- 2026-07-12: Initial agent checklist.
