# marc_decision: BossBoard e2e demo suite — session continuation handoff — 2026-05-26

**Task-ID:** bb-e2e-session-continuation-2026-05-26
**Agent:** Claude Code (claude-opus-4-7, BossBoard session)
**Sessions covered:** 2026-05-23 (full day, all phases) + 2026-05-26 (continuation through blocker)

Marc is about to restart his PC for updates. This audit captures the
**continuation contract** so the next Claude session can pick up exactly
where we stopped — without re-deriving state.

---

## 1. Where we stopped — the exact blocker

**Status: BLOCKED on a one-liner sudo command that requires Marc.**

`/home/marc/projects/bossboard/node_modules/` and the per-workspace
`*/node_modules/` trees have **59,229 root-owned files** (758 packages at
depth 1, all timestamps `Apr 24 13:37` — created by a docker container
that ran as root with a bind-mounted workspace). Current user `marc`
(uid 1000) cannot mutate them. Any `npm install` fails with
`EACCES: permission denied, rename 'node_modules/.bin/uuid' -> ...`.

**The fix Marc must run himself in his own terminal** (NOT via Claude's
`!` prefix — that captures sudo stdin per global CLAUDE.md):

```bash
cd /home/marc/projects/bossboard
sudo chown -R marc:marc node_modules apps/api/node_modules apps/web/node_modules apps/mobile/node_modules packages/shared/node_modules

# Then (NO sudo from here):
npm install --no-audit --no-fund

# THEN — critical L1 step (npm 10.9.7 drops the overrides block):
node -e "const fs = require('fs'); const lf = require('./package-lock.json'); const pkg = require('./package.json'); lf.packages[''].overrides = pkg.overrides; fs.writeFileSync('./package-lock.json', JSON.stringify(lf, null, 2) + '\n');"

# Verify all 13 overrides at safe versions:
for pkg in braces semver handlebars lodash node-forge path-to-regexp picomatch yaml xml2js @xmldom/xmldom brace-expansion uuid postcss; do
  v=$(node -e "const lf=require('./package-lock.json'); const e=lf.packages['node_modules/'+'$pkg']; console.log(e?e.version:'MISSING')")
  echo "  $pkg: $v"
done
```

After PC restart + Marc-runs-sudo, the next Claude session can resume Phase
6b from the section "Next session quick-start" below.

---

## 2. Two-session work summary (what's on master)

### 2026-05-23 session (full Phase 0-5 of the e2e demo plan)

Commits to master (in chronological order):

