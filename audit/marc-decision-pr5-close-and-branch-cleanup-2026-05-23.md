# marc_decision: PR #5 close + branch cleanup — 2026-05-23

**Task-ID:** bb-pr5-close-and-branch-cleanup-2026-05-23
**Agent:** Claude Code (claude-opus-4-7, BossBoard session)
**Branch context:** post-rename master (`marc-2019/bossboard`)

## What was decided + executed

Two scope items, both executed in the same session via `AskUserQuestion` →
explicit Marc-yes (not chat-yes):

### 1. PR #5 — closed as superseded

**Decision:** Close, not rebase.

**PR:** [#5 — audit: BossBoard feature register + soften AI/legal-advice
framing](https://github.com/marc-2019/bossboard/pull/5)

**Why close rather than rebase:** A 2026-05-23 triage worktree showed PR #5's
intent had been fulfilled by independent master commits while the PR sat
22 days dormant. Mapping:

| PR #5 intent | Independent master commit |
|---|---|
| `apps/web/src/app/page.tsx` operator-accountable copy | `d754f4d` (MARC-APPROVED 2026-05-11) + `b268e75` |
| `README.md` compliance softening | `8de3d30` |
| `llms.txt` brand + compliance scrub | `6e14d46`, `cfc6ea3`, `26e2160`, `b268e75` |
| `marketing-truths.json` audit / 16-claim re-verify | `799837c docs(marketing-truths): BB A2 verification sweep 2026-05-19 (post Phase 1 paid-checkout)` |

PR #5 was opened pre-rename (`product_slug='trademate-nz'` references); the
A2 verification sweep is the authoritative current snapshot
(post-rename, post-Phase-1-paid-checkout). Rebasing would have produced
content in direct conflict with sister-agent-owned A2 sweep.

**PR close comment** preserves the full crosswalk for future archaeology.

### 2. Branch cleanup — conservative scope

**Decision:** Delete the 7 cleanly-merged branches (local + origin), leave
the 4 ambiguous ones for per-branch review later.

**Branches deleted (local + origin):**

- `auto/bb-copy-audit-fixes-2026-05-11`
- `auto/bb-polish-empty-state-dashboard`
- `auto/df84bfb5-bb-polish-empty-state-on-bossb` *(local-only — no origin delete)*
- `auto/ef8dd48e-bb-add-job-status-filter-to-da`
- `feat/ga4-portfolio-2026-05-17`
- `marc-approved/2026-04-30-bossboard-softening`
- `marc-approved/2026-04-30-team-tier-recall`

All 7 confirmed reachable from `origin/master` via `git branch --merged
origin/master` before deletion. Used `git branch -d` (safe form that
refuses if not merged), not `-D`.

**Left in place** (not in the merged set; conservative scope per Marc):

- `feat/marketing-truth-bossboard-feature-audit-2026-05-01` (PR #5 just
  closed; branch retained pending Marc-yes for branch delete)
- `fix/klaro-ondecline-revoke-all-2026-05-21` (PR #6 merged; local copy
  retained — its only ahead-of-master commit `532ea89` was cherry-picked
  to master as `8a9dfd7`, so it's now safely deletable when Marc says go)
- `marc-approved/2026-04-30-stage3-hook-install` (not in merged list;
  needs per-branch review)
- `auto/e4e06671-cf-discovery-doc-invoice-payme` (local-only, never pushed;
  needs per-branch review)
- 3× `origin/claude/*` session branches
  (`determined-darwin`, `frosty-spence`, `quirky-wescoff`) — orphan-signal
  but kept under conservative scope

## Side-effect commit landed on master

`8a9dfd7 chore: ignore .claude/worktrees/ (Claude Code worktree isolation)` —
one-line `.gitignore` addition that the `using-git-worktrees` skill requires
before creating a project-local worktree. Cherry-picked from local-klaro
commit `532ea89` per explicit Marc-yes.

## Counts — before / after

| Bucket | Before | After |
|---|---|---|
| Local branches | 12 | 5 |
| Remote branches (origin) | 13 (incl. master) | 7 (incl. master + new dependabot branch) |
| Open PRs | 1 (PR #5) | 0 |
| Master tip | `621ce24` | `8a9dfd7` |

## Out of scope but worth flagging

- **GitHub dependabot:** 12 vulnerabilities on default branch (7 high, 3
  moderate, 2 low). New `origin/dependabot/npm_and_yarn/npm_and_yarn-f433e91868`
  branch appeared during this session. Separate triage needed.
- **CLAUDE.md staleness:** Project `CLAUDE.md` claims CortexForge API is at
  `http://localhost:9000` — that port is actually Portainer on this host.
  CF endpoints listed (`/api/projects/495`) return 404. The
  `marc_decision(bossboard): ...` commit-watcher pattern is the working
  CF-update path, per recent commit history; the HTTP-API path appears stale.

## How to apply going forward

- Future PR-vs-master triage on a stale PR: survey conflict surface against
  *what master has already shipped* before choosing rebase. If the intent
  is independently shipped, close + comment-trail is cheaper than rebase.
- Branch cleanup default: conservative + per-branch evidence for ambiguous
  ones; never `git branch -D` without explicit Marc-yes; remote deletes
  are catastrophe-list per global `CLAUDE.md`.
