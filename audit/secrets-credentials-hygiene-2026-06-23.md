# Guardrail remediation: secrets-credentials-hygiene

**Date:** 2026-06-23
**Product:** bossboard
**Guardrail:** `secrets-credentials-hygiene`
**Trigger:** CF auto-implementation — "Remove hardcoded secrets/credentials, move to
env/secret store, rotate any exposed values; re-run the secrets scan."

## What was wrong

1. **No secrets-scanning infrastructure existed.** No gitleaks/trufflehog/detect-secrets,
   no pre-commit hook, no CI step. The guardrail had nothing to run — hence "re-run the
   secrets scan" had no scan to re-run.
2. **One real committed secret:** an expired test-user JWT access token embedded in
   `.claude/settings.local.json` (stale one-off PowerShell permission entries), plus the
   test creds `test2@trademate.nz` / `TestPass123` alongside it.

## Evidence (gitleaks, committed-history scan)

Before remediation — 2 findings:
- `.claude/settings.local.json:25` (rule `jwt`) — **real** but EXPIRED token.
  Decoded payload: `{"userId":"17e62054-…","email":"test2@trademate.nz","iat":1770089370,
  "exp":1770090270}` → exp **2026-02-03 03:44 UTC**, a 15-minute access token, dead ~4.5
  months before discovery. Not a signing secret; never a production credential.
- `docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md:60` (rule
  `curl-auth-user`) — **false positive**: the matched value is the shell variable
  `$STRIPE_TEST_SECRET_KEY`, not a literal.

After remediation — **0 findings, exit 0** (`no leaks found`), both `detect` (history) and
`--no-git` (working tree) modes.

## What was done (autonomous, governance-safe)

1. **Scrubbed** the expired JWT + test creds from `.claude/settings.local.json` — removed 3
   stale PowerShell allowlist entries (already redundant with the broad `Bash(powershell:*)`
   entry, so zero permission change).
2. **Added `.gitleaks.toml`** — scan config with a deliberately narrow allowlist (gitignored
   build artifacts, `*.example`/`*.template` placeholder files, well-known fake test
   credentials, and the confirmed shell-var false positive).
3. **Added `.gitleaksignore`** — accepts the single expired-JWT *historical* fingerprint with
   documented justification (token is dead; history purge is Marc-owned — see below).
4. **Added `.github/workflows/secrets-scan.yml`** — CI gitleaks scan on push (master) + every
   PR; fails the build on any new committed secret.
5. **Added `scripts/scan-secrets.sh`** — local, re-runnable scan (native gitleaks or Docker
   fallback) mirroring CI. This is the "re-run the secrets scan" entry point.

## Confirmed clean (no action needed)

- App source: `JWT_SECRET`/`JWT_REFRESH_SECRET` have **no fallback** (missing = startup
  failure); API keys default to `''`; `.env` is git-ignored and **not tracked**.
- `docker-compose.production.yml`: all secrets come from `${VAR}` with no defaults.
- CI (`api-ci.yml`) uses an ephemeral `test_password` for a throwaway Postgres container —
  acceptable.

## Deferred to Marc (TIER A — NOT actioned autonomously)

Per always-on governance (`~/.claude/CLAUDE.md`), `docker-compose*` is a TIER A critical-path
file requiring **Marc-yes + pre-edit eye-pair**. The following are flagged but **not changed**:

- `docker-compose.yml` ships **dev-only default fallbacks** that a strict scanner would flag:
  - `JWT_SECRET:-bossboard_jwt_dev_secret_2026`
  - `JWT_REFRESH_SECRET:-bossboard_jwt_refresh_dev_2026`
  - `POSTGRES_PASSWORD:-bossboard_dev_2026`
  These are dev-convenience defaults (never used in production — Railway provides real env),
  but moving them to a required `.env` (drop the `:-default`) would remove the last hardcoded
  credential-shaped strings from the tree. **Marc's call** — it's a small DX trade-off.

**Rotation:** nothing to rotate. The only real committed secret was an already-expired access
token (not a reusable credential). No live keys were exposed in tracked files.

**History purge (optional, Marc-owned):** the dead JWT remains in commit `9d2a49eb`. Removing
it from history needs `git filter-repo` + force-push to the shared remote — outside autonomous
authority. Given the token is expired and was never a production secret, allowlisting it (done)
is the proportionate response; a history rewrite is optional cleanup only.
