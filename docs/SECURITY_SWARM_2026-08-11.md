# BossBoard Security Swarm — 2026-08-11

**Scope:** Defensive audit of `/Users/marc/Projects/bossboard` (API + web BFF + cookies/auth), focused on high-severity classes: missing auth, IDOR / tenancy, JWT/cookies, field encryption, uploads, Stripe webhooks, CORS, rate limits, service tokens, PII in logs.

**Rules:** Read-only attack surface review; fixes only in local codebase. No exploits, PoCs, or attack playbooks.

**Branch:** `security/swarm-2026-08-11`

---

## Executive summary

Tenant isolation for core CRUD (invoices, customers, quotes, expenses, documents, teams) is generally solid: routes use `authenticate`, services filter by `user_id`. Stripe webhooks use signature verification with raw body. Auth has IP rate limits + code attempt lockouts. Field encryption (AES-256-GCM) exists for customer/business PII.

Several real gaps were found and mostly fixed in this pass:

| Sev | Finding | Status |
|-----|---------|--------|
| High | Any authenticated user could trigger global cert-expiry cron | **Fixed** — service token (prod) |
| High | Web BFF auth proxies hid client IP → auth rate limit shared/bypassable | **Fixed** — forward `X-Forwarded-For` |
| Medium | Photo upload had no entity ownership check | **Fixed** |
| Medium | Upload path check used naive `startsWith` (prefix bypass) | **Fixed** |
| Medium | Stripe Checkout `successUrl`/`cancelUrl` open-redirect risk | **Fixed** — host allowlist |
| Medium | Service token compared with `!==` (timing) | **Fixed** — `timingSafeEqual` |
| Medium | JWT verify without explicit `algorithms: ['HS256']` | **Fixed** |
| Medium | `FIELD_ENCRYPTION_KEY` not fail-fast at prod startup | **Fixed** |
| Low–Med | Residual items (below) | Open |

---

## Ranked findings

### H1 — Global cert-expiry trigger available to any user JWT
- **Files:** `apps/api/src/routes/notifications.ts` (`POST /check-expiry`)
- **Impact:** Any logged-in user could run the **global** cert expiry job for all accounts (privilege abuse / noise / resource DoS).
- **Fix shipped:** Production requires `authenticateServiceToken`. Development keeps JWT auth for local debugging.

### H2 — Web BFF collapsed auth rate limits onto the web pod IP
- **Files:** `apps/web/src/app/api/auth/{login,register,forgot-password,reset-password}/route.ts` (pre-fix)
- **Impact:** Browser → Next BFF → Express. BFF did not forward client IP. With `trust proxy`, Express rate-limited the **Next.js server IP**. Effect: (a) one abusive client can burn the shared bucket for all web users, or (b) limits fail to isolate attackers by client.
- **Fix shipped:** `apps/web/src/lib/auth-proxy.ts` forwards `X-Forwarded-For` / `X-Real-IP`; login/register cookies also set `Secure` when request is HTTPS via `X-Forwarded-Proto`.

### M1 — Photo attach without entity ownership (tenancy integrity)
- **Files:** `apps/api/src/services/photos.ts` `createPhoto`
- **Impact:** Authenticated user could attach photos to arbitrary `entityId` values (including other tenants’ UUIDs). Reads still filtered by `user_id`, so classic IDOR read was limited; still a data-integrity / abuse vector.
- **Fix shipped:** Before insert, verify entity exists in the mapped table with `user_id = caller`.

### M2 — Path containment via naive `startsWith`
- **Files:** `apps/api/src/routes/photos.ts`, `documents.ts`, `public.ts`
- **Impact:** Classic prefix bypass pattern (`/uploads/photos_evil/...` matching `/uploads/photos`). Requires a malicious path stored in DB; defense-in-depth still required.
- **Fix shipped:** `apps/api/src/utils/path-safe.ts` `isPathInside()` used at all three serve sites.

### M3 — Stripe Checkout open redirect after payment
- **Files:** `apps/api/src/routes/subscriptions.ts` `POST /checkout`
- **Impact:** Authenticated user could pass arbitrary `successUrl`/`cancelUrl` into Stripe Checkout → post-payment browser redirect to attacker-controlled site (phishing / token-adjacent social engineering). Portal return URL already had a host check.
- **Fix shipped:** `sanitizeCheckoutRedirectUrl()` allowlists localhost, `APP_DOMAIN`, `STRIPE_RETURN_URL` host, and `bossboard.instilligent.com`.

### M4 — Service token equality not constant-time
- **Files:** `apps/api/src/middleware/serviceToken.ts`
- **Impact:** Theoretical timing leak on `FEEDBACK_SERVICE_TOKEN` / `SERVICE_TOKEN` comparison.
- **Fix shipped:** `crypto.timingSafeEqual` on equal-length buffers.

### M5 — JWT algorithm not pinned
- **Files:** `apps/api/src/middleware/auth.ts`, `apps/api/src/services/auth.ts`
- **Impact:** Defense-in-depth against unexpected JWT `alg` handling across library versions.
- **Fix shipped:** Sign/verify with `HS256` only.

