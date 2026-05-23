/**
 * Per-module helpers for the Stats & insights demo suite (F-STAT-01).
 *
 * Provides realistic seed fixtures for the SQL-aggregation surfaces
 * exposed by the dashboard + insights endpoints:
 *   - GET /api/v1/stats/dashboard  → counts (SWMS, invoices, quotes, certs)
 *   - GET /api/v1/stats/insights   → revenue compare, aging, top customers,
 *                                    6-month chart series
 *
 * SCOPE — SQL only, NOT AI generated. Verified 2026-05-23 against
 * apps/api/src/services/insights.ts: every shape returned is computed via
 * pure Postgres aggregations (date_trunc, FILTER, SUM/COUNT, LEFT JOIN
 * customers). No Anthropic / Claude calls in this path. Tests below MUST
 * NOT assume any AI involvement.
 *
 * All monetary amounts are in CENTS to match the API schema (invoices.total,
 * paid_at). This mirrors the convention in helpers/quotes.ts.
 *
 * SETUP (for the live runs once dev env is up): seed an account with 47
 * invoices distributed across:
 *   - customers: "Auckland Council" (top — $18,000), "Te Whanau Whānau Trust"
 *     ($9,800), "Smith Residence" ($7,650), "Mike\'s Plumbing — internal"
 *     ($4,200), "Sarah Builds Ltd" ($3,950) — to verify top-5 ranking
 *   - aging buckets: 0-30 ($30K, 3 invoices), 31-60 ($5K, 1), 61-90
 *     ($1.5K, 1), 90+ ($800, 1) — realistic overdue distribution for a
 *     solo tradie
 *   - 6-month revenue series: $14K Dec → $9K Jan → $22K Feb → $18K Mar
 *     → $25K Apr → $19K May — anchors the chart with a credible NZ
 *     tradie month-over-month story (post-Xmas slump → strong autumn).
 *
 * Phase 3 brief = NO EXECUTION; the seed function below is shape-correct
 * + type-checked but not invoked. Phase 4 will exercise it.
 */
