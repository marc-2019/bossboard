# Bank CSV — Kiwibank support spec

**Date:** 2026-08-13  
**Product:** BossBoard bank-transactions (CSV upload → match → confirm)  
**Status:** Design + fixture stubs + minimal parser in worktree  
**Worktree:** `~/local-agent-workspace/worktrees/bb-bank-csv-kiwibank-2026-08-13`  
**Branch:** `feat/bank-csv-kiwibank-2026-08-13` (based on BNZ pack `52e86ad`)  
**Scope:** L1/L2 design + unit tests only · no prod merge · no marketing claim until green + merged

Related: `docs/BANKING_XERO_P0_SLICE_2026-08-13.md` · BNZ worktree `bb-bank-csv-bnz-2026-08-13` · research `data/als/research/2026-08-13_westpac-bnz-bank-csv-next.md`

---

## 1. Goal

Extend multi-format bank CSV detection so a **Kiwibank Internet Banking CSV export** imports with correct:

- NZ dates → `YYYY-MM-DD`
- Money In / Money Out → integer **cents** (credit positive, debit negative)
- Description / payment reference for invoice auto-match
- Content-hash `transaction_id` when bank omits a serial (classic export has none)

Reuse existing `parseBankCSV` → `uploadCSV` → auto-match path. No live bank OAuth, no Akahu, no Xero.

---

## 2. Export path (user-facing, claim-safe)

1. Log in to Kiwibank Internet Banking (desktop).  
2. Open the account → expand **Search/export options**.  
3. Set date range and transaction filters.  
4. **Export** → choose **CSV** (not QIF/OFX/PDF).  
5. Upload the file in BossBoard bank recon (existing web/mobile upload).

Business **Thrive HQ** also exposes CSV/JSON/OFX/QIF/PDF export for filtered transactions — same CSV header assumptions until a redacted sample proves otherwise.

**Do not claim** “supports Kiwibank” in marketing-truths until this branch is merged and tests remain green.

---

## 3. Expected header variants

### 3.1 Canonical (V1 — implement)

Fingerprint columns (case-insensitive after trim):

| Header | Required | Maps to |
|--------|----------|---------|
| `Account number` | optional (fingerprint aid) | ignored for match (PII) |
| `Account name` | optional | ignored |
| `Date` | **yes** | `date` |
| `Other Party` | yes (or Particulars) | description (payee) |
| `Particulars` | yes (or Other Party) | payment reference + desc part |
| `Money In` | **yes** | credit (positive cents) |
| `Money Out` | **yes** | debit (negative cents) |
| `Balance` | optional | `running_balance` |

**Detection rule** (`detectBankCsvFormat` → `'kiwibank'`):

```text
has(date) AND has(money in, money out) AND hasAny(other party, particulars)
```

**Collision notes:**

| Format | Differentiator |
|--------|----------------|
| Westpac (planned) | Signed `Amount` + `Other Party` — **no** Money In/Out |
| BNZ | `Tran Type` + party **account** fields + signed `Amount` |
| ANZ | `Type` + `Details` + signed `Amount` |
| Generic | Simple `Date,Amount,...` without Money In/Out |

### 3.2 Variant B — signed Amount (document only; not in V1 fingerprint)

Some third-party docs / older exports may resemble:

```text
Date,Amount,Other Party,Particulars,Code,Reference,Balance
```

If a **real redacted sample** arrives with this shape and no Money In/Out:

- Prefer **generic** or alias to existing format if cents/dates already correct.  
- Only add a second Kiwibank fingerprint if generic mis-parses.

### 3.3 Variant C — Code / Reference extras

If export adds `Code`, `Reference`, or `Transaction type` while keeping Money In/Out:

- Keep V1 fingerprint (Money In/Out is unique).  
- Map `Reference` → payment reference **before** Particulars if present.  
- Current V1 maps Particulars first (invoice refs commonly land there).

---

## 4. Amount / date rules

### 4.1 Dates

| Input | Output |
|-------|--------|
| `15/01/2026` | `2026-01-15` |
| `15-01-2026` | `2026-01-15` |
| `2026-01-15` | `2026-01-15` |
| empty / non-date (e.g. opening balance row) | **skip row** |

NZ day-first applies for slash/dash forms (existing `normalizeDate`).

### 4.2 Amounts

| Column | Rule | Stored cents example |
|--------|------|----------------------|
| Money In only | credit → positive | `1150.00` → `115000` |
| Money Out only | debit → negative abs | `5.00` → `-500` |
| Both empty | skip row | — |
| Both populated | prefer Money In if non-zero, else Money Out (same as debit/credit path) | rare |
| Quoted thousands | strip `$`, commas, spaces | `"1,234.56"` → `123456` |

Currency defaults to **NZD** (no currency column in classic export).

### 4.3 Description & reference

- **description:** join non-empty `Other Party` + `Particulars` (space).  
- **paymentReference:** `Particulars` (primary invoice-ref candidate).  
- **transactionId:** bank id if ever present; else SHA-256 content-hash of `date|amount|description|paymentReference` (32 hex chars) for de-dupe.

### 4.4 Meta / noise rows

Skip when:

- Date unparseable (opening balance brought forward).  
- No parseable amount in Money In or Money Out.  
- Empty line.

Do **not** store account numbers as description (PII; unused for match).

---

## 5. Test fixture examples (markdown tables)

### 5.1 Header fingerprint

| Account number | Account name | Date | Other Party | Particulars | Money In | Money Out | Balance |
|----------------|--------------|------|-------------|-------------|----------|-----------|---------|

### 5.2 Synthetic data rows (committed in unit test)

