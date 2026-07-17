# BossBoard guardrail re-verify — 2026-07-18

**Why:** Many CF rows were `waived` by `cf-llm-verifier` with empty reasons. Marc asked which to re-check; we re-verified **secrets** + **deps** with primary evidence and left **store-submission** on a real checklist.

## Flipped to `passing`

| Directive | Evidence |
|-----------|----------|
| `secrets-credentials-hygiene` | `python3 tools/secret-scan-gate.py` → PASS (6 baselined, 0 new); no live key patterns in tree; `.gitleaks.toml` present |
| `dependency-vulnerability-hygiene` | `.github/dependabot.yml` weekly for monorepo workspaces; `npm audit` 0 vulns on api/web/mobile/root @ master `40b7553` |

Evidence file (CF host): `cortexforge/audit/guardrail-reverify/bossboard/20260717-secrets-deps.json`  
`last_verified_by`: `agent-evidence-2026-07-18`

## Left waived / open

| Directive | Action |
|-----------|--------|
| `store-submission-readiness-before-launch` | Follow `docs/STORE_SUBMISSION_REVERIFY.md` after IAP merge + Console; then flip |
| `security-review-quarterly` | Use lite table in STORE_SUBMISSION_REVERIFY § Lite security; flip when Marc accepts |
| `privileged-promote-gates` | Keep waived (reasoned: no AI promote surface) |
| `mock-full-provider-cascade-in-tests` | N/A — leave waived |
| `test-fixtures-runtime-pattern-construction` | N/A — leave waived |
| `tenant-isolation-write-paths` / `secure-user-input-import` | Spot-check before Team / bulk import expansion |

## Commands to re-run

```bash
cd ~/projects/bossboard   # or deploy checkout
python3 tools/secret-scan-gate.py
npm audit --workspace=apps/api
npm audit --workspace=apps/web
npm audit --workspace=apps/mobile
```

## Also flipped (evidence pre-existed)

From `cortexforge/audit/security/2026-07-17-bossboard-security-review-pass1.md` (verdict already said passing; CF rows still waived):

| Directive | Status now | Evidence |
|-----------|------------|----------|
| tenant-isolation-write-paths | **passing** | user_id ownership + tests |
| secure-user-input-import | **passing** | public HTML escape; no unsafe paste path |
| security-review-quarterly | **passing** | pass-1 dated 2026-07-17 |

`privileged-promote-gates` remains **waived** with reason + expiry 2027-01-13.
