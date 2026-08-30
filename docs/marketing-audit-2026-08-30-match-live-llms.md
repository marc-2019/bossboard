# Marketing copy audit — BossBoard — 2026-08-30 match live llms

**Repo:** `/home/marc/bb-wt-copy-honesty` (origin/master `3ac930b`)  
**Marc:** yes B (session 2026-08-30) — make git match live llms  
**Auditor:** grok; four-eyes before push

## Evidence

| Surface | Before | After |
|---------|--------|-------|
| Live `https://bossboard.instilligent.com/llms.txt` | No cashflow / Xero / Q2 2026 (HTTP 200, 1884 bytes, 2026-08-30) | unchanged (already honest) |
| Git `apps/web/public/llms.txt` | Same as live | unchanged |
| Git root `llms.txt` | L23 “Xero integration + full cashflow forecasting coming Q2 2026”; also “overdue invoice chasing” | Replaced with public/live file |
| Git `README.md` | “Cashflow Forecasting (Coming Q2 2026)” | Line removed. Revenue dashboard line kept. Visa/hiring remains future-tense Q3–Q4. |

## Claim

| id | Verdict | Decision |
|----|---------|----------|
| `bossboard.cashflow-forecasting` | ABSENT in code (no Xero OAuth, no chase service, stats = revenue history) | **drop from copy** (dated Q2 2026 promise is also stale). Feature still unbuilt. |

Code refs (unchanged): Module 2 in CLAUDE.md; no `xero` in `apps/api/src/services` + routes (prior audit 2026-07-11).

## What we did not do

- Did not change live site (already clean)
- Did not claim Xero/cashflow exists
- Did not Submit App Store

MARC-APPROVED: 2026-08-30 yes B (align git llms.txt + README to live)
