# BossBoard — Banking / Xero P0 product slice (design)

**Date:** 2026-08-13  
**Status:** Design only — no fake integration  
**Audience:** Marc / engineering / claim gate  
**Strategy sources:**

- `~/local-agent-workspace/docs/BB_BANKING_XERO_STRATEGY_2026-08-09.md`
- `~/local-agent-workspace/docs/BB_BANKING_XERO_RECOMMENDATION_PAPER_2026-08-09.md`
- `docs/technical/MODULE_2_XERO_CASHFLOW_DESIGN.md` (Module 2 — **design only**, no code)
- `marketing-truths.json` (`bossboard.feature.web-bank-reconciliation` IMPLEMENTED; `bossboard.cashflow-forecasting` ABSENT)
- Data protection notes: `~/local-agent-workspace/docs/BB_DATA_PROTECTION_RAILWAY_2026-08-09.md` + `PRIVACY_NOTICE.md`

---

## 1. Commercial rule reminder (non-negotiable)

| Rule | Detail |
|------|--------|
| **Live bank connectivity (Akahu / open banking) is never free** | Strategy + recommendation paper: Tradie/Team (or Bank Connect add-on) only. Free tier = **CSV upload + manual/auto-match only**. |
| **Pay-by-bank is never unlimited free** | Caps + overage after Akahu quote; prefer web for add-on/overage vs IAP. |
| **Do not put Bank Connect SKUs in `marketing-truths` until billing is live** | Hybrid model proposed (+$6.99/mo Bank Connect, payment caps) is modelling only until Stripe product IDs + Akahu written quote. |
| **Positioning** | Field OS for NZ trades; **Xero remains the books**. Never market as full accounting, Xero killer, or bank-feed replacement. |

**CSV reconciliation (existing + this P0)** may remain available on free/beta: **zero Akahu COGS**. That is intentional and distinct from “banking features” (live feeds / payments).

---

## 2. Current state (truth)

| Capability | Status | Evidence |
|------------|--------|----------|
| CSV upload → `bank_transactions` | **Shipped** | `apps/api/src/routes/bank-transactions.ts`, `services/bank-transactions.ts` |
| Auto-match credits → unpaid invoices + confirm paid | **Shipped** | `autoMatch` / confirm routes; unit tests `apps/api/src/__tests__/services/bank-transactions.test.ts` |
| Web + mobile bank UI | **Shipped** | `apps/web/src/app/(dashboard)/bank/`, `apps/mobile/app/bank/` |
| CSV format support | **Wise-oriented** | `parseWiseCSV` only; generic header aliases (date/amount/reference) help some exports, not NZ bank-labelled parsers |
| Live bank OAuth / Akahu | **Not built** | No production Akahu service; type `PaymentProvider` includes `'akahu'` as enum only |
| Xero OAuth / cashflow forecast / invoice chase | **Design only** | `MODULE_2_XERO_CASHFLOW_DESIGN.md`; `grep xero` in services/routes ≈ empty product path |
| Tier gate on bank routes | **None today** | Routes use `authenticate` only — no `requireTier` / `requireFeature` |

**Claim already safe for bank recon (do not expand until ship):**

> On web, import bank CSV exports, auto-match credits to unpaid invoices, and confirm to mark invoices paid (office recon; not full accounting).  
> — `bossboard.feature.web-bank-reconciliation` · **Do not claim** Xero sync, automatic bank feed OAuth, or accounting software.

**Claim still ABSENT (do not soft-claim as shipped):**

> Cashflow Forecasting (Coming Q2 2026): Xero integration, invoice chasing, full cashflow position  
> — `bossboard.cashflow-forecasting`

---

## 3. Smallest shippable P0 (this slice)

**P0 name:** **NZ bank CSV pack + match polish**  
**Roadmap alignment:** Strategy Phase 0 / Recommendation **P0** (before Xero P1 / Akahu P2).  
**COGS:** $0 variable (no Akahu, no Xero API).  
**Customer outcome:** Tradie can export CSV from a common NZ bank (or Wise), upload in BossBoard, get better matches, mark invoices paid — **without** any live bank or Xero promise.

