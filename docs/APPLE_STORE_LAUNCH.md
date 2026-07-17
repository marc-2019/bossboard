# BossBoard — Apple App Store launch runbook

**Updated:** 2026-07-18  
**ASC App ID:** `6760329559` (in `apps/mobile/eas.json`)  
**Bundle ID:** `nz.instilligent.bossboard`  
**Team:** `9735SSXD8B` · Apple ID for submit: `marmstrong@instilligent.com`

Public App Store lookup for this bundle still returns **0 results** — not live yet. This runbook finishes code + Console + TestFlight → submit.

---

## Already done in code / infra (2026-07-18)

| Item | Status |
|------|--------|
| Store-compliant dual-rail IAP (iOS = StoreKit only) | Merged to `master` |
| Restore Purchases UI | On subscription screen |
| API `GET /iap/products` + `POST /iap/verify` | On master; fail-closed without secrets |
| Receipt table `store_subscription_receipts` | On prod DB (migration 016) |
| EAS production `EXPO_PUBLIC_IAP_ENABLED=true` | `eas.json` |
| `react-native-iap` Expo plugin | `app.json` |
| ASC app record exists | `ascAppId` filled |

---

## Marc EXTERNAL — App Store Connect (required)

### 1. Subscriptions (auto-renewable, 1 week)

Create products matching API defaults (or set Railway env to match Console):

| Tier | Product ID (default) | Price (display) |
|------|----------------------|-----------------|
| Tradie | `nz.instilligent.bossboard.tradie.weekly` | NZ$4.99/wk |
| Team | `nz.instilligent.bossboard.team.weekly` | NZ$9.99/wk |

Steps: ASC → BossBoard → Subscriptions → Subscription group → add both → localization NZ/EN → submit for review with app.

### 2. Shared secret → Railway

1. ASC → App → App Information → **App-Specific Shared Secret** (or Subscription Key / shared secret).  
2. Railway → `bossboard-api` → set:

```bash
IAP_APPLE_SHARED_SECRET=<secret>
IAP_APPLE_TRADIE_PRODUCT_ID=nz.instilligent.bossboard.tradie.weekly
IAP_APPLE_TEAM_PRODUCT_ID=nz.instilligent.bossboard.team.weekly
```

Without `IAP_APPLE_SHARED_SECRET`, verify returns **503** (fail-closed — correct).

### 3. Small Business Program

Enrol if under US$1M proceeds → 15% commission from day one.

### 4. Listing / review

- Screenshots (see `docs/APP_STORE_SCREENSHOTS.md`)  
- Privacy policy URL (API legal pages)  
- Review notes + demo account  
- Age rating, category, support URL  

---

## Build & TestFlight (Mac / EAS)

From `apps/mobile` on machine with Expo login:

```bash
cd apps/mobile
npx eas-cli whoami
npx eas-cli build --platform ios --profile production
# After build succeeds:
npx eas-cli submit --platform ios --profile production --latest
```

Or internal first:

```bash
npx eas-cli build --platform ios --profile preview
# Install via TestFlight internal / ad-hoc
```

### Sandbox proof (blocks “app launched”)

1. Sandbox Apple ID on device  
2. Log into BossBoard prod → Subscription → Upgrade Tradie/Team  
3. Apple sheet completes → API verify 200 → tier flips  
4. Restore Purchases on second device  

---

## Submit

```bash
npx eas-cli submit --platform ios --profile production --latest
```

Then ASC → add build to version → Submit for Review.

---

## After Apple approval

1. Set scoreboard `app_launched_at` only after **first real (or Marc-counted) IAP paid**.  
2. Flip CF `store-submission-readiness-before-launch` → passing with evidence from `STORE_SUBMISSION_REVERIFY.md`.  
3. Marketing may then claim App Store availability.

---

## API product catalog smoke

```bash
# Authenticated:
curl -sS -H "Authorization: Bearer $JWT" \
  https://api.instilligent.com/api/v1/subscriptions/iap/products
```

Expect product IDs for ios.tradie / ios.team.

---

## Related docs

- `docs/product/native-iap-dual-rail.md`  
- `docs/STORE_SUBMISSION_REVERIFY.md`  
- `docs/LAUNCH_DUAL_TRACK.md`  
- `apps/mobile/STORE_LISTING.md`  
