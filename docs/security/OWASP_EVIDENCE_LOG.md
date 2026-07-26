# BossBoard — OWASP Top 10 evidence log (living)

**Purpose:** Close the “Security audit (OWASP top 10)” launch-checklist line with
**evidence**, not a one-shot AI prompt. Update rows when code/tests change.

**Last update:** 2026-07-26  
**Scope:** `apps/api` + `apps/web` (product). Mobile store policies separate.

Status: **PARTIAL** — several items PROVEN via code/tests/live probes; formal
pass not complete for every route class.

| OWASP | Risk (BB context) | Status | Evidence |
|-------|-------------------|--------|----------|
| A01 Broken Access Control | Cross-tenant read/write | PARTIAL | App-level `user_id` on queries/UPSERTs; sync tenant tests. **GAP:** Postgres RLS |
| A02 Cryptographic Failures | JWT/secrets at rest | PARTIAL | JWT secrets required at boot; Stripe/Anthropic server-only |
| A03 Injection | SQL / XSS / prompt | PARTIAL | Parameterized SQL; Zod validation; AI untrusted framing + system policy (2026-07-26 `claude.ts`) |
| A04 Insecure Design | Abuse of AI/billing | PARTIAL | Monthly AI tier caps + per-user burst (`aiBurstLimit`); subscription middleware |
| A05 Security Misconfiguration | Headers / CORS | PROVEN (API) | Helmet + live CSP/HSTS; CORS allow-list; prod deny-all if unset. Live OPTIONS 2026-07-26 |
| A06 Vulnerable Components | npm CVEs | PARTIAL | Dependabot open on repo — triage ongoing |
| A07 Auth Failures | Login/reset abuse | PROVEN | Auth rate limit; enumeration-safe forgot; reset/verify lockout tests (`auth-recovery.test.ts`) |
| A08 Software/Data Integrity | Webhooks | PARTIAL | Stripe raw body + HMAC path |
| A09 Logging/Monitoring | Secret leak in logs | PARTIAL | `redactSecrets` in error handler; reduced AI response logging |
| A10 SSRF | Server-side fetch | LOW | No user-controlled outbound URL fetch on SWMS path |

## Auth failure path inventory (closes “test failure path” checklist intent)

| Case | Evidence |
|------|----------|
| Forgot unknown email | Enumeration-safe message + service silent (`auth.test.ts` / `auth-recovery`) |
| Reset invalid code / lockout | `auth-recovery.test.ts` 429 path |
| Verify-email lockout | `auth-recovery.test.ts` |
| Signup existing email | `EMAIL_EXISTS` tests in `auth.test.ts` |
| Wrong credentials | Invalid credentials path in auth tests |

Optional later: single Playwright suite that hits all of the above against staging.

## Not this log

- Lawyer review of privacy/ToS (Marc EXTERNAL)
- Courses EzyCourse legal paste
- Cloudflare Turnstile (project work when site keys exist)

## How to tick “done”

1. Every row PROVEN or accepted residual with Marc note  
2. Link this file from `MASTER_LAUNCH_CHECKLIST.md` Security audit line  
3. Date stamp  