### 3.1 In scope

| ID | Deliverable | Notes |
|----|-------------|--------|
| **P0-A** | **Multi-format CSV detection** | Detect format by header fingerprint; route to parser: Wise (existing), plus **ANZ / ASB / BNZ / Westpac / Kiwibank** common personal/business export shapes (document sample headers in fixtures). Fallback: generic column map (current behaviour) with clear UI error if no date/amount columns. |
| **P0-B** | **Parser normalisation** | Always: amount → cents (credits positive for match path), NZ date `DD/MM/YYYY` + ISO, currency default NZD, stable `transaction_id` or content hash for de-dupe, `payment_reference` / description preserved for match. |
| **P0-C** | **Match quality v1.1** | Keep existing confidence ladder; add: (1) invoice number token match with common separators (`INV-`, spaces); (2) do not suggest same invoice on two open txns without operator choice (first-wins + flag); (3) skip already-matched invoices in the same auto-match pass; (4) optional exact-amount + partial ref medium when full number not present. No ML. |
| **P0-D** | **Operator-clear UI copy** | Bank pages: “Upload a CSV export from your bank or Wise. This is not a live bank feed and not Xero.” Upload success: format detected + imported/dupe counts. No “Connect bank” / “Sync Xero” CTAs in this slice. |
| **P0-E** | **Tests + fixtures** | Unit fixtures per bank format; extend `bank-transactions.test.ts`; keep financial correctness (cents, dups, confidence). |

### 3.2 Explicit non-goals (P0)

Do **not** implement or customer-claim any of:

- Xero OAuth, App Partner listing, push invoice/contact, cash position, GST countdown, invoice chaser  
- Akahu ongoing connectivity or pay-by-bank  
- Becoming a CDR accredited requestor  
- Replacing Xero bank feeds  
- Full accounting / ledger / tax filing  
- Stripe Bank Connect add-on billing SKU (commercial model locked in strategy; **billing code deferred** until quote + P2)  
- Forecasting, ML match, multi-currency FX, multi-entity bank books  
- New landing marketing as “open banking” or “Xero integration live”  
- Dead stub routes (`/api/v1/xero/*`) that imply a product surface — **document-only** until real OAuth app credentials exist  

Module 2 design doc remains the spine for **later P1+**; P0 does not start Module 2 code.

### 3.3 Why this is the right P0 (not Xero-first)

Recommendation sequence: **CSV polish → Xero sync → Akahu read → pay-by-bank**. CSV ships value under current claim, uses existing match engine, zero partner blockers (no Xero app registration, no Akahu accreditation). Xero P1 is the next product slice **after** this; do not merge scopes.

---

## 4. Feature flags / beta gating

### 4.1 P0 (CSV pack)

| Surface | Gate | Rationale |
|---------|------|-----------|
| Upload / list / auto-match / confirm | **Auth only** (status quo) | Free-tier CSV is strategy-explicit; $0 COGS |
| `BETA_MODE` (default on) | No special bank override | Beta already elevates free → Tradie feature set for other limits; bank CSV stays available either way |
| Env flag (optional, defensive) | `BANK_CSV_MULTI_FORMAT=true` default **on** when shipped | Allows kill-switch to Wise-only parse if a format regresses production; not a marketing flag |

### 4.2 Reserved for later slices (do not ship product UI on)

| Flag / feature key (proposed) | When | Gate |
|-------------------------------|------|------|
| `bankConnect` / `requireFeature('bankConnect')` | **P2 Akahu** | Paid Tradie+ or Bank Connect add-on; **never free** when `BETA_MODE=false` |
| `xeroSync` / `requireFeature('xeroSync')` or `cashflow` | **P1 Xero** | Paid tier per Module 2 design (`requireFeature('cashflow')` already sketched) |
| `payByBank` | **P3** | Caps + overage; paid only |