| Account number | Account name | Date | Other Party | Particulars | Money In | Money Out | Balance | Expected |
|----------------|--------------|------|-------------|-------------|----------|-----------|---------|----------|
| 38-9001-0123456-00 | Business Cheque | *(empty)* | Opening Balance Brought Forward | | | | 1000.00 | **skip** |
| 38-9001-0123456-00 | Business Cheque | 15/01/2026 | Acme Ltd | INV-0001 | 1150.00 | | 2150.00 | credit `115000`, date `2026-01-15`, ref `INV-0001` |
| 38-9001-0123456-00 | Business Cheque | 10/01/2026 | Kiwibank | Monthly fee | | 5.00 | 2145.00 | debit `-500` |
| 38-9001-0123456-00 | Business Cheque | 09/01/2026 | Smith & Sons, Ltd | INV-0010 | 1234.56 | | 3379.56 | credit `123456`, quoted payee ok |

**CSV fixture (unit test constant `KIWIBANK_CSV`):**

```csv
Account number,Account name,Date,Other Party,Particulars,Money In,Money Out,Balance
38-9001-0123456-00,Business Cheque,,Opening Balance Brought Forward,,,,1000.00
38-9001-0123456-00,Business Cheque,15/01/2026,Acme Ltd,INV-0001,1150.00,,2150.00
38-9001-0123456-00,Business Cheque,10/01/2026,Kiwibank,Monthly fee,,5.00,2145.00
38-9001-0123456-00,Business Cheque,09/01/2026,"Smith & Sons, Ltd",INV-0010,1234.56,,3379.56
```

Account numbers above are **synthetic** (not a real export).

### 5.3 Normalised parse result (expected)

| date | amount (cents) | currency | description contains | paymentReference | runningBalance |
|------|----------------|----------|----------------------|------------------|----------------|
| 2026-01-15 | 115000 | NZD | Acme Ltd | INV-0001 | 215000 |
| 2026-01-10 | -500 | NZD | Kiwibank | Monthly fee | 214500 |
| 2026-01-09 | 123456 | NZD | Smith & Sons | INV-0010 | 337956 |

---

## 6. Acceptance tests list

| ID | Assertion | Layer |
|----|-----------|-------|
| KB-D1 | Header with Date + Money In + Money Out + Other Party → format `kiwibank` | unit `detectBankCsvFormat` |
| KB-D2 | Header without Money In/Out (simple Date/Amount) → **not** `kiwibank` (generic) | unit |
| KB-D3 | BNZ / ASB / ANZ / Wise headers still detect their formats (regression) | unit |
| KB-P1 | Parses 3 txn rows; skips opening balance | unit `parseBankCSV` |
| KB-P2 | Money In → positive cents | unit |
| KB-P3 | Money Out → negative cents | unit |
| KB-P4 | NZ slash dates → ISO | unit |
| KB-P5 | Particulars → `paymentReference` (invoice match fuel) | unit |
| KB-P6 | Quoted Other Party with comma preserved | unit |
| KB-P7 | Missing serial → 32-char hex content-hash id | unit |
| KB-P8 | Balance column → running balance cents | unit |
| KB-U1 | `uploadCSV` reports `format: 'kiwibank'` and `imported: 3` | unit (mocked DB) |
| KB-U2 | INSERT params: date, amount cents, NZD, payment ref | unit |
| KB-M1 | Credit with Particulars `INV-####` still eligible for existing auto-match (no code change) | regression / manual |
| KB-X1 | Do not expand marketing-truths until PR merged + suite green | process |

**Out of scope for this slice:** live Kiwibank login automation, QIF/OFX parsers, debit-card-only PDF statements, Akahu.

---

## 7. Implementation sketch (mirror BNZ)

```text
BankCsvFormat += 'kiwibank'
detectBankCsvFormat:
  money in + money out + date + (other party | particulars) → kiwibank
resolveColumnIndices('kiwibank'):
  date ← Date
  credit ← Money In
  debit ← Money Out
  amountIdx ← -1 when split columns present
  desc ← Other Party, Particulars
  ref ← Particulars
  bal ← Balance
  id ← none → content-hash
parseBankCSV / uploadCSV unchanged pipeline
```

Files:

| Path | Change |
|------|--------|
| `apps/api/src/services/bank-transactions.ts` | format + detect + column map |
| `apps/api/src/__tests__/services/bank-transactions.test.ts` | fixtures + KB-* tests |
| `apps/api/src/routes/bank-transactions.ts` | comment only (upload docs) |
| `docs/BANK_CSV_KIWIBANK_SPEC_2026-08-13.md` | this spec |

---

## 8. Risks & follow-ups

| Risk | Mitigation |
|------|------------|
| Real export headers differ from V1 | Gate marketing claim; swap fixture when Marc attaches redacted sample |
| Money In/Out both filled | Prefer non-zero credit then debit (shared path) |
| Westpac `Other Party` confusion | Westpac uses signed Amount; fingerprint requires Money In/Out for Kiwibank |
| PII in Account number | Never map into description/ref; fixtures use synthetic numbers |
| BNZ pack not yet on main | This branch stacks on `52e86ad`; merge order BNZ → Kiwibank (or rebase) |

---

## 9. Claim-safe language

| Safe after merge + green | Unsafe now |
|--------------------------|------------|
| “Import Kiwibank CSV exports we tested (Money In/Out shape)” | “All NZ banks” / “every Kiwibank export” |
| “Upload CSV and match payments to invoices” | “Live bank feed” / “open banking” |
| “Kiwibank CSV on eng backlog / in worktree” | “Kiwibank supported” in store listing |

---

## 10. Ethics / governance

- L2: design, fixtures, unit tests, worktree commit — **no** send, publish, spend, force-push, or main merge.  
- No invented live-bank screenshots.  
- Recon-only product claim (not accounting / IRD / Xero replacement).