import type { APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Insights data-shape types (mirror apps/api/src/services/insights.ts)
// ---------------------------------------------------------------------------

export interface RevenueComparison {
  thisMonth: number; // cents
  lastMonth: number; // cents
  percentChange: number;
}

export interface InvoiceAging {
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyPlus: number;
  currentAmount: number;
  thirtyDayAmount: number;
  sixtyDayAmount: number;
  ninetyPlusAmount: number;
}

export interface TopCustomer {
  customerId: string;
  customerName: string;
  revenue: number;
  invoiceCount: number;
}

export interface MonthlyRevenue {
  month: string; // YYYY-MM
  label: string; // 3-letter month
  revenue: number;
  count: number;
}

export interface InsightsData {
  revenue: RevenueComparison;
  aging: InvoiceAging;
  topCustomers: TopCustomer[];
  monthlyRevenue: MonthlyRevenue[];
}

export interface DashboardStatsShape {
  swms: { total: number; thisMonth: number; signed: number; draft: number };
  invoices: { total: number; totalRevenue: number; paid: number; outstanding: number };
  quotes: { total: number; accepted: number; pending: number };
  certifications: { total: number; expiring: number; expired: number };
}

// ---------------------------------------------------------------------------
// Demo fixtures — credible NZ-tradie revenue story
// ---------------------------------------------------------------------------

/**
 * Top-5 customers: realistic NZ-tradie customer mix anchoring the
 * top-customers list. Auckland Council (commercial, big-ticket
 * electrical fit-out) sits at #1 to mirror the demo scenario in
 * helpers/quotes.ts. Order matters: the API returns DESC by revenue.
 */
export const TOP_CUSTOMERS_FIXTURE: TopCustomer[] = [
  {
    customerId: 'cust-akcc-001',
    customerName: 'Auckland Council',
    revenue: 1800000, // $18,000
    invoiceCount: 4,
  },
  {
    customerId: 'cust-tewhanau-002',
    customerName: 'Te Whanau Whānau Trust',
    revenue: 980000, // $9,800
    invoiceCount: 3,
  },
  {
    customerId: 'cust-smith-003',
    customerName: 'Smith Residence',
    revenue: 765000, // $7,650
    invoiceCount: 5,
  },
  {
    customerId: 'cust-mikes-004',
    customerName: 'Mike\'s Plumbing — internal',
    revenue: 420000, // $4,200
    invoiceCount: 2,
  },
  {
    customerId: 'cust-sarah-005',
    customerName: 'Sarah Builds Ltd',
    revenue: 395000, // $3,950
    invoiceCount: 3,
  },
];

/**
 * 6-month chart fixture: revenue trajectory $14K → $9K → $22K → $18K →
 * $25K → $19K. Tells a believable "post-Xmas dip → autumn recovery"
 * story for a solo NZ tradie. The labels intentionally do NOT hard-code
 * a specific calendar month set, because the API\'s
 * getMonthlyRevenue() always returns a rolling 6-month window relative
 * to CURRENT_DATE. Demos that match these counts also need to allow
 * label drift (e.g. don\'t assert label === 'Dec' — assert .length===6
 * and monotonic month keys).
 */
export const MONTHLY_REVENUE_FIXTURE: MonthlyRevenue[] = [
  { month: '2025-12', label: 'Dec', revenue: 1400000, count: 8 },
  { month: '2026-01', label: 'Jan', revenue: 900000, count: 5 },
  { month: '2026-02', label: 'Feb', revenue: 2200000, count: 11 },
  { month: '2026-03', label: 'Mar', revenue: 1800000, count: 9 },
  { month: '2026-04', label: 'Apr', revenue: 2500000, count: 12 },
  { month: '2026-05', label: 'May', revenue: 1900000, count: 10 },
];

/**
 * Aging buckets fixture: 6 outstanding invoices distributed across the 4
 * buckets. Mirrors what a tradie would see ~3 months into the year
 * (most current, one chasing 90+).
 */
export const AGING_FIXTURE: InvoiceAging = {
  current: 3,
  thirtyDay: 1,
  sixtyDay: 1,
  ninetyPlus: 1,
  currentAmount: 3000000, // $30,000 — three larger commercial invoices
  thirtyDayAmount: 500000, // $5,000 — one residential lagging
  sixtyDayAmount: 150000, // $1,500
  ninetyPlusAmount: 80000, // $800 — small write-off candidate
};

/**
 * Revenue comparison fixture: this month vs last month. % change is what
 * the SQL produces (rounded to 1 dp): (2500000-1800000)/1800000*100 =
 * 38.888… → 38.9.
 */
export const REVENUE_FIXTURE: RevenueComparison = {
  thisMonth: 2500000, // $25,000 — strongest month
  lastMonth: 1800000, // $18,000
  percentChange: 38.9,
};

/**
 * Full insights object — what GET /api/v1/stats/insights should return
 * after the seed.
 */
export const INSIGHTS_FIXTURE: InsightsData = {
  revenue: REVENUE_FIXTURE,
  aging: AGING_FIXTURE,
  topCustomers: TOP_CUSTOMERS_FIXTURE,
  monthlyRevenue: MONTHLY_REVENUE_FIXTURE,
};

/**
 * Dashboard stats fixture — what GET /api/v1/stats/dashboard should
 * return. Counts chosen so demos can verify a "real account in active
 * use" scene (not empty state, not absurdly large).
 */
export const DASHBOARD_STATS_FIXTURE: DashboardStatsShape = {
  swms: { total: 12, thisMonth: 3, signed: 9, draft: 3 },
  invoices: { total: 47, totalRevenue: 4200000, paid: 41, outstanding: 6 },
  quotes: { total: 8, accepted: 5, pending: 3 },
  certifications: { total: 4, expiring: 1, expired: 0 },
};

/**
 * Empty-account fixtures (AC #4 in the spec: "Empty-account returns
 * zeros, not nulls"). Used by the empty-state demo.
 */
export const DASHBOARD_STATS_EMPTY: DashboardStatsShape = {
  swms: { total: 0, thisMonth: 0, signed: 0, draft: 0 },
  invoices: { total: 0, totalRevenue: 0, paid: 0, outstanding: 0 },
  quotes: { total: 0, accepted: 0, pending: 0 },
  certifications: { total: 0, expiring: 0, expired: 0 },
};

export const INSIGHTS_EMPTY: InsightsData = {
  revenue: { thisMonth: 0, lastMonth: 0, percentChange: 0 },
  aging: {
    current: 0,
    thirtyDay: 0,
    sixtyDay: 0,
    ninetyPlus: 0,
    currentAmount: 0,
    thirtyDayAmount: 0,
    sixtyDayAmount: 0,
    ninetyPlusAmount: 0,
  },
  topCustomers: [],
  // The API always returns a 6-month array, even for new users — each
  // bucket is zeroed. Labels follow CURRENT_DATE; we leave them blank
  // here so the empty-state demo doesn\'t need to predict the calendar.
  monthlyRevenue: [
    { month: '', label: '', revenue: 0, count: 0 },
    { month: '', label: '', revenue: 0, count: 0 },
    { month: '', label: '', revenue: 0, count: 0 },
    { month: '', label: '', revenue: 0, count: 0 },
    { month: '', label: '', revenue: 0, count: 0 },
    { month: '', label: '', revenue: 0, count: 0 },
  ],
};

// ---------------------------------------------------------------------------
// Format helpers (mirror mobile/web display code)
// ---------------------------------------------------------------------------

/** NZD formatter for cents → "$1,234" (no decimals — matches mobile home tab). */
export function formatNzd(cents: number): string {
  return (
    '$' +
    (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

/** Compute expected % change client-side. Mirrors insights.ts:74. */
export function computePercentChange(thisMonth: number, lastMonth: number): number {
  if (lastMonth === 0) return thisMonth > 0 ? 100 : 0;
  return Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Seed helper (Phase 4 use — not invoked in Phase 3 syntax-verify pass)
// ---------------------------------------------------------------------------

/**
 * SETUP: seed an account with the canonical demo dataset (47 invoices
 * distributed across the customers + months described at the top of
 * this file). Used by the API demo spec when a real backend is reachable.
 *
 * INJECTION POINT: invoke right after register+verify+onboard in the
 * test fixture (`test.beforeAll`). Cleanup via cleanupSeed() in
 * `test.afterAll`.
 *
 * NOTE: requires the invoices route to accept a back-dated `paid_at`
 * field on POST/PATCH. If the route rejects back-dating (some API
 * versions do), the seed falls back to creating the rows directly via
 * a hidden test-only endpoint. Phase 4 will pick the right path once
 * dev env is up.
 */
export async function seedInsightsDataset(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
): Promise<{ invoiceIds: string[]; customerIds: string[] }> {
  // The shape below documents intent only — Phase 3 syntax pass leaves
  // the call unexercised. See SETUP comment at top of file for the
  // seeded distribution.
  const invoiceIds: string[] = [];
  const customerIds: string[] = TOP_CUSTOMERS_FIXTURE.map((c) => c.customerId);

  // For each top-5 customer, post a small batch of invoices (paid +
  // outstanding mix) that together hit the revenue figure in the
  // fixture. Real implementation deferred to Phase 4.
  for (const customer of TOP_CUSTOMERS_FIXTURE) {
    // SETUP: POST /api/v1/customers, then POST /api/v1/invoices ×N for
    // each. Marked but not run.
    if (customer.customerId === '__unreachable__') {
      // Placeholder to keep the request param referenced; the live
      // implementation will use request + apiUrl + accessToken.
      await request.get(`${apiUrl}/health`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  }

  return { invoiceIds, customerIds };
}

/**
 * Cleanup the seeded rows. Mirrors the lifecycle pattern from
 * apps/web/e2e/helpers/test-data.ts.
 */
export async function cleanupSeed(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
  ids: { invoiceIds: string[]; customerIds: string[] },
): Promise<void> {
  for (const invoiceId of ids.invoiceIds) {
    await request.delete(`${apiUrl}/api/v1/invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      failOnStatusCode: false,
    });
  }
  for (const customerId of ids.customerIds) {
    await request.delete(`${apiUrl}/api/v1/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      failOnStatusCode: false,
    });
  }
}
