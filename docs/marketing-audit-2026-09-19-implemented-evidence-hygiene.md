# Marketing-truth hygiene — soft IMPLEMENTED evidence + last_verified (G2) — 2026-09-19

**Repo:** `marc-2019/bossboard`  
**Source:** Security PROVEN G2 (empty `evidence_references` / stale `last_verified` on IMPLEMENTED rows)  
**Scope:** Register hygiene only. `marketing-truths.json` + this note. No product work, no ASC, no live publish.

## What this pass did

Re-checked IMPLEMENTED claims that had empty/missing `evidence_references` and/or `last_verified` before ~2026-06-19. Added real repo paths / already-live public URLs. Set `last_verified` to **2026-09-19** only where those paths were confirmed to exist.

| Metric (IMPLEMENTED rows) | Before (origin/master) | After |
|---------------------------|------------------------|-------|
| Empty `evidence_references` | 15 / 34 | 0 / 34 |
| `last_verified` before 2026-06-19 | 12 / 34 | 0 / 34 |

Also refreshed `bossboard.nzbn-surface-pipe` and `bossboard.nzbn-surface-llms` (soft hedges called out in the G2 brief) after re-checking footer / llms NZBN `9429041896853`.

Rewrote stale evidence on `bossboard.swms-onetap-hazards-surface`: `apps/api/src/routes/compliance.ts` no longer exists; pointed at `POST /api/v1/swms/generate` + `claude.ts`.

## Honesty notes

- **`bossboard.photos`**: entity attachments re-verified. GPS tagging evidence is still thin / UNKNOWN (no lat/lng on `photos`; no EXIF GPS persist). Verdict left IMPLEMENTED (pre-existing).
- **`bossboard.certifications`**: 30/14/7/1 reminder thresholds exist in `notifications.ts` + cron. `llms.txt` / landing currently have no dedicated cert bullet.

## What this PR does not do

- Does **not** change ABSENT / PARTIAL / PLANNED / STUB verdicts
- Does **not** touch `bossboard.subscription-billing-rails` (stays PARTIAL — PR #121)
- Does **not** reopen cashflow/Xero ABSENT (`bossboard.cashflow-forecasting`)
- Does **not** invent Module 2/3 features, prices, SKUs, or live capabilities
