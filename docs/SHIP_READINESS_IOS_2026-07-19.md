# BossBoard iOS ship readiness (2026-07-19)

**Goal:** App Store production path matches policy + pilot UX — not Debug workarounds.

## Product decisions locked in code

| Area | Production behaviour |
|------|----------------------|
| Detail nav | Header `BackButton` + `safeGoBack` only (no dual body Back on happy path) |
| iOS paid plans | **App Store IAP only** (`startPaidUpgrade` does not open Stripe Checkout on iOS) |
| Android paid plans | Play IAP if enabled; else Stripe PaymentSheet / Checkout |
| Feedback | Settings → Send Feedback + **dismissible Home pilot card** |
| Demo review user | Past onboarding + `is_verified` (force-verified for ASC) |

## API / env (production Railway — verified present)

| Variable | Purpose |
|----------|---------|
| `BETA_MODE=false` | Paid path can activate |
| `IAP_APPLE_SHARED_SECRET` | Receipt verify |
| `IAP_APPLE_TRADIE_PRODUCT_ID` | `nz.instilligent.bossboard.tradie.weekly` |
| `IAP_APPLE_TEAM_PRODUCT_ID` | `nz.instilligent.bossboard.team.weekly` |
| `store_subscription_receipts` table | Migration 016 applied |

EAS production/preview: `EXPO_PUBLIC_IAP_ENABLED=true`, `EXPO_PUBLIC_API_URL=https://api.instilligent.com`.

## Marc / ASC checklist (cannot be code-only)

### 1. App Store Connect — subscriptions

Create **auto-renewable subscriptions** matching server IDs:

- `nz.instilligent.bossboard.tradie.weekly` (Tradie, NZD pricing)
- `nz.instilligent.bossboard.team.weekly` (Team)

Attach to a subscription group, localization, review screenshot, paid apps agreement, tax/banking.

### 2. StoreKit in the binary

- EAS **production** iOS build (not Expo Go / loose Debug without store products)
- Sandbox Apple ID for purchase testing
- Confirm `react-native-iap` purchase → `POST /api/v1/subscriptions/iap/verify` → tier updates

### 3. What reviewers must not see

- Stripe browser Checkout as the **iOS** upgrade path (removed as primary)
- Dual Back buttons on SWMS
- Setup trap / missing onboarding for demo account

### 4. App Review recording

Hybrid Control Center Screen Recording:

1. Home (feedback card optional)
2. SWMS detail → **header Back**
3. Invoices (optional)
4. Settings → Send Feedback (optional)
5. Subscription tiers (do not need a successful paid purchase on camera if sandbox is awkward — show UI)

Score with Nemo Omni `apple_ok` before attach.

### 5. Still open / non-blockers

| Item | Status |
|------|--------|
| Resend suppress for `apple-review@` | Team/API key mismatch; demo is pre-verified |
| Google Play IAP verify | Not wired (`IAP_GOOGLE_NOT_IMPLEMENTED`) — Android later |
| Stripe on web | Keep for website billing |
| Debug Metro device install | Dev only; ship via EAS store build |

## Commands

```bash
# Critical journeys
cd apps/mobile && npm run test:critical-journeys

# Demo ensure
python3 ~/projects/shared/app-review/ensure_app_review_user.py --app bossboard

# Production iOS build (Marc/EAS auth)
cd apps/mobile && npx eas-cli build -p ios --profile production
```

## Submit gate

**Do not Submit for review** until:

1. ASC products live + sandbox purchase succeeds once  
2. Recording `apple_ok`  
3. Explicit Marc yes  
