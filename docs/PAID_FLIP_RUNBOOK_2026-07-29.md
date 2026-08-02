# BossBoard paid flip runbook (E1 / E2)

**Purpose:** Make Marc’s EXTERNAL actions boring and safe.  
**Date:** 2026-07-29  
**Related:** `LAUNCH_PROGRESS_NOW.md`, `LAUNCH_DUAL_TRACK.md`, ops-loop open_externals.

## What “done” means

| Step | Owner | Done when |
|------|--------|-----------|
| **E1** BETA off | Agent verify / was Marc | Railway API env `BETA_MODE=false` (exact string) redeployed; health 200 — **DONE 2026-07-29** |
| **E2** First **customer** paid | **GTM / MARKET→SELL** | A real customer (or trial→paid stranger) completes Tradie Stripe; not a test-mode ghost. **Not** “Marc must charge himself” as standing EXTERNAL (Marc 2026-08-02). |
| Evidence | Agent | `web_launched_at` set in progress docs + launch evidence id (no secrets in git) |

**Optional rail smoke:** Marc may self-checkout once to prove rails; label as smoke, not first customer / not vision complete.

Agent **cannot** force a customer to buy. Agent **can** run GTM (publish, CTA, channel) and stamp after evidence. This runbook is pre-flight + stamp procedure.

---

## Pre-flight checklist (agent can re-run anytime)

### A. Live Gate0 (already green as of 2026-07-29)

```bash
curl -sf https://api.instilligent.com/health | jq .
curl -sf -o /dev/null -w '%{http_code}\n' https://bossboard.instilligent.com/
curl -sf -o /dev/null -w '%{http_code}\n' https://bossboard.instilligent.com/legal/privacy
curl -sf -o /dev/null -w '%{http_code}\n' https://bossboard.instilligent.com/legal/terms
```

Expect: API 200 with db+redis; marketing 200; legal 200/307→200.

### B. Stripe / Railway (Marc dashboard — verify before flip)

In **Railway → bossboard-api** (production):

| Variable | Must be |
|----------|---------|
| `BETA_MODE` | Currently free-beta default; set to **`false`** only when ready to charge |
| `STRIPE_SECRET_KEY` | **Live** key (`sk_live_…`), not test |
| `STRIPE_PUBLISHABLE_KEY` / frontend publishable | **Live** (`pk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Matches production webhook endpoint |
| `STRIPE_RETURN_URL` / success URL | **Non-localhost** public BossBoard URL |
| Price / product IDs | Match live Stripe products for Tradie sub |

**Boot fails closed** if Stripe is incomplete when `BETA_MODE=false` — that is intentional.

In **Stripe Dashboard**:

1. Webhook endpoint points at production API (events: subscription + invoice as configured in code).
2. At least one live Price for the Tradie plan you intend to sell.
3. Test-mode charges do **not** count for E2.

### C. Marketing claims (no flip-day surprises)

- Register CTA is free-beta language today; after flip, UI should reflect paid plan honestly.
- Do not claim “WorkSafe approved” / pass guarantees.
- Compare/Tradify public page: **parked** per Marc 2026-07-27 — do not unpark on flip day.

---

## Flip day procedure (Marc — ~15 minutes)

### 1. Confirm you want to charge real money

This is the DECIDE. If not ready, leave `BETA_MODE` alone.

### 2. Stripe live check (5 min)

- [ ] Live mode (toggle not “Test”)
- [ ] Products/prices correct (NZD as intended)
- [ ] Webhook recent deliveries green (or ready for first event)
- [ ] Your card ready for **one real Tradie sub** (can cancel after evidence if needed — still a real charge)

### 3. Railway env flip (3 min)

1. Set `BETA_MODE=false` on **bossboard-api** production.
2. Confirm live Stripe vars (table above).
3. Redeploy API only (web can stay).
4. Wait for health:

```bash
curl -sf https://api.instilligent.com/health | jq .
```

If health fails: **set `BETA_MODE` back** or fix Stripe vars — do not leave half-dead API.

### 4. Smoke paid path (5 min)

1. Open `https://bossboard.instilligent.com/register` (or login).
2. Complete checkout for Tradie plan with **real card**.
3. Confirm:
   - Stripe Dashboard shows **Paid** / active subscription
   - App reflects paid entitlements (not free-beta forever)
   - Webhook processed (no endless “pending”)

### 5. Stamp evidence (agent or Marc)

Update `LAUNCH_PROGRESS_NOW.md`:

- `web_launched_at` = ISO date of first paid charge  
- Evidence: Stripe payment intent / sub id **last 4 only** or internal evidence file path — **never** full secrets  
- Note Railway deploy id if useful  

Ops-loop: paid KR line should flip off pure EXTERNAL once evidence exists.

---

## Abort / rollback

| Symptom | Action |
|---------|--------|
| API won’t boot after flip | Restore previous `BETA_MODE` or fix Stripe env; redeploy |
| Checkout errors | Stay in live mode; fix price IDs / return URL; do not flip marketing copy yet |
| Accidental test-mode “paid” | Does **not** count for E2 — repeat in live |

---

## After first paid (optional same week)

1. Lawyer pack (E3) — send Dougal brief when ready (parallel, not blocking soft launch).  
2. Turnstile (E4) — create Cloudflare site keys; agent wires widget.  
3. GA4 service account at `/keys/ga4-service-account.json` if engagement strip wanted.  
4. App / IAP track remains independent (`app_launched_at`).

---

## Agent follow-ups (not Marc)

- Keep Gate0 probes green daily via ops-loop.  
- Do not invent Marc cards for “should we flip?” — one EXTERNAL until he chooses.  
- Content: keep publishing product posts (funnel) while waiting — does not require BETA off.

## Change log

| Date | Note |
|------|------|
| 2026-07-29 | Runbook created (Grok ops close-out session). |
