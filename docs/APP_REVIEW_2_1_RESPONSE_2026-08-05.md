# BossBoard App Review — 2.1.0 (2026-08-05 detail)

**ASC**: `6760329559` · **Sub**: `db6c8996-bb1a-418b-a2b5-4669cb9da497`  
**Binary on rejection**: 0.5.1 (5) · **Guideline**: **2.1.0 App Completeness only**  
**R-ASC-1**: Plan from submission details, not banners alone.

## PROVEN

- Demo ensure PASS (apple-review@instilligent.com)
- Legal URLs 200
- Aug 3 recording QC: **WEAK_DO_NOT_ATTACH** (login stuck / ApiError) — do not reuse
- Purpose strings strengthened 2026-08-05 for clarity (examples)

## Close path

1. Demo ensure PASS same day  
2. ASC Notes + Sign-in fields  
3. **New** physical Screen Recording: login → home → SWMS → invoices → subscription → delete (`https://api.instilligent.com/legal/delete-account`)  
4. Vision QC PASS before attach  
5. Messages reply: demo ready + recording attached  
6. Marc Resubmit / Update Review  

## Notes (paste)

```
BossBoard — App Review Information (2.1.0 completeness 2026-08-05)

PURPOSE
BossBoard is an all-in-one mobile business app for New Zealand tradies
(builders, electricians, plumbers, small crews): SWMS/compliance, invoices,
jobs, expenses, team seats.

DEMO
Email: apple-review@instilligent.com
Password: [from .secrets/bb_app_review.env]
Sign-in required: Yes
API: https://api.instilligent.com

HOW TO REVIEW
1. Launch → Log In with demo credentials (must reach Home).
2. Home → New SWMS → trade → short description → Generate → open document.
3. Invoices → list / open.
4. Settings → Subscription → Free / Tradie / Team; Restore Purchases available.
   iOS paid unlock uses Apple IAP (StoreKit). Stripe is web-only.
5. Account deletion: https://api.instilligent.com/legal/delete-account
   (or in-app Settings link to that page).

SCREEN RECORDING
Physical-device recording attached: cold launch → successful login → Home →
SWMS → Invoices → Subscription → delete-account URL. No Desk View.

EXTERNAL
- API api.instilligent.com
- Apple IAP for iOS paid tiers
- Stripe web-only (not primary iOS unlock)
- Sentry, Resend, Railway

CONTACT
Marc Armstrong · marmstrong@instilligent.com
```