| Commit | What |
|---|---|
| `8a9dfd7` | chore: ignore .claude/worktrees/ |
| `83199fe` | marc_decision: PR #5 close + branch cleanup audit |
| `fa90db3` | docs(claude.md): replace stale CortexForge HTTP API stanza |
| `9f71354` | docs(claude.md): drop stale trademate-* container-name refs |
| `c0df00b` | marc_decision: session learnings + info needed |
| `b60f117` | docs(plan): commit E2E demo + spec coverage suite implementation plan |
| `fdc888c` | feat(test): Maestro mobile e2e tooling (#9, Phase 2) |
| `ddb5537` | docs(testing): derive E2E demo + spec coverage matrix (#10, Phase 1) |
| 13× more | Phase 3 — 14 module PRs squash-merged (#12-#25 minus #11) |
| `e5e4730` | security(deps): bump next 15.5.15 → 15.5.18 (#8) |
| `e02726b` | feat(test): mock infrastructure for Stripe/Resend/Claude (#28, Phase 6a) |
| `8543db0` | feat(test): demo runner + highlights + runbook (#26, Phase 5) |
| `ae11478` | docs(testing): executive gap report (#27, Phase 4) |

### Between sessions (autonomous executor + Marc directly)

- `527639f edit(bossboard): [BUG-BB-MOBILE] stale legal URLs in STORE_LISTING.md`
- `a5c13bc fix(web): finish cf-llm partial fix for TS2322 in e2e photos helper`
  — **CF compound layer autonomously fixed a TypeScript error left by my photos agent.** Good signal.
- `4fd9f81 chore(mobile): record deletion of legacy trademate adaptive icon`

### 2026-05-26 session (continuation, this session)

- Detected and surfaced node_modules root-ownership blocker (above)
- Wrote this audit file
- Saved the docker-uid memory (see Section 6)

**Master tip when this audit lands:** will be the commit-after-this-one
(this commit's hash). Net session output: ~17,600 LOC of test code + 5
audit files + 5 memory files + mock infrastructure + demo runner + gap
report.

---

## 3. Demo suite — what's authored vs what's run

| Layer | Status |
|---|---|
| **Spec matrix** (`docs/testing/SPEC_AND_DEMOS_MATRIX.md`) | ✅ on master, 50 features × 14 modules |
| **Web Playwright demo specs** (`apps/web/e2e/demos/*.spec.ts`) | ✅ all 14 modules on master |
| **API Playwright demo specs** (`apps/web/e2e/demos/api/*.api.spec.ts`) | ✅ all 14 modules |
| **Mobile Maestro flows** (`apps/mobile/.maestro/01-47-*.yaml`) | ✅ 47 flows + smoke flow |
| **Helpers + fixtures** (`apps/web/e2e/demos/helpers/*.ts`) | ✅ per-module helpers |
| **Per-module coverage reports** (`docs/testing/coverage/*.md`) | ✅ 14 reports |
| **Executive gap report** (`docs/testing/EXECUTIVE_GAP_REPORT.md`) | ✅ on master, 50-row table |
| **Demo runner** (`scripts/run-all-demos.sh`) | ✅ executable |
| **`npm run demo:all`/`web`/`api`/`mobile` scripts** | ✅ on master |
| **DEMO_HIGHLIGHTS.md + DEMO_RUNBOOK.md** | ✅ on master |
| **Mock infrastructure** (`apps/api/src/services/mocks/`) | ✅ per-service: MOCK_STRIPE, MOCK_RESEND, MOCK_CLAUDE |
| **`apps/api/.env.template`** | ✅ on master, Marc-populated locally (JWT secrets + MOCK_STRIPE=true) |
| **DEMOS ACTUALLY EXECUTED** | ❌ **0%** — blocked at apps/api startup (missing @sentry/integrations after the sudo blocker; will resolve after `npm install` post-chown) |

So: **construction 100% done; execution 0% done.** The runtime block is
the sudo chown above.

---

## 4. Next session quick-start

When Marc finishes restart + runs the sudo chown sequence in Section 1,
the next Claude session should:

1. **Verify state:**
   ```bash
   cd /home/marc/projects/bossboard
   git pull --ff-only origin master
   find node_modules -uid 0 2>/dev/null | wc -l    # expect 0
   grep -c '"overrides"' package-lock.json          # expect 1
   ls apps/api/.env                                  # expect exists
   docker ps --format '{{.Names}}: {{.Status}}' | grep bossboard
     # expect bossboard-postgres + bossboard-redis healthy (if not, `docker compose up -d bossboard-postgres bossboard-redis`)
   ```

2. **Start apps/api (background):**
   ```bash
   cd apps/api && npm run dev > /tmp/bossboard-api.log 2>&1 &
   # wait ~10s; then:
   curl -sS http://localhost:29000/health
   ```
   Expect `{"status":"ok"}` or similar. If 500, tail `/tmp/bossboard-api.log` for missing-module / config errors.

3. **Start apps/web (background):**
   ```bash
   cd apps/web && npm run dev > /tmp/bossboard-web.log 2>&1 &
   # wait ~15s; then:
   curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000
   ```
   Expect 200.

4. **Run demos** (headless+video, NOT headed — agent sandbox has no display):
   ```bash
   cd apps/web
   npx playwright test e2e/demos/api/ --workers=2 --reporter=list 2>&1 | tail -60
   # then:
   npx playwright test e2e/demos/ --workers=1 --reporter=list 2>&1 | tail -60
   ```
   (Don't use `npm run demo:web` directly — it forces `--headed` which needs a display server.)

5. **Iterate per-module failures.** Expect 30-50% touch-ups on first run
   (standard for fresh e2e — selector drift, fixture issues, race
   conditions). Per Phase 4 executive gap report, expected drift hot
   spots:
   - F-CERT-03: `apps/api/src/routes/photos.ts:51` Zod enum missing `'certification'` (pre-known)
   - F-COMP-04: `GET /api/v1/swms/:id/pdf` route doesn't exist (pre-known)
   - Web /verify-email + /onboarding + /recurring + /bank routes missing
     (mobile-only per matrix; tests are drift-pinned)

6. **Update DEMO_HIGHLIGHTS.md** with actual `apps/web/test-results/<test>/video.webm` paths after the run produces videos.

7. **Stop background processes when done:**
   ```bash
   pkill -f 'tsx watch src/index.ts'   # apps/api
   pkill -f 'next dev'                  # apps/web
   ```

---

## 5. Things that happened across these sessions you should know

1. **CLAUDE.md trimmed 2× this session:** the CortexForge HTTP API stanza
   (port 9000 was Portainer, not CF) and the `trademate-*` container
   prefix (real prefix is `bossboard-*`). Both stale at session start.
2. **PR #5** (22-day-old marketing-truths audit) closed as superseded by
   independent master commits — `799837c` A2 sweep made it redundant.
3. **PR #7 + #11** (Dependabot npm-group bumps) both closed — they each
   dropped the security `overrides` block that pins 13 packages for
   prior CVE fixes. PR #8 (manual next 15.5.18 with overrides preserved)
   replaced #7 and merged.
4. **PR #8 merged.** All 12 next-package CVEs (7 high) now resolved on
   master.
5. **14 branches deleted** (May 23) + 14 more deleted (Phase 3 merge
   round) = repo branch sprawl was the original problem; now solved.
6. **Marc's apps/api/.env populated** (JWT_SECRET + JWT_REFRESH_SECRET
   real, MOCK_STRIPE=true, MOCK_CLAUDE=true, MOCK_RESEND=true). Real
   Stripe key NOT pasted (Marc had it but security-best-practice dictates
   not pasting to chat).
7. **CF compound layer autonomously fixed** a TS2322 left in
   `apps/web/e2e/demos/helpers/photos.ts` between sessions — commit
   `a5c13bc`. Validates the marc_decision commit-watcher path is
   bidirectional: CF reads my decisions AND ships fixes.
8. **Docker postgres + redis** still running (2 days uptime, healthy).
   Marc's PC restart will stop them. Next session: `docker compose up -d
   bossboard-postgres bossboard-redis` to bring back.

---

## 6. New memory saved this session

- `feedback_docker_uid_corrupts_host_node_modules.md` (this session,
  2026-05-26): docker containers that run as root + bind-mount the host
  workspace will create root-owned files. Host user can't mutate. Always
  set container UID to match host (1000 typically) via Dockerfile USER
  directive or `docker run --user $(id -u):$(id -g)`.

Already-saved memories from 2026-05-23:
- `project_npm_overrides_regeneration_bug.md`
- `feedback_dependabot_pr_review_pattern.md`
- `feedback_survey_before_rebase_stale_prs.md`
- `reference_cf_integration_commit_watcher.md`
- `feedback_parallel_agents_need_worktrees.md`

---

## 7. Open PRs and pending decisions

**Open PRs:** zero. Master is the only branch.

**Still BLOCKED ON MARC** (from earlier 2026-05-23 audit, status
unchanged):
1. GitHub Actions workflow auth fix (R3 of bb-session-learnings audit)
2. production BETA_MODE=false flip trigger (`7ca7fe8` scope a/b/c/d)
3. cashflow Q2→Q3 2026 push (`507791e` scope a/b/c)
4. Stripe metadata rename `trademate_user_id` → `bossboard_user_id` (`9700c54` — contract surface; likely keep-as-is)
5. GitHub repo rename runtime probes (`be2e4ea` — Railway / Sentry / CF DB column)
6. BB customer-facing docs sweep scope a/b/c (`b059c8e`)

**Phase 4 executive gap report top-3 code actions:**
1. F-CERT-03 zod enum fix
2. F-COMP-04 SWMS PDF route
3. apps/web 5 security headers

---

## 8. Continuation contract — how to enter this work cold

Future Claude session, on first message:

1. Read this audit file in full
2. Read `audit/marc-decision-bb-session-learnings-2026-05-23.md` for
   the original Phase 0-5 context
3. Read the 6 memory files at
   `~/.claude/projects/-home-marc-projects-bossboard/memory/`
4. Run Section 4 quick-start commands

That's the full picture. No additional context-gathering needed.
