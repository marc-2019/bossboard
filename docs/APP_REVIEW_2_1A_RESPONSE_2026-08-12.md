# App Review reply — Guideline 2.1(a) App Completeness (login network)

**Date:** 2026-08-12  
**App:** BossBoard · ASC `6760329559` · version **1.0**  
**Rejection device:** iPad Air 11-inch (M3) · iPadOS 26.6 · Internet active  
**Issue:** *“The app displayed a network connection issue message when attempting to login.”*  
**Binary on reject:** 0.5.1 **(5)**  
**Resubmit with:** **0.5.1 (11)+** (or at minimum select **build 10+** after login hardening) + this reply  

---

## PROVEN (our side)

| Check | Result |
|-------|--------|
| Production API `https://api.instilligent.com/health` | HTTP 200, DB + Redis connected |
| Demo login `apple-review@instilligent.com` | **LOGIN_OK**, `onboardingCompleted=true` (2026-08-12) |
| Wrong password | HTTP 401 JSON `INVALID_CREDENTIALS` (not a network failure) |
| TLS | Valid LE cert for `*.instilligent.com` |
| Cloudflare proxy | Returns API JSON for mobile User-Agent |

So the server path works. Apple’s message matches our **client-side** RN error path when `fetch` cannot complete (`TypeError: Network request failed` → “network connection…”).

## Root-cause class (INFERRED)

Review device showed **active internet** but the app could not complete HTTPS to the API. Common causes we harden against:

1. **Release binary falling back to `localhost` API** if `EXPO_PUBLIC_API_URL` were missing at bundle time (would always fail on device with a network-style error).  
2. Transient edge/CF reachability from Apple’s network.  
3. Vague error copy that looks like “device offline” even when the host is unreachable.

## Code fixes shipped for resubmit

1. **Never use localhost API in release** — `resolveApiBaseUrl()` forces `https://api.instilligent.com` when not `__DEV__` or when env points at loopback.  
2. **`app.json` `extra.apiUrl`** = production URL as second source.  
3. **Clearer NetworkError** naming the API host (not only “check internet”).  
4. **Login**: trim email, dedicated timeout/retries, map Network/Timeout/Api errors to readable alerts.  
5. **Build number** bumped for store resubmit (**11**).

## Resolution Center reply (paste)

```
Hello App Review Team,

Thank you for the 2.1(a) report (login network error on iPad Air 11" M3 / iPadOS 26.6).

We investigated thoroughly:

1) Production API health is green: https://api.instilligent.com/health
2) Demo account login succeeds against production:
   Email: apple-review@instilligent.com
   Password: (Sign-in required field — same as App Review Information)
   onboardingCompleted = true
3) We hardened the iOS client so release builds cannot target localhost, always use
   https://api.instilligent.com, and surface clearer server-reachability errors.

Please retest login with the demo credentials on the new binary (0.5.1 build 11+).

If any step fails, reply with the on-screen error text and we will address immediately.

Thank you,
Marc Armstrong
Instilligent Limited
marmstrong@instilligent.com
```

## Resubmit checklist

- [ ] Ensure demo user still PASS (run ensure script / API login)  
- [ ] EAS/local **production** iOS build with login fix (build ≥ 11)  
- [ ] ASC: select new build on version 1.0  
- [ ] Paste Resolution Center reply above  
- [ ] Confirm App Review notes + demo fields still filled  
- [ ] **Marc:** Submit / Update for Review  

## Not claimed

We do not claim Apple’s review network was at fault; we claim API + demo work from the public internet and the client no longer mis-points or mis-labels failures.
