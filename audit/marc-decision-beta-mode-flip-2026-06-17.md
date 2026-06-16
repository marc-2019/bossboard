# Marc-decision: flip BossBoard `BETA_MODE=false` to start charging?

**Date:** 2026-06-17
**Status:** AWAITING MARC — not actioned. This is a business + money-charging
call, not an autonomous change. The flag was **not** flipped.
**Pairs with:** live-Stripe activation task (concluded "no code changes required").

---

## The decision (yours to make)

Two coupled questions, both Marc's call:

1. **Does the beta become paid?** (yes / not yet)
2. **When?** (now / at a user-count milestone / a fixed date)

Flipping `BETA_MODE=false` on Railway is the single switch that turns on real
Stripe checkout → first paid conversions. Everyone currently gets tradie-tier
features for free; after the flip, the free tier's limits (3 invoices/mo, 2
SWMS/mo, no quotes/expenses/jobs/photos/PDF/email) bite, and the upgrade CTA
routes to live Stripe checkout.

The original trigger in CLAUDE.md was **"~50 beta users."** I could not confirm
the current production user count or the live Railway `BETA_MODE` value from the
repo — those are the two inputs you'd want in hand before deciding (the BB
prod user-count probe task feeds the first).

---

## Technical readiness — what I verified (code is ready)

| Check | State | Evidence |
|---|---|---|
| `BETA_MODE` wiring | ✅ Safe default | `subscriptions.ts:65` — `process.env.BETA_MODE !== 'false'`; only the exact string `false` flips it. Defaults to beta-on. |
| Boot-time safety guard | ✅ Fail-fast | `config/index.ts:87-98` — in prod with `BETA_MODE=false`, the API **refuses to start** unless `STRIPE_RETURN_URL` (non-localhost), `STRIPE_SECRET_KEY`, and `STRIPE_PRICE_ID_TRADIE` are all set. A misconfigured flip dies at boot, not at a customer's checkout. |
| Webhook + signature verify | ✅ | `stripe-webhook.ts:35` `constructWebhookEvent` verifies the Stripe signature against `STRIPE_WEBHOOK_SECRET`; rejects missing/invalid sigs (400). |
| Webhook event coverage | ✅ | `stripe.ts` handles `checkout.session.completed` (activate), `customer.subscription.updated` (plan change), `customer.subscription.deleted` (downgrade to free), `invoice.payment_failed`, `payment_intent.succeeded`. |
| Metadata dual-read (brand rename) | ✅ | writes `bossboard_user_id` (`stripe.ts:102`); webhook falls back to legacy `trademate_user_id` so pre-rename Stripe objects still resolve. Covered by tests. |
| Flip reversibility | ✅ low-risk | `isBetaMode()` reads env per-call. Flipping back to `true` (or any non-`false` value) re-enables beta on the next process restart. Both flip and rollback are a Railway env change + redeploy. |

---

## Gaps to weigh before flipping (not blockers, but real)

1. **No `/health/stripe` preflight endpoint.** The boot-guard checks that the
   Stripe vars are *present*, not that the live key is `livemode` or that the
   configured price IDs actually exist with the right NZD amounts. A typo'd
   `STRIPE_PRICE_ID_TRADIE` would pass boot and only fail at the first real
   checkout. The earlier payment-gate brief proposed this endpoint; it did **not**
   land. Cheap to add and worth adding before charging real cards.
2. **End-to-end payment journey not proven green.** No single committed test
   chains register → onboarding → invoice → Pay-Now → checkout → webhook →
   tier-flip → paid-feature-access. The e2e rework is partial ("quotes pilot",
   `1fa4b74`). You are flipping into a path no automated test fully exercises.
3. **Live vs test keys.** Confirm Railway holds `sk_live_*` (not `sk_test_*`),
   a live webhook secret, and a non-localhost `STRIPE_RETURN_URL` before the flip
   — otherwise the boot-guard either blocks (good) or you charge against test mode
   (silent revenue loss).

---

## The flip itself (for when you decide "yes")

One Railway env change on the API service, then redeploy:

```
BETA_MODE=false      # currently unset/true → beta on
```

Preconditions the boot-guard enforces (API won't start otherwise):
`STRIPE_SECRET_KEY` (live), `STRIPE_PRICE_ID_TRADIE`, `STRIPE_RETURN_URL`
(non-localhost). Also set `STRIPE_WEBHOOK_SECRET` (warned, not enforced) and the
live webhook endpoint in the Stripe dashboard → `/webhooks/stripe`.

**Rollback:** set `BETA_MODE=true` (or unset) and redeploy. Already-charged
customers keep their paid tier; the gate simply re-opens for everyone.

---

## My recommendation

Hold the flip until (a) the live user count justifies it against your ~50-user
trigger, and (b) the two cheap hardening items — `/health/stripe` preflight and
one green end-to-end payment test — are in. The code path is sound; the missing
piece is *proof* it works against live credentials before a real customer is the
one who discovers a misconfig. None of that is a code blocker to the decision —
it's risk you're choosing to accept or close first.

**No action taken. Awaiting your call on yes/no + timing.**
