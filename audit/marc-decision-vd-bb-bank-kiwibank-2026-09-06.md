# marc_decision: vd-bb-bank-kiwibank Security CHALLENGE closed — 2026-09-06

**Task-ID:** vd-bb-bank-kiwibank-governance-2026-09-06  
**Value drop:** `vd-bb-bank-kiwibank`  
**Agent:** Cursor Cloud Agent (BossBoard session)  
**Landed on master:** `b078434` via [#105](https://github.com/marc-2019/bossboard/pull/105) (Marc merged 2026-09-06 despite DRAFT/CHALLENGE flag — this audit closes the CHALLENGE record for CF commit-watcher)

---

## 1. What shipped (verified on master)

| Item | Evidence |
|---|---|
| Kiwibank-shaped Full CSV Jest fixture | `apps/api/src/__tests__/services/mapped-spreadsheet.test.ts` — `describe("Kiwibank Full CSV (INFERRED headers)")` |
| Operator map proof | Date→`Date`, Amount→`Amount`, Description→`Memo/Description` (alt: `OP name`) |
| Date parsing | `25-03-2026` (day>12) → `2026-03-25` via existing `normalizeDate` |
| Signed amount | `-12.50` debit / `88.00` credit → cents integers |
| UTF-8 BOM | Stripped; operator map still matches (mirrors Westpac `#104`) |
| Production code | **None changed** — mapped path from `#101` / `3ac930b` |
| UI / marketing | **None** — no Kiwibank upload hint (Westpac hint stays PROVEN-only) |
| PR #90 | **Untouched** (parked brand parsers) |
| `value_drops.json` | **Not edited in BossBoard** (CF registry lives in CortexForge repo) |

**Test command (re-run 2026-09-06):**

```bash
cd apps/api
npx jest src/__tests__/services/mapped-spreadsheet.test.ts --no-coverage
# 17 passed (6 Kiwibank + 6 Westpac + 5 generic)
```

---

## 2. Security CHALLENGE — findings and closure

PR #105 flagged **Security CHALLENGE needed** because Kiwibank CSV column names are
**INFERRED** (community nz-bank-parser), not from official Kiwibank documentation.
Official pages only prove export **formats** exist (CSV/JSON/OFX/QIF/PDF).

### Findings reviewed

| # | Finding | Severity | Resolution |
|---|---|---|---|
| F1 | INFERRED headers may not match a real Kiwibank Business CSV export | Medium (accuracy) | **Accepted with label.** Fixture proves the *mapped-import path* handles a plausible shape; operator chooses columns at upload — no auto-detect. Test comments mark INFERRED; replace fixture when a redacted real export is available. |
| F2 | Wrong headers could mislead customers if we claimed official Kiwibank support | High (trust) | **Mitigated.** No Kiwibank-specific UI copy, logos, or “partner/integration” claims. `marketing-truths.json` `bossboard.feature.web-bank-reconciliation` unchanged — generic “import bank CSV exports”, no bank-brand list. |
| F3 | INFERRED format could enable silent mis-import via auto-detect | High (integrity) | **Not applicable.** Mapped import requires explicit operator column map (`#101`). Kiwibank fixture does not add bank-brand detect; `#90` remains parked. |
| F4 | Fixture amounts could leak into prod semantics | Low | **Not applicable.** Tests use synthetic fixture amounts; comment block states “Fixture amounts only.” |
| F5 | Date/amount parsing edge cases on INFERRED DD-MM-YYYY + signed Amount | Medium (technical) | **Closed by test.** `25-03-2026` and signed `Amount` pass through existing `normalizeDate` + `applyColumnMap` without service change. |
| F6 | `value_drops.json` registry not updated | Medium (CF governance) | **Deferred to CF repo.** BossBoard scope explicitly skipped registry edit. Marc registers drop status/evidence in `cortexforge/value_drops.json` when CF-side closure is desired. |
| F7 | No `marc_decision` audit trail for the drop | Low (CF signal) | **Closed by this file** + paired commit prefix for commit-watcher. |
| F8 | Inherited `#101` 4-eyes / operator-walk checklist | Medium (process) | **Unchanged by this drop.** Kiwibank work is test-only; does not expand production import surface. General bank-import 4-eyes/operator-walk remains open for `#101` if not yet done — not blocking this fixture-only drop. |

### CHALLENGE verdict

**PASS — fixture-only, operator-mapped, INFERRED-labeled, no affiliation surface.**

Residual risk: real Kiwibank export column names may differ. Acceptable because (a) we
do not auto-detect Kiwibank, (b) operator maps whatever headers their file actually has,
(c) fixture is regression proof for one community-reported shape until a redacted real
export supersedes it.

---

## 3. PROVEN vs INFERRED (epistemic record)

### PROVEN (official Kiwibank pages — formats only)

| Source | What it proves |
|---|---|
| https://www.kiwibank.co.nz/banking-with-us/online-banking/internet-banking/a-new-internet-banking-experience-is-coming/ | CSV, JSON, OFX, QIF, PDF export; ~2yr limit |
| https://www.kiwibank.co.nz/business-banking/thrive-hq/online-banking/internet-banking/view-and-export-your-transactions/ | Business transaction export exists |
| https://www.kiwibank.co.nz/business-banking/thrive-hq/online-banking/internet-banking/accounting-software-integration/ | 24mo QIF/PDF/OFC/OFX/CSV for accounting integration |

### INFERRED (not official — community nz-bank-parser)

Headers used in fixture: Account number, Date, Memo/Description, Source Code (payment type),
TP ref, TP part, TP code, OP ref, OP part, OP code, OP name, OP Bank Account Number,
Amount (credit), Amount (debit), Amount, Balance.

Dates: DD-MM-YYYY. Amount: signed column (positive credit / negative debit).

**Do not** cite INFERRED headers as official Kiwibank documentation in customer copy.

---

## 4. Constraints verified (post-merge)

- [x] **no #90** — PR #90 (`vd-bb-bank-bnz` brand parsers) still OPEN/parked
- [x] **no bank affiliation** — no Kiwibank partner/integration UI
- [x] **no production deploy required** — test-only delta in `#105`
- [x] **no value_drops edit in BossBoard** — per drop scope
- [x] **builds on mapped import** — `#101` `3ac930b`, Westpac `#104` `ac0c64c`
- [x] **CI green on merge** — API Test + secret-scan on `d75f132` / merge `b078434`

---

## 5. Still deferred (Marc / CF-side)

1. **`cortexforge/value_drops.json`** — register `vd-bb-bank-kiwibank` status + PROVEN/INFERRED evidence links (BossBoard repo has no copy of this file).
2. **Redacted real Kiwibank Business CSV export** — replace INFERRED fixture headers when available.
3. **Optional upload-page hint** — Westpac got PROVEN-header hint on `/bank/upload`; Kiwibank intentionally did not. Add only after headers are PROVEN or with explicit INFERRED disclaimer (not recommended).
4. **`#101` operator walk / 4-eyes** — if not yet completed for mapped import generally, still worth doing; not re-opened by this drop.

---

## 6. How to apply going forward

- Treat Kiwibank like Westpac **path-wise** (operator map) but **epistemically weaker**
  (INFERRED headers). Westpac `#104` had official PDF column names; Kiwibank does not.
- When a redacted real export arrives: update fixture headers, re-run Jest, amend this
  audit or add a superseding `marc_decision` noting PROVEN transition.
- Never conflate this drop with `#90` brand auto-detect parsers.
- CF commit-watcher: this file pairs with `marc_decision(bossboard): vd-bb-bank-kiwibank Security CHALLENGE closed — INFERRED fixture accepted`.
