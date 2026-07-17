# BossBoard dual-track launch (web vs app)

**Status:** Active policy (Marc-confirmed 2026-07-18)  
**Residual card:** `ec01e123`  
**Related:** `LAUNCH_CHECKLIST_AGENT.md`, `LAUNCH_PROGRESS_NOW.md`, `BUG_HUNT_FREE_MONTH.md`

## Definitions

| Term | Meaning |
|------|---------|
| **Open for customers** | Signups allowed; product usable; feedback live. Not the same as “launched.” |
| **Web launched** | Web product is live **and** ≥1 **real paid** customer exists on the **Stripe** rail. |
| **App launched** | Mobile app is available to customers **and** ≥1 **real paid** customer exists on the **store IAP** rail (or policy exception: web-paid multiplatform user counts — default is IAP for app flag). |
| **Real paid** | Money charged (or Apple/Google billed). Not `BETA_MODE` free tier. Not waitlist. Sandbox/test IDs do not count unless Marc explicitly dogfoods and records it. |

Web and app flags are **independent**. Web can launch while app store billing is still incomplete.

## Launch bar (both tracks)

1. Gate 0 hard rows green (API, auth shape, marketing, `BETA_MODE=false`, Stripe env for web).  
2. **In-app feedback live** (web sidebar + mobile Settings → Send Feedback) + migration applied + token set.  
3. Critical product path works (web: Playwright or manual; app: device smoke until Maestro green).  
4. Track-specific first paid client (see table above).  
5. Marc announce yes.

## Automation (target)

| Layer | Owner | Status |
|-------|--------|--------|
| Gate 0 HTTP probes | CI / agent cron | Exists |
| Web Playwright critical path | CI | Partial (demos exist) |
| Paid-client detector | SQL/Stripe: first live sub → set flag | **To build** |
| App Maestro UI | Device farm | **Blocked** (XCTest) — do not block launch flags |
| Dual-track scoreboard | This file + `LAUNCH_PROGRESS_NOW.md` + CF task metadata | Manual until detector ships |

## Scoreboard fields (evidence)

Update `LAUNCH_PROGRESS_NOW.md` and residual card metadata:

```text
web_open:           true|false   # feedback + product usable
web_launched_at:    ISO|null     # first real Stripe paid client
web_paid_evidence:  sub_id / customer_id / ticket  (no secrets in git)
app_open:           true|false
app_launched_at:    ISO|null     # first real IAP (or agreed multiplatform policy)
app_paid_evidence:  transaction / receipt id (preview only)
feedback_live:      true|false
bug_hunt_live:      true|false
```

## Ordered ship train (active)

1. Merge + deploy **feedback** (PR #55) + migration `017` + `FEEDBACK_SERVICE_TOKEN`.  
2. Publish **bug hunt** free-month process (manual grant).  
3. **Web paid path:** one real Stripe subscription → set `web_launched_at`.  
4. **App IAP:** merge dual-rail branch, Console products/secrets, sandbox then real → set `app_launched_at`.  
5. Automate paid-client detector + nightly Gate 0.

## Explicitly not required for “open”

- Maestro XCTest green  
- Full auto bug rewards  
- Portfolio (Moss/MC/R3) green  

## Changelog

- 2026-07-18: Dual-track + paid-client-only launch policy; live not waitlist; feedback required.