**Beta nuance:** While `BETA_MODE=true`, product may expose paid-tier *product* surfaces for testing, but **must not** open Akahu commercial connectivity for free users without a deliberate Marc decision (COGS). P0 avoids that entirely.

**Implementation note when P2 lands:** extend `TierLimits` + `requireFeature` union in `middleware/subscription.ts` / `subscriptions.ts` — today feature keys are only `pdfExport | emailInvoice | quotes | expenses | jobLogs | photos`.

---

## 5. Claim-safe copy — `marketing-truths` **only after ship**

### 5.1 Do not edit `marketing-truths.json` in the P0 branch until code is merged + verified

Pre-ship residual risk: README / llms “Coming Q2 2026” cashflow lines are future-tense (ABSENT claim) — leave them; do **not** reword to present-tense.

### 5.2 After P0 green + deploy, allowed claim updates

**Update existing claim** `bossboard.feature.web-bank-reconciliation` (keep verdict IMPLEMENTED):

| Field | Suggested post-ship text |
|-------|---------------------------|
| `claim` | On web and mobile, import CSV exports from Wise and common NZ bank formats, auto-match credits to unpaid invoices, and confirm to mark invoices paid (office recon; not a live bank feed, not Xero, not full accounting). |
| `code_references` | Add parser module paths / fixtures if split from `parseWiseCSV` |
| `last_verified` | Ship date |
| `previous_overclaim` | Retain: Do not claim Xero sync, automatic bank feed OAuth, Akahu, or that BossBoard is accounting software. |

**Do not add** claims for:

- “Open banking” / “bank connect” / “Akahu”  
- “Xero integration” / “cashflow forecasting” / “invoice chasing” as available  
- Bank Connect pricing until Stripe SKU live  

**Optional open_items tweak (post-ship):** keep “Cashflow forecasting + Xero integration: Module 2” as open; add note “P0 NZ CSV pack shipped YYYY-MM-DD”.

### 5.3 Customer-facing UI strings (ship with code, not only truths file)

Bank list + upload (web + mobile):

- Help: *“Upload a CSV from your bank or Wise. BossBoard matches deposits to unpaid invoices. This is not a live bank connection and does not sync to Xero.”*
- Empty: *“No transactions yet. Export CSV from online banking, then upload.”*
- Error unknown format: *“We couldn’t read that CSV. Try a different export format or contact support.”*

Landing / hero: **no new banking marketing** in P0 unless claim gate re-audits page.tsx (prefer product surface only).

---

## 6. Test plan + data residency / protection

### 6.1 Test plan

| Layer | What | Gate |
|-------|------|------|
| **Unit** | Fixtures: Wise (regression), each NZ bank sample, NZ dates, quoted fields, debit skip, dupe skip, confidence ladder, one-invoice-one-suggestion | Extend `apps/api/src/__tests__/services/bank-transactions.test.ts` |
| **Route** | Auth required; upload validation; confirm marks invoice paid | Existing critical/route patterns if present; add if gap |
| **Web smoke** | Upload sample → list → auto-match → confirm (manual or Playwright if bank e2e exists) | No Maestro requirement for P0 CTA residual |
| **Predeploy** | Include unit bank tests in normal API test run; no director suite dependency | Follow product rule: green `test:predeploy` before prod |
| **Claim audit** | Grep customer copy for “Xero”, “open banking”, “live bank”, “cashflow forecast” on bank surfaces | Must be absent or future-tense only |
| **Regression** | Confirm match still requires operator **confirm** (no silent mark-paid without confirm) | Financial correctness |

**Out of P0 test scope:** Xero sandbox, Akahu sandbox, pay-by-bank webhooks.

### 6.2 Data protection & residency (from BB_DATA_PROTECTION + privacy)

