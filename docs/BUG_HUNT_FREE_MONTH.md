# Bug hunt — free month for confirmed product errors

**Status:** Process live when feedback is in production  
**Policy:** Marc-confirmed 2026-07-18 — **manual grant after confirmation** (not auto-reward).

## Offer (public copy)

> Found a bug in BossBoard? Tell us in **Send feedback** (web sidebar or app Settings).  
> If we confirm it’s a real product error (not a how-to question or third-party outage),  
> we’ll credit **one free month** of Tradie or Team on your account.  
> One reward per distinct confirmed bug; we may ask for screenshots or steps.

Use on: marketing site FAQ/support blurb, in-app feedback success tip (optional), launch email.

## How customers report

1. Web: sidebar **Send feedback** → category **Something’s broken**.  
2. App: Settings → **Send Feedback** → **Something’s broken**.  
3. Fallback: support@instilligent.com (secondary).

## How Marc / agent grants the free month

### Preferred — Stripe (web-paid customers)

1. Confirm bug in product (repro or clear logs).  
2. Stripe Dashboard → Customers → find user → **create coupon / credit**:  
   - Option A: 100% off next invoice for 1 month (coupon duration once / repeating 1 month).  
   - Option B: Customer balance credit ≈ one month of their plan.  
3. Reply to customer: credit applied; reference feedback id.  
4. Log: feedback id → user id → grant date → Stripe coupon/credit id (no secrets in git).

### App store (IAP) customers

- Prefer **Apple/Google subscription offer codes** when available, or  
- Grant in-app entitlement extension via admin: set `subscription_expires_at` +30 days and note in support log (document in DB comment / CF discovery).  
- Do not promise auto IAP refunds.

### Free-tier reporters who found a bug before paying

- Offer: free first month when they subscribe (Stripe promo code single-use), or account note for later.

## Abuse controls

- Confirm before grant (no auto).  
- One reward per distinct bug (dedupe by title/root cause).  
- Ignore: feature requests, “how do I…”, outages of Apple/Stripe/network.  
- Marc may retire the offer any time.

## Implementation status

| Piece | Status |
|-------|--------|
| Feedback capture (bug category) | PR #55 — merge/deploy required |
| Public copy on marketing | Optional follow-up |
| Stripe coupon template | Create in Dashboard once (`BUGHUNT1MO` or similar) |
| Auto grant | **Out of scope** (abuse risk) |

## Changelog

- 2026-07-18: Manual free-month process defined.
