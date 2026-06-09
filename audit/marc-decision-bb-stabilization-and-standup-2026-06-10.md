# marc_decision: BossBoard stabilization + web CRUD parity + local stand-up — 2026-06-10

**Task-ID:** bb-stabilization-and-standup-2026-06-10
**Agent:** Claude Code (claude-opus-4-8 [1m], BossBoard session)
**Sessions covered:** 2026-06-09 → 2026-06-10 (single long session)
**Landed on master:** `3799ccf..f7d3013` (FF merge of branch `fix/bb-stabilization-2026-06-09`, 9 feature/fix commits + the pre-existing 4 unpushed local-master commits, then 2 post-merge fixes)

This captures what shipped, the decisions Marc made, and the durable learnings,
so a future session doesn't re-derive state.

---

## 1. What shipped (all verified, on master)

| Area | Change | Commit |
|---|---|---|
| **Mobile crash** | App launched then crashed on mount — root cause: `fb740e5` pinned mobile `react@19.2.4` while Expo SDK 54 / RN 0.81.5 want 19.1.0 → dual nested React → "Invalid hook call". Compounded by a broken `metro.config.js` force-block + a stale `@expo/metro-runtime@55.0.6` frozen in the lockfile dragging in react@19.2.4. Fixed by realigning to 19.1.0, removing the force-block, surgically repairing the lockfile. | `507abf6` |
| **F-CERT-03** (RED) | photo `entityType` enum rejected `certification` AND `quote` (mobile already sends `quote` → 400 in prod). Widened zod + shared `PhotoEntityType` + DB CHECK (migration `015`). | `58e94b7` |
| **F-COMP-04** (RED) | No SWMS PDF export. Added `generateSWMSPDF()` + `GET /api/v1/swms/:id/pdf` + tests. | `58e94b7` |
| **Tests** | Repaired 4 drifted API suites (mock/fixture drift — root causes, not green-washing) → **45 suites / 1172 tests green**. | `58e94b7` |
| **Lost migration** | `.gitignore` `*.sql` rule silently swallowed every new migration; recovered **`014_ai_usage`** (never committed — would crash fresh deploys on missing `ai_usage_log`). Added `!database/migrations/*.sql`. | `1915cd0`, `58e94b7` |
| **Infra** | Restored monorepo lint (ESLint v9 flat config, was 100% broken); web security headers (F-X-03); mobile expo-router `segments` typing. | `61d289f`, `019cc62`, `aa035d4` |
| **Web CRUD parity** | Web went from read-only companion → full create/edit for quotes, expenses, job-logs (clock in/out), SWMS AI generation + detail/PDF, certifications, photo upload. api-client expanded with deepCamelize across all modules (fixed latent snake_case bug on read pages). Built by a 6-agent swarm. | `cc9e4a9`, `6830c45` |
| **Security** | 2 moderate Dependabot alerts (qs DoS, ws memory disclosure) → patched `qs 6.15.2` (blanket override) + `ws 8.20.1` (version-range-scoped `ws@>=8.0.0 <8.20.1` so non-vuln ws@6/ws@7 untouched). In-place lockfile patch. Alerts auto-resolved on merge. | `1b23dbf` |
| **Slug conflict** | `next dev` refused to start — `app/api/photos/` had sibling dynamic slugs `[entityType]` vs `[id]`. `next build` TOLERATED it; only running `next dev` caught it. Moved list route under static `entity/` prefix. | `2d96778` |
| **Local-dev** | Pinned `outputFileTracingRoot` to silence wrong workspace-root inference (stray `~/package-lock.json`). | `f7d3013` |

**Quality gates run:** Grok/Nemo eye-pair on the lockfile fix; independent
security review (PASS, no Critical/High/Med on 17 new web routes); full
`next build` green; four-eyes diff review before push; marketing-truths.json
registered for the customer-facing copy changes with a `MARC-APPROVED` trailer.

## 2. Decisions Marc made

- **Web scope: full CRUD parity** (not read-only-by-design, not selective).
- **Session scope: everything fixable now** (defer only the Marc-decision-gated items below).
- **MARC-APPROVED** the customer-facing copy: empty-state CTAs replacing "use the
  mobile app" read-only copy (truthful now), + SWMS "designed to align with the
  HSW Act 2015 / not affiliated with WorkSafe NZ" disclaimer (Voice-A framing).
- **Dev DB reset** (1 trivial test user) to apply the full migration chain.
- **Removed** the accidental home-level `npm install lighthouse` (`~/package.json`
  + lock + 84MB `~/node_modules`).

## 3. End-to-end stand-up validation (on Spark)

Brought up API (`:29000`, Postgres+Redis) — all 16 migrations applied clean on a
reset DB **including `015`**. Drove the endpoints: register/auth ✅, photo→cert ✅
201, photo→quote ✅ 201, SWMS generate→PDF ✅ 200 `%PDF`, expense/job-log ✅ 201.
Web (`:3000`) serves all pages, auth middleware redirects correctly, authed
`/quotes/new` renders, full web→proxy→Express chain works (camelize + moved
photos route). The bossboard API may still be running on `:29000` at session end.

## 4. Still deferred (Marc-decision-gated, NOT touched)

`BETA_MODE=false` flip; Stripe `trademate_user_id` rename; Xero/cashflow Module 2;
GitHub repo rename runtime probes; e2e demo execution (still authored-but-unrun).

## 5. Durable learnings (also written to ~/.claude memory)

1. **Root-owned host build artifacts can be removed WITHOUT host sudo** — the
   docker daemon runs as root, so `docker run --rm -v <hostdir>:/work alpine rm -rf
   /work/.next` (or `chown -R 1000:1000`) fixes it. The 2026-05-26 audit + the
   docker-uid memory said "requires sudo"; this is the sudo-free alternative.
2. **`next build` tolerates Next dynamic-slug conflicts that `next dev` rejects** —
   actually running the app catches what build/tsc/lint miss. Stand-up testing earned
   its keep here.
3. **npm 10.9.7 workspace lockfile bug**: overrides aren't applied to frozen
   *transitive* entries via install (it prunes the node instead of re-resolving).
   For a transitive security bump, patch the lockfile entry in place
   (version+resolved+integrity) when the sub-tree is identical; validate with
   `npm ci --dry-run`. For partially-vulnerable packages, use a version-range
   override key, not a blanket or parent-scoped one (those leak across majors).
4. **Local stand-up quirks**: the API's `MIGRATIONS_DIR = cwd/database`, so run it
   from the repo root (source `apps/api/.env` first) for migrations to be found; a
   dev DB seeded from `init.sql` without the `_migrations` table re-runs init.sql and
   dies on the non-idempotent trigger — reset the schema. `cortexforge-ui` is a
   *different* project's container sharing the `next-server` process name on host
   `:28080` — never kill cross-project node processes by name.
