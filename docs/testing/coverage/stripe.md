# Stripe billing — Spec vs Demo coverage

**Module:** Stripe billing (Module 14)
**Generated:** 2026-05-23 by Phase 3 Agent 13
**Spec source:** `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 14
**Branch:** `feat/e2e-demos-stripe-2026-05-23`

---

## Coverage matrix

| Feature ID | ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-STRIPE-01 (checkout tradie) | 5 | partial (UI smoke + pricing data) | 4/5 (AC1, AC2, AC4 via URL match, AC5) | — | AC3 (Stripe customer dedup) covered by existing `apps/api/src/__tests__/services/stripe.test.ts`; cannot observe from API surface alone. Web UI smoke skips gracefully if `/subscription` page absent. |
| F-STRIPE-02 (checkout team) | 5 | partial (pricing data) | 3/5 (AC1, NZ pricing parity, team-tier price-ID branch) | — | Same caveats as F-STRIPE-01. Mirror tests rather than full duplication. |
| F-STRIPE-03 (webhook handling) | 6 | — (API-only) | 6/6 (missing sig, bad sig, wrong-secret, checkout.completed, sub.updated, sub.deleted, invoice.payment_failed, async 200 ack) | — | Signature helper round-trip test guards the test infra itself. |
| F-STRIPE-04 (subscription sync + Pay Now) | 5 | partial (invalid-token + unknown-token error pages) | 3/5 (metadata key contract, sync ack, delete ack) | — | Positive Pay-Now path requires a real share_token → covered by `apps/api/src/__tests__/routes/public.test.ts`. Driving the Stripe-hosted checkout form is out of scope. |

**Surface coverage:** W (3 tests, partial) · A (~18 tests, full webhook + checkout) · M (intentionally none — see Mobile gap below).

---

## Mobile gap — intentional (documented)

**No Maestro flows.** Reason:

- Mobile triggers checkout via `WebBrowser.openBrowserAsync()` from `expo-web-browser`. This opens the OS browser (or SFSafariViewController on iOS, Chrome Custom Tabs on Android). Maestro cannot drive third-party Stripe-hosted UI.
- Mobile webhook handling does not exist — webhooks are server-to-server, hitting `/webhooks/stripe` on the API. Mobile is a passive observer of the post-webhook `subscription_tier` value via the next `GET /subscriptions/me` poll.
- The mobile subscription screen (`apps/mobile/app/subscription.tsx`) IS testable, but its assertions overlap the web UI demo (NZ pricing copy, upgrade CTA presence); not duplicating saves runtime.

If a future Maestro flow is wanted, the testable surface is:
1. Mobile screen renders BossBoard tier comparison with NZ prices.
2. Tap "Upgrade" → assert WebBrowser intent fires (Maestro can intercept the URL passed to the system browser).
3. Manual seam: a backdoor test API to flip `subscription_tier`, then assert the mobile screen re-renders with the new tier.

---

## Gaps surfaced

1. **Web `/subscription` page may not exist yet.** The Playwright demos skip gracefully if the route 404s. As of v0.5.0, the canonical subscription UX lives in mobile; web has the dashboard but no dedicated subscription page (`find apps/web/src/app -name "*subscription*"` returns only the API proxy route, not a customer-facing page). Tracking gap in the executive report.

2. **Webhook signature secret is sentinel-only in test fixtures.** Helper uses `STRIPE_TEST_WEBHOOK_SECRET` env var if set, otherwise a deterministic sentinel. The API server must be running with this exact value in `STRIPE_WEBHOOK_SECRET` for signature verification to succeed in real-run mode. Document this in DEMO_RUNBOOK.md once Phase 5 lands.

3. **`subscription_tier` DB sync is observed indirectly.** The webhook tests assert the route ACK'd with 200 + `{received: true}`. The actual DB write (the bossboard contract — `users.subscription_tier` flips after a `checkout.session.completed` carrying `metadata.trademate_user_id`) is covered by the existing Jest service suite at `apps/api/src/__tests__/services/stripe.test.ts`. Playwright-level DB introspection would require a backdoor read endpoint; deferred.

4. **`trademate_user_id` metadata key.** Confirmed preserved in all four fixture builders. Tests include explicit assertions that the rename `trademate_user_id` → `bossboard_user_id` would fail the demo suite (defensive guard against silent rename). See `helpers/stripe.ts` header comment + the dedicated assertion in F-STRIPE-04 describe block.

5. **Stripe-hosted checkout form not driven.** Asserting we land on `checkout.stripe.com/c/pay/*` is the contract surface we own; the form behaviour past that point is Stripe's. This is consistent with the spec's "Stripe-hosted page mocked" guidance in the original agent brief.

---

## Existing test coverage cross-check

| File | Covers |
|---|---|
| `apps/api/src/__tests__/routes/stripe-webhook.test.ts` | F-STRIPE-03 (full signature + event routing + async ack) |
| `apps/api/src/__tests__/services/stripe.test.ts` | F-STRIPE-01..04 (createCheckoutSession, ensureStripeCustomer, handleWebhookEvent branches, DB writes) |
| `apps/api/src/__tests__/routes/subscriptions.test.ts` | F-STRIPE-01/02 (route validation, beta mode short-circuit, portal session) |
| `apps/api/src/__tests__/routes/public.test.ts` | F-STRIPE-04 (Pay Now button server-side rendering, share-token resolution) |

Our new demos provide:
- End-to-end Playwright-level verification (signature flow + HTTP roundtrip) that the unit tests cannot.
- A signing helper (`helpers/stripe.ts`) usable by future modules that need to construct Stripe webhook payloads.
- Brand-name guardrails on customer-facing pages with subscription content.
- Explicit `trademate_user_id` contract assertions (negative + positive).

---

## Commands to run this module's demos

```bash
# Prerequisites:
#   - docker-compose up -d (postgres + redis on 29432/29379)
#   - apps/api running on :29000 with STRIPE_WEBHOOK_SECRET matching
#     STRIPE_TEST_WEBHOOK_SECRET in apps/web/e2e/demos/helpers/stripe.ts
#     (or env-overridden)
#   - apps/web running on :3000

# Web demos (headed, watchable)
cd apps/web
npx playwright test e2e/demos/stripe.spec.ts --headed --workers=1

# API demos (signature + event routing)
cd apps/web
npx playwright test e2e/demos/api/stripe.api.spec.ts --workers=1

# Mobile demos
# (none — see "Mobile gap — intentional" above)
```

## Real-services cost note

- **Stripe:** zero. All `https://api.stripe.com/*` traffic is mocked; no real charges, no real customers, no real subscriptions. Webhook fixtures are constructed locally + signed with a test-only HMAC key.
- **Claude / Resend:** N/A for this module.

## Contract-surface checklist (preserved)

- [x] `trademate_user_id` metadata key used in all fixtures (NOT renamed to `bossboard_user_id`)
- [x] NZ pricing values match CLAUDE.md: tradie $4.99/wk → $19.99/mo, team $9.99/wk → $39.99/mo
- [x] Currency is `NZD`
- [x] Webhook event types match the four the server handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [x] Stripe SDK API version `2025-02-24.acacia` (matches `apps/api/src/services/stripe.ts:42`)
