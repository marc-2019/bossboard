# BossBoard Public Invoice Payment Gateway Partners

## Problem Statement
BossBoard currently allows tradies to create and send invoices to their clients via a shareable link (public invoice view). The public invoice page (served from `/api/v1/public/invoices/:token`) displays invoice details but lacks a "Pay Now" button enabling clients to pay instantly. Today, the only payment integration in BossBoard is for subscription billing (tradie/team tiers) via Stripe in `services/stripe.ts`. There is no payment rail for the tradie's own customers paying their invoices.

Adding a one-tap payment option on the public invoice page would:
- Reduce friction for clients paying invoices
- Improve cashflow for tradies (faster payments)
- Increase perceived value of BossBoard as a complete invoicing solution
- Potentially enable automatic reconciliation when paired with webhook updates

## Candidate Gateways

### 1. Stripe Payment Links
Leverage existing Stripe integration. Create a one-time payment link for each invoice amount.
- **Pros**: Already have Stripe SDK/config, familiar API, global coverage, instant payment links
- **Cons**: Fees may be higher than local NZ options, requires client to leave BossBoard domain (stripe.com)

### 2. Windcave (formerly Payment Express)
Dominant NZ payment gateway for SMBs, supports major credit cards, Apple Pay, Google Pay.
- **Pros**: NZ-based, strong bank relationships, competitive pricing, local settlement
- **Cons**: Requires new integration, separate from current Stripe setup

### 3. Worldline NZ (formerly Paymark)
Another major NZ payment processor, widely used in retail and e-commerce.
- **Pros**: Established NZ presence, supports all major payment methods
- **Cons**: May require more complex integration, pricing less transparent for SMBs

### 4. Paystation
Popular NZ payment gateway focused on simplicity and transparent pricing.
- **Pros**: Simple API, clear pricing, NZ support, good for SMBs
- **Cons**: Smaller market share than Windcave/Worldline

### 5. Akahu (Open Banking - Pay by Bank)
Enables direct bank-to-bank payments via account-to-account transfers.
- **Pros**: Lower fees (typically flat fee vs percentage), no card networks, instant settlement
- **Cons**: Requires customer to use bank app/login, adoption still growing in NZ

### 6. Afterpay / Laybuy (BNPL - Buy Now Pay Later)
Allow customers to pay in installments, merchant gets paid upfront.
- **Pros**: Can increase conversion for higher-value invoices, absorbs credit risk
- **Cons**: Higher fees for merchant (typically 4-6%+), adds complexity, may not suit all trades

## Comparison Matrix

| Gateway | NZ Availability | Fees per $100 Invoice | Settlement Time | Mobile UX | Dev Effort | Surcharge Model |
|---------|-----------------|----------------------|-----------------|-----------|------------|-----------------|
| Stripe Payment Links | Available | ~$2.90 + 30¢ (2.9% + 30c) | 2 business days | Good (Stripe hosted) | Low (reuse existing) | No (must absorb) |
| Windcave | Available | ~$2.50 + 30¢ (2.5% + 30c) | Next business day | Good (embedded/redirect) | Medium | Yes (allowed) |
| Worldline NZ | Available | ~$2.20 + 30¢ (2.2% + 30c) | 1-2 business days | Good | Medium | Yes |
| Paystation | Available | ~$2.00 + 25¢ (2.0% + 25c) | Next business day | Good | Medium | Yes |
| Akahu Pay-by-Bank | Available | $0.30 - $0.50 flat | Near real-time | Good (bank app redirect) | Medium-High | No (bank transfer) |
| Afterpay/Laybuy | Available | 4.0% - 6.0% + $0.30 | Next business day | Good (BNPL flow) | Medium | No (merchant fee) |

*Note: Fees are indicative based on public NZ SMB pricing as of 2026; actual rates depend on volume and negotiation.*

## Recommendation
**Phase 1: Start with Stripe Payment Links** to leverage existing infrastructure and validate demand quickly. This minimizes initial development effort while providing a functional payment option.

**Phase 2: Add Windcave** as a lower-cost, NZ-preferred alternative for tradies who want to avoid Stripe's higher fees or prefer local provider.

**Phase 3: Integrate Akahu pay-by-bank** as a fee-reduction option for bank-to-bank transfers, targeting cost-conscious tradies and clients who prefer direct bank payments.

## Phased Rollout Plan

### Phase 1: Stripe Payment Link Reuse (Weeks 1-2)
- Extend `services/stripe.ts` with a function to create payment links for invoice amounts
- Modify `/api/v1/public/invoices/:token` route to generate and display a Pay Now button
- Button redirects customer to Stripe-hosted payment page
- After payment, Stripe redirect returns to a success/cancel page (could be BossBoard-hosted)
- Webhook from Stripe updates invoice status to 'paid' in `/api/v1/invoices/:id/paid` handler
- No changes to subscription billing logic

