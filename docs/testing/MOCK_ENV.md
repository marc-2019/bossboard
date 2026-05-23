# Mock External Services — Phase 6a env reference

**Status**: Active (2026-05-23) | **Owner**: e2e demos + spec coverage suite

This document describes the `MOCK_EXTERNAL_SERVICES=true` env flag and the
companion env vars that become stub-tolerated when the mock infrastructure
is enabled.

## What this flag does

When `MOCK_EXTERNAL_SERVICES=true` is set on the API server:

| Service     | What gets mocked                                        | Implementation                              |
|-------------|---------------------------------------------------------|---------------------------------------------|
| Stripe      | `customers.create`, `checkout.sessions.create`, `billingPortal.sessions.create`, `webhooks.constructEvent` | `apps/api/src/services/mocks/stripe-mock.ts` |
| Resend      | `emails.send` (captured in-memory; never leaves process) | `apps/api/src/services/mocks/resend-mock.ts` |
| Anthropic   | `messages.create` (canned NZ-realistic SWMS responses)   | `apps/api/src/services/mocks/claude-mock.ts` |

The mock is installed at SDK-init time inside each of `services/stripe.ts`,
`services/email.ts`, `services/claude.ts`. The guard is a single
`process.env.MOCK_EXTERNAL_SERVICES === 'true'` check — default behaviour
(unset or `false`) is byte-identical to the pre-Phase-6a code path.

## How to enable it

The mocks live behind a TIER A env file (`.env*`). Marc adds these lines
to `.env` (or `.env.local`) on the machine running the API server when
e2e demos need to run without external service calls:

```bash
# Phase 6a mock infrastructure — set to 'true' to mock Stripe/Resend/Anthropic.
# Leave unset / 'false' for normal operation against real services.
MOCK_EXTERNAL_SERVICES=true
```

The flag is read at server start; restart the API server after toggling.

## Companion env vars (stub-tolerated when mocks are on)

When `MOCK_EXTERNAL_SERVICES=true`, the API server does NOT need real
credentials for any of these. The mock implementations short-circuit
before any HTTP call would be made. Setting them to any non-empty stub
string (or leaving them unset) is fine — the SDKs are instantiated only
so the mock can attach its monkey-patches.

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
  `getResend()` when `MOCK_EXTERNAL_SERVICES=true` and the env var is
  unset — `isEmailConfigured()` returns `true` in that case so the email
  flows still exercise their full code path.
- `ANTHROPIC_API_KEY` is auto-substituted similarly. Setting
  `USE_LOCAL_LLM=true` is silently overridden by mock-mode — the Anthropic
  SDK path is forced so the mock can attach.

## Example `.env` snippet for e2e demo runs

Marc to paste into `.env` when running e2e demos locally (TIER A —
Claude cannot edit `.env*` files):

```bash
# Phase 6a mock-mode block. Comment out to revert to real services.
MOCK_EXTERNAL_SERVICES=true
STRIPE_SECRET_KEY=sk_test_mock_phase6a
STRIPE_WEBHOOK_SECRET=whsec_mock_phase6a
STRIPE_PRICE_ID_TRADIE=price_mock_tradie
STRIPE_PRICE_ID_TEAM=price_mock_team
RESEND_API_KEY=re_mock_phase6a
ANTHROPIC_API_KEY=sk-ant-mock-phase6a
```

## Verifying mocks are active

On API server start with `MOCK_EXTERNAL_SERVICES=true`, the logs include:

```
[Stripe] MOCK_EXTERNAL_SERVICES=true — Stripe SDK mocked
[Email] MOCK_EXTERNAL_SERVICES=true — Resend SDK mocked
[AI] MOCK_EXTERNAL_SERVICES=true — Anthropic SDK mocked
```

(The first two only log on first SDK use — they're lazy-init. The
Anthropic line logs at module load.)

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
