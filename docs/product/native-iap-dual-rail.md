# Native IAP dual-rail (BossBoard store launch)

**Status**: implemented on mobile + API  
**Why**: App Store Guideline 3.1.1 (NZ storefront) and Google Play Billing require in-app purchase for digital subscriptions sold inside the app. Stripe Checkout / PaymentSheet opened from the mobile binary is a store reject.

## Rails

| Surface | Purchase path | Entitlement write |
|---|---|---|
| **iOS / Android app** | StoreKit / Play Billing via `react-native-iap` → `POST /api/v1/subscriptions/iap/verify` | `users.subscription_tier` + `store_subscription_receipts` |
| **Web** | Stripe Checkout / PaymentSheet → webhooks | `users.subscription_tier` + Stripe ids |

Cross-honour: a web-paid user signs into the app and gets paid features (multiplatform 3.1.3(b)). A store-paid user gets the same tier field. In-app CTAs on native **must not** link to web checkout.

## Mobile behaviour (`apps/mobile/src/services/payments.ts`)

- `startPaidUpgrade` on `ios` / `android` → **IAP only** (no Stripe fallback).
- `startPaidUpgrade` on web → PaymentSheet then Checkout.
- `restoreStorePurchases` — App Store / Play requirement; wires available purchases through the same verify endpoint.
- Kill-switch: `EXPO_PUBLIC_IAP_ENABLED=false` (dev only). Default is **on** for native.

## API

- `GET /api/v1/subscriptions/iap/products` — product id catalog (auth required).
- `POST /api/v1/subscriptions/iap/verify` — body `{ platform, productId, transactionId, receiptOrToken }`.
- Fail-closed without credentials:
  - Apple: `IAP_APPLE_SHARED_SECRET`
  - Google: `IAP_GOOGLE_SERVICE_ACCOUNT_JSON` (raw JSON or base64 JSON)
- Google path uses Android Publisher `purchases.subscriptions.get` with a service-account JWT (no `googleapis` package dep).

## Env (production)

```bash
# Product IDs — must match App Store Connect / Play Console
IAP_APPLE_TRADIE_PRODUCT_ID=nz.instilligent.bossboard.tradie.weekly
IAP_APPLE_TEAM_PRODUCT_ID=nz.instilligent.bossboard.team.weekly
IAP_GOOGLE_TRADIE_PRODUCT_ID=bossboard_tradie_weekly
IAP_GOOGLE_TEAM_PRODUCT_ID=bossboard_team_weekly
IAP_GOOGLE_PACKAGE_NAME=nz.instilligent.bossboard

# Secrets (Railway / vault — never commit)
IAP_APPLE_SHARED_SECRET=...
IAP_GOOGLE_SERVICE_ACCOUNT_JSON=...   # or base64 of the JSON key file

# Paid mode (when leaving launch free period)
BETA_MODE=false
```

## Marc EXTERNAL before launch

1. **App Store Connect** — create auto-renewable subs (1 week) for Tradie/Team; shared secret → `IAP_APPLE_SHARED_SECRET`. Enrol Small Business Program (15%).
2. **Play Console** — create subscription products + base plans; link service account with Android Publisher → `IAP_GOOGLE_SERVICE_ACCOUNT_JSON`.
3. **Store listing** — privacy, data safety, subscription disclosure copy.
4. **Test** — Sandbox Apple ID + Play license testers on internal tracks; restore purchases on a second device.
5. Flip `BETA_MODE=false` only after verify returns 200 for a real sandbox purchase on both platforms.

## Related

- Decision memo: `docs/product/ios-payments-strategy-2026-07-08.md` (on `docs/ios-payments-memo` branch if not merged)
- Migration: `database/migrations/016_store_iap_receipts.sql`
