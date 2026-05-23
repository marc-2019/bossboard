# Mock External Services — Phase 6a env reference

**Status**: Active (2026-05-23) | **Owner**: e2e demos + spec coverage suite

This document describes the per-service mock env flags (`MOCK_STRIPE`,
`MOCK_RESEND`, `MOCK_CLAUDE`) plus the legacy master-switch
`MOCK_EXTERNAL_SERVICES`, and the companion env vars that become
stub-tolerated when the mock infrastructure is enabled.

## Quickstart (Marc's path)

```bash
cp apps/api/.env.template apps/api/.env
# Edit apps/api/.env:
#   - Paste a real Stripe test key (sk_test_…) into STRIPE_SECRET_KEY
#   - Optionally paste a real Claude key, then flip MOCK_CLAUDE=false
#   - Leave MOCK_RESEND=true (no Resend key needed)
npm run demo:all
```

The template ships with `MOCK_STRIPE=false`, `MOCK_CLAUDE=true`,
`MOCK_RESEND=true` — so demos run against the real Stripe test environment
while Resend and (optionally) Claude stay mocked. Flip individual flags
per service as your local keys come online.

## What these flags do

Each flag is read independently at SDK-init time. The legacy
`MOCK_EXTERNAL_SERVICES=true` master switch still works and turns on all
three (back-compat for existing scripts):

| Per-service flag | Master-switch alias       | What gets mocked                                        | Implementation                              |
|------------------|---------------------------|---------------------------------------------------------|---------------------------------------------|
| `MOCK_STRIPE`    | `MOCK_EXTERNAL_SERVICES`  | `customers.create`, `checkout.sessions.create`, `billingPortal.sessions.create`, `webhooks.constructEvent` | `apps/api/src/services/mocks/stripe-mock.ts` |
| `MOCK_RESEND`    | `MOCK_EXTERNAL_SERVICES`  | `emails.send` (captured in-memory; never leaves process) | `apps/api/src/services/mocks/resend-mock.ts` |
| `MOCK_CLAUDE`    | `MOCK_EXTERNAL_SERVICES`  | `messages.create` (canned NZ-realistic SWMS responses)   | `apps/api/src/services/mocks/claude-mock.ts` |

The mock is installed at SDK-init time inside each of `services/stripe.ts`,
`services/email.ts`, `services/claude.ts`. Each guard evaluates
`process.env.MOCK_<SERVICE> === 'true' || process.env.MOCK_EXTERNAL_SERVICES === 'true'`
— default behaviour (all unset or `false`) is byte-identical to the
pre-Phase-6a code path.

## How to enable it

The mocks live behind a TIER A env file (`.env*`). Marc edits `.env`
(or `.env.local`) on the machine running the API server.

**Recommended (per-service):**

```bash
# Phase 6a per-service mock flags — turn each on/off independently.
MOCK_STRIPE=false   # set true to mock Stripe (no api.stripe.com calls)
MOCK_RESEND=true    # set true to mock Resend (in-memory outbox)
MOCK_CLAUDE=true    # set true to mock Anthropic (canned SWMS responses)
```

**Legacy master-switch (still supported):**

```bash
# Turns on all three mocks at once (back-compat).
MOCK_EXTERNAL_SERVICES=true
```

Flags are read at server start; restart the API server after toggling.

## Companion env vars (stub-tolerated when mocks are on)

When the corresponding mock flag is `true` (e.g. `MOCK_STRIPE=true`, or
the master-switch `MOCK_EXTERNAL_SERVICES=true`), the API server does NOT
need real credentials for that service. The mock implementations
short-circuit before any HTTP call would be made. Setting the keys to any
non-empty stub string (or leaving them unset) is fine — the SDKs are
instantiated only so the mock can attach its monkey-patches.

| Env var                       | Real-service usage              | Mock-mode stub value (any)         |
|-------------------------------|---------------------------------|------------------------------------|
| `STRIPE_SECRET_KEY`           | Test/live Stripe API key        | `sk_test_mock_phase6a`             |
| `STRIPE_WEBHOOK_SECRET`       | Webhook signature verification  | `whsec_mock_phase6a`               |
| `STRIPE_PRICE_ID_TRADIE`      | Tradie tier price ID            | `price_mock_tradie`                |
| `STRIPE_PRICE_ID_TEAM`        | Team tier price ID              | `price_mock_team`                  |
| `RESEND_API_KEY`              | Resend HTTP API key             | `re_mock_phase6a` (or unset)       |
| `ANTHROPIC_API_KEY`           | Claude API key                  | `sk-ant-mock-phase6a` (or unset)   |

Notes:
- `STRIPE_SECRET_KEY` must still be set to something non-empty if you want
  `getStripe()` to lazy-init the Stripe client (the existing `if
  (!config.stripe.secretKey)` guard still fires). Use the stub above.
