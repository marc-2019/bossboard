# BB SaaS — free month + friend referral

**Status:** Product locked (Marc 2026-08-08). Implementation pending after client-invoice discount ships.  
**Not** the same as client-invoice discounts (tradie → their customer).

## Offer (public)

> Give a mate a free month of BossBoard — when they pay, you both get a free month.

## Rules (locked)

| Rule | Decision |
|------|----------|
| Reward unit | **1 free month** of Tradie or Team (their plan) |
| Friend link | **Both** referrer and referee get 1 free month |
| Stacking | Free months **stack**, hard cap **12 months** (1 year) of free credit on an account |
| When it counts | On **paid activation** of the referee (not signup alone) |
| Who can refer | **Any paid** BB user |
| Self-referral | Blocked |
| One redeem | Each referee account can redeem at most one referral |

## Implementation sketch (next agent sprint)

1. **Schema**
   - `referral_codes` (user_id, code unique, created_at)
   - `referral_redemptions` (code_id, referee_user_id unique, status pending|activated|void, activated_at)
   - `subscription_free_months_balance` on users (int, 0–12) or grant ledger table

2. **Grant path**
   - Web Stripe: coupon / subscription schedule skip / customer balance ≈ one month of plan; prefer durable balance so stack works.
   - IAP: extend `subscription_expires_at` or store offer codes; dual-rail documented.

3. **API / UI**
   - Paid user: Settings → “Invite a mate” → copy link (`/r/{code}` or checkout `?ref=`)
   - Referee: signup/checkout captures code; on first successful paid activation, grant both sides +1 month (capped at 12).
   - Display remaining free months on billing page.

4. **Abuse**
   - Referrer must be paid at grant time.
   - No self (same email / stripe customer / device fingerprint soft checks).
   - Cap stack at 12; log grants for support.

5. **Copy alignment**
   - Product positioning already says: *“Give a mate a free month, get a free month”*.

## Related

- Bug-hunt free month (manual): `docs/BUG_HUNT_FREE_MONTH.md` — stays manual, can use same grant ledger later.
- Client invoice discount: migration `018_invoice_discount.sql` + create/edit UI (separate track).