### Phase 2: Windcave Integration (Weeks 3-4)
- Add Windcave SDK/package to dependencies
- Create new service `services/windcave.js` for payment initiation
- Add payment method selector on public invoice page (Stripe vs Windcave)
- Implement Windcave webhook handler for payment notifications
- Allow tradies to configure Windcave credentials in profile/settings

### Phase 3: Akahu Pay-by-Bank (Weeks 5-6)
- Add Akahu SDK/package
- Create service `services/akahu.js` for bank transfer initiation
- Add Akahu as third payment option on public invoice
- Implement Akahu webhook for bank transfer confirmations
- Educate tradies on lower fees and faster settlement benefits

## Implementation Notes
- Public invoice route must generate payment links/tokens dynamically per invoice
- Payment amount should be in NZD cents (integer) to match existing invoice storage
- Success/cancel pages should provide clear feedback and link back to BossBoard
- Webhook endpoints must be secured and verify signatures (Stripe: `stripe-signature` header + endpoint secret)
- Consider adding payment method metadata to invoices for reporting (`paid_via`, `gateway_reference`)
- Ensure compliance with NZ surcharge laws (Retail Payment System Act 2022): if enabling surcharge, display clearly before payment and cap at the actual cost of acceptance
- Re-use of `services/stripe.ts` is **out of scope for this discovery doc** — extension is a Phase-1 implementation task, not a refactor of subscription billing

## Integration Touch Points (for the implementation task that follows this discovery)
- `apps/api/src/routes/public.ts` — the public invoice handler is where the "Pay Now" CTA renders; today it has a `TODO(payments)` marker pointing to this document
- `apps/api/src/routes/invoices.ts` — the `POST /:id/paid` handler is where a gateway webhook will eventually land an automatic status flip; today it has a `TODO(payments)` marker
- `apps/api/src/services/stripe.ts` — Phase 1 extension surface; **this discovery does not modify it**
- A new migration will be required at implementation time to persist `payment_link_url`, `payment_provider`, and `gateway_payment_id` on `invoices`; explicitly out of scope for this task

## Open Questions
1. Should we allow tradies to mark invoices as paid manually if payment occurs outside our gateway (e.g., cash)? (Yes — existing `mark as paid` endpoint preserved)
2. How to handle partial payments or overpayments? Phase 1: full-amount only; revisit in Phase 2
3. Should we save payment tokens/references on the invoice for refunds/chargebacks? Yes — column added at Phase 1 implementation
4. What currency support is needed? Currently NZD only; international IBAN block stays as manual bank transfer
5. Who absorbs the gateway fee — tradie or end customer? Default: tradie absorbs in Phase 1; per-tradie surcharge toggle in Phase 2
6. How do we communicate "payment in flight" between gateway redirect and webhook landing? Phase 1: status remains `sent` until webhook confirms; no intermediate `processing` state

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stripe NZ rate higher than tradie expectations | High | Medium | Phase-2 Windcave gives lower-fee alternative |
| Webhook race against manual mark-as-paid | Medium | Low | Idempotent paid-flip; ignore webhook if already `paid` |
| Customer abandons at Stripe-hosted page | Medium | Medium | Track abandonment via Stripe dashboard; phase-2 add inline checkout |
| Surcharge non-compliance (Retail Payment System Act 2022) | Low | High | Display surcharge before payment; cap at cost of acceptance |
| Akahu pay-by-bank low end-customer adoption | High | Low | Offer alongside cards, not as sole option |

## Evidence & Sources
- Stripe NZ pricing: https://stripe.com/nz/pricing (2.9% + 30¢ domestic cards as of 2026)
- Windcave NZ pricing: https://www.windcave.com/pricing — published indicative SMB rates ~2.5% + 30¢
- Worldline NZ (ex-Paymark): https://worldline.com/en-nz — quoted rates require sales engagement; ~2.2% + 30¢ band
- Paystation: https://paystation.co.nz/pricing — published transparent SMB plans ~2.0% + 25¢
- Akahu: https://akahu.nz — open-banking pay-by-bank, flat-fee model 30–50¢/transaction
- NZ Retail Payment System Act 2022 (surcharge cap): https://www.legislation.govt.nz/act/public/2022/0021/latest/whole.html

---
*Document generated for BossBoard payment gateway discovery. Next step: implementation task after approval, scoped to the Phase 1 recommendation below.*

**Recommended Phase 1: Stripe Payment Links** — chosen because the Stripe SDK and credentials are already wired into `apps/api/src/services/stripe.ts` for subscription billing, time-to-first-payable-invoice is days not weeks, and the 2.9% + 30¢ NZ rate is acceptable while we validate end-customer demand before negotiating Windcave volume pricing.