- `RESEND_API_KEY` is automatically substituted with a stub key by
  `getResend()` when `MOCK_RESEND=true` (or `MOCK_EXTERNAL_SERVICES=true`)
  and the env var is unset — `isEmailConfigured()` returns `true` in that
  case so the email flows still exercise their full code path.
- `ANTHROPIC_API_KEY` is auto-substituted similarly when `MOCK_CLAUDE=true`
  (or `MOCK_EXTERNAL_SERVICES=true`). Setting `USE_LOCAL_LLM=true` is
  silently overridden by mock-mode — the Anthropic SDK path is forced so
  the mock can attach.

## Example `.env` snippet for e2e demo runs

Easiest path: `cp apps/api/.env.template apps/api/.env` and edit (see
Quickstart above). For reference, equivalent inline:

**All-mocked (zero real keys):**

```bash
MOCK_STRIPE=true
MOCK_RESEND=true
MOCK_CLAUDE=true
STRIPE_SECRET_KEY=sk_test_mock_phase6a
STRIPE_WEBHOOK_SECRET=whsec_mock_phase6a
STRIPE_PRICE_ID_TRADIE=price_mock_tradie
STRIPE_PRICE_ID_TEAM=price_mock_team
RESEND_API_KEY=re_mock_phase6a
ANTHROPIC_API_KEY=sk-ant-mock-phase6a
```

**Marc's path — real Stripe test mode, Resend mocked, Claude flexible:**

```bash
MOCK_STRIPE=false
STRIPE_SECRET_KEY=sk_test_<real-key-from-dashboard>
STRIPE_WEBHOOK_SECRET=whsec_<real-webhook-secret>
STRIPE_PRICE_ID_TRADIE=price_<real-id>
STRIPE_PRICE_ID_TEAM=price_<real-id>
MOCK_RESEND=true
RESEND_API_KEY=re_mock_no_key
MOCK_CLAUDE=true   # flip to false + paste real key once Claude key is in hand
ANTHROPIC_API_KEY=sk-ant-PASTE_YOUR_KEY_HERE
```

**Legacy master-switch (back-compat):**

```bash
MOCK_EXTERNAL_SERVICES=true
STRIPE_SECRET_KEY=sk_test_mock_phase6a
# … (same stubs as the all-mocked block above)
```

## Verifying mocks are active

On API server start with the relevant flag(s) on, the logs include:

```
[Stripe] MOCK_STRIPE=true — Stripe SDK mocked
[Email] MOCK_RESEND=true — Resend SDK mocked
[AI] MOCK_CLAUDE=true — Anthropic SDK mocked
```

(The first two only log on first SDK use — they're lazy-init. The
Anthropic line logs at module load. The legacy `MOCK_EXTERNAL_SERVICES`
master switch produces the same log lines.)

## Capturing emails in tests

When the Resend mock is active, sent emails are captured in an in-memory
outbox. Tests can inspect it via:

```typescript
import { getCapturedEmails, clearCapturedEmails }
  from '../../services/mocks/resend-mock';

clearCapturedEmails();
// ... run flow that sends a verification email ...
const emails = getCapturedEmails();
expect(emails).toHaveLength(1);
expect(emails[0].subject).toMatch(/Verify Your Email/);
```

For e2e tests that run against a separate API server process, the
outbox is per-process; tests should either:
1. Read verification codes from the DB directly (`users.verification_code`),
   or
2. Add a debug-only `/test/captured-emails` route (out of scope for Phase 6a).

## Browser-side route mocks

For the small subset of flows that contact external services from the
browser (Stripe Checkout redirect, defence-in-depth for any future
direct-from-browser Resend/Anthropic call), Playwright `page.route()`
helpers live in:

```
apps/web/e2e/demos/helpers/mocks/
├── stripe.ts   — installStripeBrowserMocks(page)
├── resend.ts   — installResendBrowserMocks(page)
└── claude.ts   — installClaudeBrowserMocks(page)
```

These are independent of the server-side `MOCK_EXTERNAL_SERVICES` flag —
they operate at the Playwright-page network layer.

## When NOT to use mocks

- Stripe live-mode flips and the production webhook verification path
  (covered by manual smoke-tests against the live API).
- Resend deliverability / DMARC checks.
- Claude model migrations (need real API to verify response shape).

## See also

- `apps/api/src/services/mocks/*-mock.ts` — implementation
- `apps/web/e2e/demos/helpers/mocks/*.ts` — browser-side
- `apps/web/e2e/demos/helpers/stripe.ts` — Stripe webhook fixture builders
  (unchanged; runs against the real signing path inside the mock-bypass
  `webhooks.constructEvent`).
