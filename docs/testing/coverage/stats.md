# Stats & insights — Spec vs Demo coverage

**Generated:** 2026-05-23 by Phase 3 Agent 11
**Spec source:** [docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 11 — Stats & insights](../SPEC_AND_DEMOS_MATRIX.md)

## Module summary

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-STAT-01 | 4 ACs | partial — 5 tests covering counts + empty + error + drift + refresh-on-focus | 12 tests covering both endpoints, auth, shape, ordering, isolation, perf budget | 1 Maestro flow exercising Home tab insights cards | Web dashboard does NOT render insights surface — drift vs spec; mobile is the canonical insights surface |

## Acceptance criteria coverage

**F-STAT-01 — Dashboard stats + insights** (4 ACs)

| AC | Description | W (apps/web/e2e/demos/stats.spec.ts) | A (apps/web/e2e/demos/api/stats.api.spec.ts) | M (apps/mobile/.maestro/43-stats-dashboard.yaml) |
|---|---|---|---|---|
| 1 | `GET /api/v1/stats/dashboard` returns SWMS / invoices / certs counts + revenue compare | F-STAT-01.a (count cards) | F-STAT-01.api.b (canonical shape) | Overview + Revenue card assertVisible |
| 2 | `GET /api/v1/stats/insights` returns aging buckets, top 5 customers, 6-month chart | F-STAT-01.d (drift assert: NOT rendered on web) | F-STAT-01.api.f, .g (order), .h (bucket sum), .i (length=6) | "6-Month Revenue", "Outstanding Invoices", "Top Customers" cards |
| 3 | Multi-tenant isolated | not covered (mocked) | F-STAT-01.api.d, .k (skipped pending dual-user fixture) | n/a — single-tenant per device |
| 4 | Empty account → zeros, not nulls | F-STAT-01.b (empty cards = "0") | F-STAT-01.api.c (numbers, all zero), .i (monthlyRevenue length=6 zeros) | n/a — covered by Phase 4 follow-up flow |

## SQL-only (no AI) confirmation

**Verified 2026-05-23** against:
- `apps/api/src/routes/stats.ts` — Express routes; no Anthropic imports
- `apps/api/src/services/insights.ts` — pure `db.query()` calls, all SQL aggregations (`date_trunc`, `FILTER`, `SUM/COUNT`, `LEFT JOIN customers`)

Confirms the marketing-truths A2 sweep finding: stats/insights are **SQL-only, NOT AI-generated**. The API demo includes `F-STAT-01.api.l` (latency budget < 2s) as a regression guard against an accidental AI call being added to this hot path.

## Gaps surfaced

1. **Web does not render the insights surface (drift).** The spec marks F-STAT-01 as `W ✓` but `apps/web/src/app/(dashboard)/dashboard/page.tsx` only consumes `GET /api/v1/stats/dashboard` (the counts). The richer insights (revenue compare, aging, top customers, 6-month chart) live only on mobile (`apps/mobile/app/(tabs)/index.tsx`). The web demo file documents this with an inverted assertion (`F-STAT-01.d`) so the gap is loud — a future commit wiring insights into web will need to update both the test and this doc.
2. **API demos depend on a seeded dataset** that the Phase 3 NO-EXECUTION brief did not provision. Tests are syntax-verified via `playwright test --list`; runtime exercise is gated on `BB_E2E_LIVE` / `BB_E2E_SEEDED` env flags (`.skip()` when unset). The seed helper `seedInsightsDataset()` in `helpers/stats.ts` documents the canonical dataset (47 invoices across Auckland Council / Te Whanau / Smith / Mike\'s / Sarah, 6-month $14K→$25K trajectory, 6 outstanding invoices distributed across aging buckets).
3. **Maestro flow assumes a seeded login.** `43-stats-dashboard.yaml` uses `clearState: false` and assumes the app cold-starts already-authed into a populated account. Phase 4 will compose this with the auth flow + seed step.
4. **Empty-state Maestro flow not yet written.** The mobile flow covers the populated path; AC #4 on mobile (empty account renders zeros without crashing) is currently inferred from the React rendering logic (`{insights && (…)}` guards in `index.tsx:296`). Recommend a `43b-stats-empty.yaml` follow-up flow once auth fixture lands.
5. **Cross-tenant tests are .skip()-gated.** `F-STAT-01.api.d` + `.k` document the dual-user shape but await Phase 4 fixture. Existing supertest coverage in `apps/api/src/__tests__/routes/stats.test.ts` exercises userId pass-through, which provides confidence at the route layer.

## Existing test coverage cross-check

| File | Covers |
|---|---|
| `apps/api/src/__tests__/routes/stats.test.ts` | `GET /dashboard` happy / zero / SWMS-int parsing / 401 / userId pass-through; `GET /insights` happy / shape / empty topCustomers / 6-month length / zero-revenue / 401 / userId pass-through. All mocked at the DB + service boundary. |
| `apps/api/src/__tests__/services/insights.test.ts` | The four SQL aggregations directly (revenue compare, aging, top customers, monthly revenue). |
| `apps/web/e2e/api-routes.spec.ts` | Web API proxy routes — does NOT currently exercise `/api/stats/*` (verified via `grep stats apps/web/e2e/api-routes.spec.ts` → 0 hits). Phase 4 candidate: add a smoke for the proxy. |
| `apps/web/e2e/auth.spec.ts` | n/a (reference pattern only). |
| `apps/mobile/__tests__/` | No mobile unit tests for the Home tab insights cards. The Maestro flow is the only e2e for the mobile rendering. |

## Commands to run this module\'s demos

```bash
# Web demos (headed, serial)
cd apps/web && npx playwright test e2e/demos/stats.spec.ts --headed --workers=1

# API demos — Phase 3: list-only (NO EXECUTION until dev env up)
cd apps/web && npx playwright test --list e2e/demos/api/stats.api.spec.ts

# API demos — Phase 4 (live, seeded)
BB_E2E_LIVE=1 BB_E2E_SEEDED=1 \
  cd apps/web && npx playwright test e2e/demos/api/stats.api.spec.ts --workers=1

# Mobile flow (requires simulator + seeded login)
cd apps/mobile && maestro test .maestro/43-stats-dashboard.yaml
```

## Out-of-scope items observed during the work

- The web dashboard\'s focus-refresh behaviour (`useEffect → window.focus → loadStats()`) is exercised in `F-STAT-01.e` but could be hardened with a multi-tab scenario in Phase 4.
- The mobile chart bar-height calculation (`(m.revenue / maxRevenue) * 80` in `index.tsx:354`) has no unit test today — visual regression candidate.
- The insights route returns `data.insights` while dashboard returns `data.stats` — minor inconsistency that could surface as a contract gap for clients consuming both. Flagged but not in scope to fix.