| Topic | P0 implication |
|-------|----------------|
| **Residency** | Bank CSV rows store on existing Railway/US Postgres with other app data; user already under NZ Privacy Act IPP12 offshore notice (`PRIVACY_NOTICE.md`). No new region. |
| **Sensitivity** | Transaction descriptions / references can contain payer names and invoice refs — treat as financial + personal. Access already behind auth; user-scoped queries only. |
| **Encryption** | Field encryption today covers business bank **account numbers** on profile + client PII when `FIELD_ENCRYPTION_KEY` set — **not** full `bank_transactions` description columns. P0 does **not** require encrypting every txn row; if P2 Akahu stores tokens/account IDs, use encrypted-at-rest pattern from Module 2 / field-crypto (like planned `xero_*` token enc). |
| **Honest language** | OK: TLS + app field encryption for sensitive profile fields + infrastructure at-rest. Avoid “bank-grade encryption of every transaction column” without implementation. |
| **Retention** | Operator can unmatch; hard-delete policy follows existing account/data delete routes — no separate bank retention product in P0. |
| **No bank numbers in notes** | Existing guidance: account numbers live in Settings bank details, not free-text notes. CSV import is separate structured store. |
| **Audit** | Optional later: log upload batch create in `data_access_audit_log`; not required to ship P0 CSV pack. |

Akahu consent UX and open-banking privacy copy are **P2**, not P0.

---

## 7. Engineering sketch (implementation later — not this doc’s code)

*Design pointers only; no stubs that pretend to be integrations.*

```
uploadCSV
  → detectFormat(headers) → 'wise' | 'anz' | 'asb' | 'bnz' | 'westpac' | 'kiwibank' | 'generic'
  → parse*(csv) → normalised rows
  → insert bank_transactions (existing de-dupe)
autoMatch (v1.1 rules) → suggestions
confirm → invoice paid (existing)
```

- Prefer pure functions for parse/detect (easy unit tests).  
- Keep Wise path as first-class regression suite.  
- Do **not** add `/api/v1/xero/*` or `/api/v1/akahu/*` empty routers in P0.

---

## 8. Slice sequencing (after P0)

| Slice | Deliverable | Commercial |
|-------|-------------|------------|
| **P0** (this doc) | NZ CSV + match polish | Free/beta OK |
| **P1** | Xero OAuth + push AR (subset of Module 2 F1; **not** full cash forecast unless scoped) | Paid; claim only after live |
| **P2** | Akahu ongoing → feed `bank_transactions` | Bank Connect / paid only |
| **P3** | Pay-by-bank on public invoice | Caps + overage |
| **P4** | Marketplace / co-marketing | Growth |

Partner outreach (Akahu quote, Xero developer app) remains **Marc non-code** parallel work — blockers for P1/P2, not P0.

---

## 9. Acceptance criteria (P0 done)

1. At least **Wise + 3 NZ bank** CSV fixtures import successfully with correct cents and dates.  
2. Auto-match tests cover high/medium/low + no double-assign of one invoice in one pass.  
3. Bank UI copy states **not** live feed / **not** Xero.  
4. No new customer claim of Xero, Akahu, or open banking.  
5. `marketing-truths` updated **only after** deploy verification.  
6. `test:predeploy` (or agreed API unit gate) green.  
7. Commercial rule restated in PR description: live banking still never free.

---

## 10. Document-only residual (safe to leave)

| Item | Action |
|------|--------|
| `docs/technical/MODULE_2_XERO_CASHFLOW_DESIGN.md` | Keep as design; status remains DESIGN ONLY |
| `PORTS.md` / CLAUDE.md Module 2 mentions | Roadmap — not product claims |
| `PaymentProvider = 'akahu'` type | Enum reservation only; no service |
| README / llms “Coming Q2 2026” cashflow | Future-tense ABSENT claim — leave until real Module 2 ship |

---

## 11. Summary

**P0 = ship better CSV bank reconciliation for NZ tradies, claim-safely, with zero partner COGS.**  
**Not P0 = Xero, Akahu, pay-by-bank, cashflow forecasting, or any stub that overclaims.**  
**Commercial:** CSV free; **live banking never free** when it lands.

---

*Design only · 2026-08-13 · BossBoard / Instilligent*
