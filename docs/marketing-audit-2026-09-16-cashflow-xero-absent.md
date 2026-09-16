# Marketing-truth hygiene — BossBoard cashflow/Xero ABSENT — 2026-09-16

**Repo:** `marc-2019/bossboard` (origin/master at write time)  
**Source:** CF leftover / trades equal-pull 2026-09-16 — marketing-truth cashflow ABSENT  
**Claim:** `bossboard.cashflow-forecasting`  
**Status:** **ABSENT_CONFIRMED**  
**Scope:** Register/claim hygiene only. Docs + `marketing-truths.json`. No Module 2/3 product work.

Mac agent draft branch `docs/bb-cashflow-absent-hygiene-2026-09-16` (local SHA `5a68686`, not on origin — Auto-review blocked push). This file recreates the equivalent honesty record from the leftover report.

## Verdict

Live product still does **not** ship cashflow forecasting or Xero integration.

| id | Verdict | Decision |
|----|---------|----------|
| `bossboard.cashflow-forecasting` | **ABSENT_CONFIRMED** (2026-09-16 re-verify) | **drop** — keep off customer-facing copy. Do not invent Module 2/3 features. |

Q2 2026 has passed. Dated “Coming Q2 2026” is stale even as a future-tense promise. Marc 2026-07-14: Module 2 Xero/cashflow is **not committed** (`docs/product/GAPS_AND_ROADMAP.md`).

## Evidence (2026-09-16)

| Check | Result |
|-------|--------|
| `apps/api/src` grep `xero` / `cashflow` | **0 matches** |
| `apps/api/src/routes/` + `services/` files named xero/cashflow | **none** |
| `GET /api/v1/stats/dashboard` | SWMS / invoice / quote / cert **counts** — not a cash-position forecast |
| `GET /api/v1/stats/insights` | Revenue history, AR aging, top customers — **not** Xero/cash-position forecast |
| Design doc `docs/technical/MODULE_2_XERO_CASHFLOW_DESIGN.md` | **DESIGN ONLY (no code)** |
| Live `https://bossboard.instilligent.com/llms.txt` | HTTP 200, **no** cashflow / Xero / Q2 2026 |
| Git `llms.txt` + `apps/web/public/llms.txt` | Same as live — already honest |
| Git `README.md` | No “Cashflow Forecasting (Coming Q2 2026)” line (dropped 2026-08-30) |
| `apps/web/src` grep Xero / cashflow forecasting | **0 matches** |

Prior honesty pass: `docs/marketing-audit-2026-08-30-match-live-llms.md` (Marc yes A+B). This leftover pass **re-confirms** ABSENT; it does not reopen Module 2.

## What this PR does not do

- Does not implement Xero OAuth, invoice chase, GST countdown, or cash-position forecast
- Does not change customer-facing copy (landings, `llms.txt`, README, store listing)
- Does not claim cashflow/Xero exists or is “coming Q2 2026”
- Does not merge

## Leftover residue (registered, not fixed here)

These files still mention Xero/cashflow as future or splash copy. They are **not** product. This PR does not edit them (docs-only hygiene).

| Surface | Residue | Notes |
|---------|---------|-------|
| `nginx/html/support.html` | FAQ “Xero integration is on our roadmap for Q2-Q3 2026…” | Stale dated promise |
| `nginx/html/index.html` | “We're adding Xero integration soon…” | Stale |
| `apps/mobile/STORE_LISTING.md` | Present-tense “Know your cashflow position at a glance” + “Coming soon: Xero and MYOB integration” | Store-draft leftover; not a shipped feature |
| `apps/mobile/store-listing.json` | ROADMAP: “Xero integration for automatic accounting sync” | Submission-shaped listing leftover |
| `apps/mobile/App.tsx` | Splash cards “Xero Integration… Q2 2026” | Unused entry (`expo-router/entry` is `main`) |
| `docs/DISASTER_RECOVERY.md` | “Xero Integration” runbook / “Issue: Xero integration fails” | Internal DR leftover; no live Xero app |
| `CLAUDE.md` / `docs/CHANGELOG.md` Planned | Module 2 still listed as future | Internal roadmap, not crawler copy |

Brand-word “cashflow” in About copy (`apps/mobile/app/settings/index.tsx`) is category language, **not** a Module 2 forecasting claim.

Any later copy recall of those surfaces needs a Marc-approved marketing-truth commit. This leftover item is **register honesty only**.

## Claim register

Update `marketing-truths.json` `bossboard.cashflow-forecasting`:

- `verdict`: `ABSENT`
- `last_verified`: `2026-09-16`
- `decision`: `drop`
- `decision_notes`: ABSENT_CONFIRMED against leftover / trades equal-pull 2026-09-16
- `open_items` cashflow line: ABSENT_CONFIRMED, not “Module 2 Q2–Q3 2026”

MARC-APPROVED: not required — no customer-facing copy in this change.
