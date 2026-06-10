# Module 2 — Cashflow Forecasting (Xero) — Design

**Status:** DESIGN ONLY (no code) · **Author:** Claude Code session 2026-06-10 ·
**Roadmap slot:** Q2–Q3 2026 (per CLAUDE.md) · **Decision:** Marc 2026-06-10 —
"scope/design only, don't build."

> This is the implementation-ready design for Module 2. Nothing here is built
> yet (`grep -ri xero apps/` returns zero). It builds on the existing invoices,
> recurring-invoices, and stats services rather than replacing them.

---

## 1. Goal & framing

Give a tradie a **forward-looking cash position** so they can see trouble before
it arrives (51% of NZ SMEs cite cashflow as their #1 risk). The product is a
**read + nudge** tool: it reads accounting data (Xero) + the operator's own
BossBoard invoices, projects the cash position, and prompts the operator to act.
It does **not** move money and does **not** give financial advice — same
operator-accountable framing as the SWMS module (Voice-A: "here's your position,
you decide"). Keep marketing copy off "guaranteed/advice/compliant" language.

## 2. MVP features (from CLAUDE.md, refined)

| # | Feature | One-line |
|---|---|---|
| F1 | **Xero OAuth connect** | One-tap authorise; store + refresh tokens; disconnect. |
| F2 | **Cash position dashboard** | Current bank balance + 30/60/90-day projection. |
| F3 | **Invoice chaser** | Outstanding AR list; operator-triggered (then scheduled) SMS/email reminders. |
| F4 | **GST countdown** | Next GST due date + estimated liability from period turnover. |
| F5 | **Weekly summary** | Push notification with a cash-health score + 1 action. |

## 3. Integration approach (Xero)

- **OAuth2 Authorization Code + PKCE.** Scopes (least-privilege):
  `offline_access accounting.transactions.read accounting.contacts.read
  accounting.reports.read accounting.settings.read`. No write scopes for MVP.
- **Token lifecycle:** access token ~30 min, refresh token 60 days (rotating —
  each refresh issues a new refresh token; **must persist the rotated token or
  the connection silently dies**). Encrypt tokens at rest (pgcrypto, like other
  secrets) — never store plaintext.
- **Tenant selection:** Xero connections can span multiple orgs; capture
  `xero_tenant_id` per connection and pin it on every API call.
- **Rate limits:** 60 calls/min, 5000/day per tenant. Pull on a schedule + cache
  (don't call Xero per page-load). A nightly sync + on-demand refresh is enough
  for MVP.
- **Webhooks (Phase 2c):** Xero webhooks for invoice/payment events to keep the
  forecast fresh without polling. Requires an "intent to receive" validation
  endpoint.

## 4. Data model (new tables — additive migrations)

```
xero_connections     (user_id FK, xero_tenant_id, access_token_enc,
                      refresh_token_enc, expires_at, scopes, status, connected_at)
xero_sync_state      (connection_id FK, last_synced_at, cursor, last_error)
cash_snapshots       (user_id FK, as_of_date, bank_balance_cents, source,
                      projected_30/60/90_cents, created_at)   -- materialised forecast
gst_periods          (user_id FK, period_start, period_end, due_date,
                      estimated_liability_cents, basis)        -- derived, refreshable
```
- Reuse existing `invoices` (BossBoard-issued AR) + Xero contacts/invoices for
  the AR picture; **dedupe** invoices that exist in both (match on number/amount)
  so the forecast doesn't double-count.
- `cash_snapshots` is a cache/materialisation — recompute nightly + on connect.

## 5. Forecast model (MVP — deliberately simple)

`projected_balance(t) = current_bank_balance + Σ(expected_inflows ≤ t) − Σ(known_outflows ≤ t)`
- **Inflows:** open AR (BossBoard + Xero), weighted by a simple due-date +
  historical-pay-lag heuristic (start with "paid on due date"; refine later).
- **Outflows:** recurring invoices the operator *owes* (out of scope for MVP if
  not tracked) + the GST liability on its due date. MVP can start inflow-only
  ("when will I get paid") and add outflows in 2c.
- Keep it explainable: every projected number must be traceable to source rows
  (no black-box ML for MVP — that's a trust + advice-liability concern).

## 6. API surface (new `/api/v1/cashflow/*` + `/api/v1/xero/*`)

```
GET  /xero/connect            -> returns Xero authorise URL (PKCE challenge)
GET  /xero/callback           -> exchanges code, stores tokens, picks tenant
POST /xero/disconnect
GET  /xero/status             -> { connected, tenantName, lastSynced }
POST /xero/sync               -> trigger a manual sync

GET  /cashflow/position       -> { currentBalance, projected: {d30,d60,d90}, asOf }
GET  /cashflow/ar             -> outstanding AR aged buckets (0-30/31-60/61-90/90+)
POST /cashflow/ar/:id/remind  -> send a reminder (reuses services/email + Twilio SMS)
GET  /cashflow/gst            -> { nextDueDate, estimatedLiabilityCents, basis }
GET  /cashflow/summary        -> weekly cash-health score + top action
```
Gating: Module 2 is a **paid-tier feature** (`requireFeature('cashflow')`) — add
the flag to `services/subscriptions.ts` tier definitions. Free/beta = read-only
teaser or locked.

## 7. Phased plan

- **Phase 2a — Connect + read (the spine).** F1 (OAuth + token lifecycle +
  encrypted storage + tenant pin) and F2 read-only (current balance + naive
  inflow-only 30/60/90). Mobile + web "Connect Xero" + a position card. Ships the
  hardest/riskiest part (OAuth + refresh rotation) first.
- **Phase 2b — Act.** F3 invoice chaser (operator-triggered reminders via the
  existing email service + Twilio SMS) and F4 GST countdown (derive from Xero
  reports or period turnover). Reuses `services/notifications.ts`.
- **Phase 2c — Automate.** F5 weekly summary push (extend `services/cron.ts` +
  Expo push) and Xero webhooks to replace polling. Add outflow modelling.

## 8. Risks / dependencies / decisions needed (for Marc)

1. **Xero app registration** — needs a Xero developer app (client id/secret,
   redirect URIs for dev + Railway). Marc-action; can't proceed on F1 without it.
2. **Refresh-token rotation** is the #1 silent-failure mode — must persist the
   rotated token atomically; add a reconnect prompt when refresh fails.
3. **AR double-count** — BossBoard invoices vs Xero invoices overlap; need a
   dedupe rule (decision: match key = invoice number? amount+contact+date?).
4. **GST estimation accuracy** — "estimated liability" is a claim; keep it
   clearly labelled "estimate, confirm with your accountant" (advice-liability).
5. **Twilio** for SMS reminders is listed as an integration but not wired —
   F3 SMS depends on it (email works today).
6. **Scope creep guard:** MVP is read + nudge. No bank feeds, no payment
   initiation, no ML forecasting, no multi-currency. Each is a deliberate later
   phase, not MVP.

## 9. What it reuses (don't rebuild)

`services/invoices.ts` (AR data), `services/recurring-invoices.ts` (known future
inflows), `services/stats.ts` (aging buckets already computed for the dashboard),
`services/email.ts` + `notifications.ts` (reminders), `services/cron.ts`
(scheduling), pgcrypto (token encryption, as used elsewhere), the subscription
middleware (`requireFeature`).