### M6 — Production boot without `FIELD_ENCRYPTION_KEY`
- **Files:** `apps/api/src/config/index.ts`
- **Impact:** Production could start with encryption disabled until first write threw; risk of accidental plaintext PII writes if code paths changed.
- **Fix shipped:** Hard fail in production when `FIELD_ENCRYPTION_KEY` unset.

### M7 — API global rate limit 100/15min may be tight; auth 20/15min OK
- **Files:** `apps/api/src/index.ts`
- **Impact:** Availability under normal dashboard use (not auth bypass). Residual — tune if mobile clients hit 429s.
- **Fix:** Not changed (product decision).

### L1 — Middleware allows all `/api/*` without cookie gate
- **Files:** `apps/web/src/middleware.ts`
- **Impact:** BFF routes must each check `getAccessToken()`. Spot-check: protected routes do. Residual: any new unauthenticated BFF route is an easy footgun.
- **Fix:** Residual — consider default-deny helper for new BFF routes.

### L2 — Public invoice share links (capability URLs)
- **Files:** `apps/api/src/routes/public.ts`, `services/invoices.ts` (`crypto.randomBytes(32)`)
- **Impact:** By design, anyone with the 64-hex token can view invoice + linked docs. Token entropy is strong. Residual: no revocation/TTL UI beyond re-share semantics.
- **Fix:** Residual product work.

### L3 — Verification / reset codes are 6-digit numeric
- **Files:** `apps/api/src/services/auth.ts` `crypto.randomInt(100000, 1000000)`
- **Impact:** Mitigated by Redis/memory attempt lockout (5 / 15 min) + auth rate limit. Residual: prefer longer codes or hashed storage long-term.
- **Fix:** Residual.

### L4 — PII emails in operational logs
- **Files:** `apps/api/src/services/auth.ts` (`[VERIFY] Verification email sent to …`)
- **Impact:** Email addresses in Railway logs. Codes themselves only logged when email unconfigured **and** development.
- **Fix:** Residual — strip/hash email in prod logs.

### L5 — CORS allows empty origins in production if misconfigured
- **Files:** `apps/api/src/config/index.ts` (deny-all empty list when unset — good)
- **Impact:** Already fail-closed with warning. Residual: ensure Railway always sets `CORS_ORIGINS`.

### OK (verified, no fix needed this pass)
- Customer / invoice / quote / expense / document CRUD: `user_id` scoping present.
- Document upload: ownership checks for customer/invoice scopes.
- Stripe webhook: raw body + signature; async handling.
- Cookies: `httpOnly`, `sameSite: 'lax'`, `secure` in production (+ HTTPS proto check on login/register).
- `redactSecrets` on DB/error paths.
- Sync batch: `WHERE user_id = EXCLUDED.user_id` on upsert.
- Helmet + HSTS in production; `trust proxy` set.

---

## Fixes shipped (this branch)

| Change | Path(s) |
|--------|---------|
| Path containment helper + tests | `apps/api/src/utils/path-safe.ts`, `__tests__/utils/path-safe.test.ts` |
| Photo/document/public path checks | `routes/photos.ts`, `documents.ts`, `public.ts` |
| Photo entity ownership | `services/photos.ts` + tests |
| Service token timing-safe compare | `middleware/serviceToken.ts` |
| JWT HS256 pin | `middleware/auth.ts`, `services/auth.ts` |
| check-expiry privilege reduction | `routes/notifications.ts` |
| Checkout URL allowlist | `routes/subscriptions.ts` |
| Prod requires FIELD_ENCRYPTION_KEY | `config/index.ts` + tests |
| CORS allow `X-Service-Token` | `index.ts` |
| BFF client IP + Secure cookies | `apps/web/src/lib/auth-proxy.ts`, auth routes |

---

## Residual risks / follow-ups

1. **Per-account login lockout** (beyond IP) for password stuffing with residential proxies.
2. **Refresh token rotation reuse detection** (reuse of revoked refresh → revoke family).
3. **BFF default auth wrapper** so new Next routes cannot forget `getAccessToken`.
4. **Share-token revocation / expiry** for public invoices.
5. **Hash password-reset/verify codes at rest** (currently plaintext columns).
6. **Tune `apiLimiter`** if legitimate clients hit 100/15min.
7. **Confirm Railway has `FIELD_ENCRYPTION_KEY`, `CORS_ORIGINS`, `JWT_*`, `STRIPE_WEBHOOK_SECRET`** before merge to prod.
8. **IAP verify** remains fail-closed without store credentials (documented).

---

## Test evidence

```text
apps/api: jest middleware/auth, services/photos, utils/path-safe,
          routes/notifications, config — 67 passed
```

---

## Deploy notes

- Do **not** force-push production. Merge via PR after CI green.
- Production API **will refuse to start** without `FIELD_ENCRYPTION_KEY` (new). Ensure Railway secret is set (already expected from field-encryption ship).
- Ops: cert-expiry manual trigger now needs service token in production (`FEEDBACK_SERVICE_TOKEN` / `SERVICE_TOKEN`).
- Leave monorepo ESM/CJS alone (out of scope).
