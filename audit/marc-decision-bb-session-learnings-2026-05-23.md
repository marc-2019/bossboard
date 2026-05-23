# marc_decision: BossBoard session learnings + info needed — 2026-05-23

**Task-ID:** bb-session-learnings-2026-05-23
**Agent:** Claude Code (claude-opus-4-7, BossBoard session)
**Session shape:** branch cleanup + PR #5 close + security dep upgrade
+ CLAUDE.md fix + 7-branch wipe + this learnings record.

This audit captures the **learnings + reference info** that should outlive
the session, so future Claude sessions (and Marc) don't have to
re-derive them. Filed via the `marc_decision(bossboard):` commit-watcher
pattern so CF picks it up.

---

## 1. Critical learnings (apply going forward)

### L1 — npm 10.9.7 + workspaces + `overrides` regeneration bug

**What happens:** Running `npm install` (with or without flags) on this
repo causes npm to **silently drop** the root `overrides` block from
`package-lock.json` packages[""] metadata. The actual on-disk resolutions
of override packages stay correct (because package.json still has the
overrides block), but the lockfile metadata becomes inconsistent.

Dependabot's auto-regenerated lockfiles hit the same bug. **PR #7
(Dependabot's next 15.5.15→15.5.18) was unmergeable for this reason** — it
also dropped per-workspace override resolutions
(`apps/api/node_modules/uuid@11.1.1`, `apps/web/node_modules/postcss@8.5.10`),
which would have regressed prior security fixes (`2233ff8` xmldom triage,
`c184023` uuid CJS-compat pin for Railway).

**Workaround (proven in PR #8):** after `npm install`, manually restore the
overrides block to the lockfile root:

```bash
node -e "
const fs = require('fs');
const lf = require('./package-lock.json');
const pkg = require('./package.json');
lf.packages[''].overrides = pkg.overrides;
fs.writeFileSync('./package-lock.json', JSON.stringify(lf, null, 2) + '\n');
"
```

Then verify all 13 override packages resolve to their pinned safe
versions both in lockfile and on disk. See L2 for the verification matrix.

**Why this matters:** Future security upgrades on this repo MUST run this
restore step. Forgetting it ships a lockfile that's metadata-inconsistent
and any future `npm install` may resolve unsafe transitive versions.

### L2 — Dependabot PR review pattern for this repo

**Default behaviour to assume:** any Dependabot PR that regenerates the
lockfile WILL drop the overrides block. Treat Dependabot PRs as "diff
candidates", not "ready to merge".

**Review checklist before merging any Dependabot PR:**

1. `gh pr diff <N>` — does the lockfile diff remove the root `overrides`
   block? (Look for `-      "overrides": {` lines.) If yes → reject.
2. Does the diff remove per-workspace override resolutions like
   `apps/api/node_modules/uuid@11.1.1` or
   `apps/web/node_modules/postcss@8.5.10`? If yes → reject.
3. CI status — note: the `BossBoard Web CI` workflow currently fails
   checkout on Dependabot fork-context PRs (`could not read Username for
   'https://github.com'`). This is a workflow auth bug (see Out-of-Scope
   #1), **not** a code problem. Don't take it as a code-failure signal.

**Safe path when 1 or 2 fail:** dump the Dependabot PR + redo the bump
manually following PR #8's pattern (worktree off master, temporarily
move `.npmrc` aside, edit workspace package.json, `npm install`,
manually restore overrides block, verify resolutions, commit, push,
open clean PR).

### L3 — Survey-before-rebase for stale PRs

**Rule:** before choosing "rebase the stale PR" on anything 14+ days
old, run a quick survey of what master has already shipped in the
overlapping file set. Old PRs in a fast-moving repo are often
**superseded by independent commits** — closing them is cheaper than
rebasing.

**Evidence from this session:** PR #5 (22 days old) had 4 conflicting
files with 23 master commits touching them. The 4 files' intents had
all shipped independently:

| PR #5 intended | Master already had |
|---|---|
| Soften page.tsx compliance | `d754f4d` MARC-APPROVED 2026-05-11 + `b268e75` |
| Soften README.md compliance | `8de3d30` |
| Scrub llms.txt brand-bleed + compliance-promise | `6e14d46`, `cfc6ea3`, `26e2160`, `b268e75` |
| Refresh marketing-truths.json audit | `799837c` A2 verification sweep 2026-05-19 |

Rebasing would have produced content in direct conflict with the
authoritative `799837c` sister-agent A2 sweep snapshot. Closing the PR
with a supersession comment was the right call.

**How to apply:** when a PR is >2 weeks old and master has moved, *first*
run `git log --oneline <pr-base>..origin/master -- <each-PR-file>`. If
the master commits substantively cover the PR's intent, prefer close-and-
document over rebase.

### L4 — `.claude/worktrees/` gitignore prerequisite

The `using-git-worktrees` superpowers skill creates worktrees inside
`.claude/worktrees/`. That path must be gitignored on master or future
worktree creation falls foul of the safety verification step. Added in
commit `8a9dfd7`. **No action needed** — recorded here so future
sessions don't accidentally remove it.

---

## 2. Reference info that should outlive the session

### R1 — The 13 security overrides catalog (root `package.json`)

Each entry below is at this version *because* of a prior security fix.
**Do not remove or downgrade without coordinated re-audit.**

| Package | Pinned to | Why pinned | Source commit |
|---|---|---|---|
| `braces` | ^3.0.3 | Original mega security update | `1e844d1` |
| `micromatch` | ^4.0.8 | Mega security update | `1e844d1` |
| `semver` | ^7.7.2 | Mega security update | `1e844d1` |
| `handlebars` | ^4.7.9 | Critical CVE | `b98c102` |
| `lodash` | ^4.17.21 | High CVE | `b98c102` |
| `node-forge` | ^1.3.3 | High CVE | `b98c102` |
| `path-to-regexp` | ^0.1.13 | High CVE | `b98c102` |
| `picomatch` | ^4.0.4 | High CVE | `b98c102` |
| `yaml` | ^2.8.3 | Dependabot triage | `24cc150` |
| `xml2js` | ^0.6.2 | Dependabot triage | `24cc150` |
| `@xmldom/xmldom` | ^0.8.13 | **4 HIGH advisories** | `2233ff8` |
| `xmldom` | ^0.6.0 | Coordinated with @xmldom/xmldom | `2233ff8` |
| `brace-expansion` | ^2.0.3 | Dependabot triage | `2233ff8` |
| `@tootallnate/once` | ^3.0.1 | Dependabot triage | `2233ff8` |
| `uuid` | ^11.1.1 | **Railway CJS compatibility** — uuid 14.x breaks BB API Railway deploy | `c184023` |
| `postcss` | ^8.5.10 | Dependabot triage | `c184023` |

The `uuid: ^11.1.1` entry is especially load-bearing — uuid 14.x is what
Dependabot tries to upgrade to, but it breaks Railway's CJS resolution
and is why the orphan branch `auto/e4e06671-cf-discovery-doc-invoice-payme`
(which tried to bump uuid 11→14) was contradicted on master.

### R2 — CortexForge integration mechanism (verified 2026-05-23)

CF integrates with this repo via a **commit-watcher**, NOT an HTTP API.

Project CLAUDE.md previously documented HTTP endpoints
(`http://localhost:9000/api/projects/495`) — those are stale. Port 9000
on the dev host is Portainer; the listed endpoints return 404. Fixed in
`fa90db3` (2026-05-23).

**Verified path:** the commit-watcher picks up two prefixes on master
commits and writes a queue entry into
`.cf-pending-reviews/{YYYYMMDDTHHMMSSZ}-cross-tree.{diff,meta.json}`:

- `marc_decision(bossboard): ...` — decision records (this audit file
  pattern). Typically paired with an `audit/marc-decision-{topic}-{date}.md`
  file linked from the commit body.
- `compound_priority_item(bossboard): ...` — CF-originated items shipped
  by the CF-LLM autonomous executor (e.g. `cca8983`).

This commit will create a `.cf-pending-reviews/` entry that should
appear within minutes of push. That's the canonical signal CF saw it.

### R3 — GitHub Actions workflow needs auth fix for Dependabot PRs

The `BossBoard Web CI` workflow's `actions/checkout@v4` step fails on
Dependabot fork-context PRs:

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

This is unrelated to lint/type-check/build itself — the workflow never
reaches those steps. Likely fix: add a `permissions:` block to the
workflow (`contents: read, pull-requests: read`). Alternative
(`pull_request_target`) is security-risky and should be avoided.

Filed here so future sessions don't waste cycles re-investigating
"why did CI fail on a Dependabot PR".

---

## 3. Out-of-scope items still waiting on Marc

These are NOT actionable autonomously — they need Marc-decision scope
picks. Listed here so they don't fall off the radar.

1. **GitHub Actions workflow auth fix** (R3 above) — small workflow YAML
   edit, but affects CI behaviour on all future Dependabot PRs.
2. `marc_decision(bossboard): [BLOCKED ON MARC] production BETA_MODE=false
   flip trigger (scope a/b/c/d) + FTA-replay ordering` (`7ca7fe8`)
3. `marc_decision(bossboard): [BLOCKED ON MARC] cashflow forecasting
   Q2→Q3 2026 push (scope a/b/c)` (`507791e`)
4. `marc_decision(bossboard): [BLOCKED ON MARC] Stripe metadata rename
   trademate_user_id → bossboard_user_id` (`9700c54`) — note: project
   CLAUDE.md flags this as a contract surface; decision is likely
   "keep as-is" but needs explicit confirmation.
5. `marc_decision(bossboard): [BLOCKED ON MARC] GitHub repo rename —
   re-verify 2026-05-23, rename DONE, runtime probes remain` (`be2e4ea`)
   — Railway / Sentry / CF DB column probes still pending.
6. `marc_decision(bossboard): [BLOCKED ON MARC] BB customer-facing docs
   sweep — re-verify counts 2026-05-23, still blocked on scope (a/b/c)`
   (`b059c8e`)

## 4. Session output summary

- **3 commits on master:** `8a9dfd7` (.gitignore), `83199fe`
  (prior marc_decision audit), `fa90db3` (CLAUDE.md CF stanza fix).
  This commit will be the 4th.
- **PR #5 closed** (superseded; see prior audit `marc-decision-pr5-close-
  and-branch-cleanup-2026-05-23.md`).
- **PR #8 opened + CI green:** security(deps) next 15.5.15 → 15.5.18,
  closes all 12 advisories. Ready for Marc merge.
- **PR #7 (Dependabot's broken attempt) closed** with reference to PR #8.
- **14 branches deleted** (round 1: 7 cleanly-merged; round 2: 4
  closed-PR / contradicted / thrashed + 3 pre-rename `claude/*`
  orphans).
- **Local branches: 12 → 2.** **Origin branches: 13 → 2.**
- **Open dependabot advisories: 12 → 0 pending Marc merge of PR #8.**
