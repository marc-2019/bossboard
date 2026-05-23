/**
 * F-STAT (Stats & insights module) — API demos
 *
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 11
 *   F-STAT-01 — Dashboard stats + insights
 *
 * Endpoint surfaces:
 *   - GET /api/v1/stats/dashboard  (apps/api/src/routes/stats.ts:21)
 *   - GET /api/v1/stats/insights   (apps/api/src/routes/stats.ts:76)
 *
 * Both routes are SQL-only (verified 2026-05-23 against
 * apps/api/src/services/insights.ts — pure Postgres aggregations,
 * NO Anthropic/Claude calls). Tests below MUST NOT assume any AI
 * involvement.
 *
 * Existing test coverage (route-level): apps/api/src/__tests__/routes/stats.test.ts
 *   (supertest + jest, mocks the DB layer — covers dashboard + insights
 *   happy/empty/error/auth-401 cases).
 *
 * Existing test coverage (service-level): apps/api/src/__tests__/services/insights.test.ts
 *   (SQL shape + computations).
 *
 * What THIS spec adds: black-box API behaviour against the running
 * server (vs in-process supertest). Verifies the deployed contract
 * (request shape, response shape, status codes, header behaviour,
 * cross-tenant isolation) — i.e. what a mobile client / web BFF
 * actually sees on the wire.
 *
 * NO EXECUTION: dev env not running. Phase 3 brief = syntax-verify only.
 * Phase 4 will exercise these against a live API + seeded DB. Where a
 * test depends on seeded data (top-5 customers, 6-month series, aging
 * distribution), the request is `test.skip()`-ed at runtime with a note
 * pointing to helpers/stats.ts seedInsightsDataset().
 */
import { test, expect } from '@playwright/test';
import {
  DASHBOARD_STATS_FIXTURE,
  INSIGHTS_FIXTURE,
  TOP_CUSTOMERS_FIXTURE,
  computePercentChange,
} from '../helpers/stats';

const API = process.env.API_BASE_URL || 'http://localhost:29000';

// Placeholder token shape — Phase 4 will obtain a real token via the
// shared auth helper. Marked here so the test bodies remain
// type-checkable without execution.
const TOKEN_PLACEHOLDER = 'test-token-placeholder';

test.describe('F-STAT api', () => {
  test.describe('F-STAT-01.api: GET /api/v1/stats/dashboard', () => {
    test('F-STAT-01.api.a: 401 when unauthenticated', async ({ request }) => {
      const res = await request.get(`${API}/api/v1/stats/dashboard`, {
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('F-STAT-01.api.b: 200 + canonical shape for seeded account', async ({ request }) => {
      // SETUP: requires seedInsightsDataset() to have run. Phase 4 will
      // wire this via test.beforeAll. For now the assertion is
      // shape-only against a known fixture — the actual numbers come
      // from the seed, not from this fixture.
      test.skip(
        !process.env.BB_E2E_SEEDED,
        'Requires seeded account — set BB_E2E_SEEDED=1 in Phase 4 + run helpers/stats.ts:seedInsightsDataset() first',
      );

      const res = await request.get(`${API}/api/v1/stats/dashboard`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Canonical shape — every key from DashboardStats must be present.
      const stats = body.data.stats;
      expect(stats).toMatchObject({
        swms: expect.objectContaining({
          total: expect.any(Number),
          thisMonth: expect.any(Number),
          signed: expect.any(Number),
          draft: expect.any(Number),
        }),
        invoices: expect.objectContaining({
          total: expect.any(Number),
          outstanding: expect.any(Number),
        }),
        quotes: expect.objectContaining({
          total: expect.any(Number),
          pending: expect.any(Number),
        }),
        certifications: expect.objectContaining({
          total: expect.any(Number),
          expiring: expect.any(Number),
        }),
      });

      // Sanity vs fixture: a freshly-seeded account should at least
      // have the seed\'s SWMS thisMonth count.
      expect(stats.swms.thisMonth).toBeGreaterThanOrEqual(DASHBOARD_STATS_FIXTURE.swms.thisMonth);
    });

    test('F-STAT-01.api.c: AC #4 empty account → zeros (not nulls)', async ({ request }) => {
      // SETUP: this test creates a brand-new account (no seed) and
      // asserts every count comes back as 0 (number), never null /
      // undefined / missing key. Phase 4 will create the user inline.
      test.skip(
        !process.env.BB_E2E_LIVE,
        'Requires live API + fresh-user fixture — Phase 4 will register a throwaway user',
      );

      const res = await request.get(`${API}/api/v1/stats/dashboard`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(200);
      const { stats } = (await res.json()).data;

      // Every count is a number, every count is 0.
      for (const group of ['swms', 'invoices', 'quotes', 'certifications'] as const) {
        for (const k of Object.keys(stats[group])) {
          expect(typeof stats[group][k]).toBe('number');
          expect(stats[group][k]).toBe(0);
        }
      }
    });

    test('F-STAT-01.api.d: AC #3 multi-tenant isolated (user A cannot see user B\'s counts)', async ({ request }) => {
      // SETUP: needs two ephemeral users + invoices for user B only.
      // Assert user A\'s GET returns zeros even though B has data.
      // Phase 4 wires the dual-user fixture.
      test.skip(
        !process.env.BB_E2E_LIVE,
        'Requires two ephemeral users — Phase 4 will register both and seed only B',
      );

      const tokenA = TOKEN_PLACEHOLDER + '-A';
      const resA = await request.get(`${API}/api/v1/stats/dashboard`, {
        headers: { Authorization: `Bearer ${tokenA}` },
        failOnStatusCode: false,
      });
      expect(resA.status()).toBe(200);
      const { stats } = (await resA.json()).data;
      expect(stats.invoices.total).toBe(0);
      expect(stats.swms.total).toBe(0);
    });
  });

  test.describe('F-STAT-01.api: GET /api/v1/stats/insights', () => {
    test('F-STAT-01.api.e: 401 when unauthenticated', async ({ request }) => {
      const res = await request.get(`${API}/api/v1/stats/insights`, {
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });

    test('F-STAT-01.api.f: 200 + full insights shape for seeded account', async ({ request }) => {
      test.skip(
        !process.env.BB_E2E_SEEDED,
        'Requires seeded account — run helpers/stats.ts:seedInsightsDataset() first',
      );

      const res = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const { insights } = body.data;

      // Top-level shape from InsightsData type.
      expect(insights).toHaveProperty('revenue');
      expect(insights).toHaveProperty('aging');
      expect(insights).toHaveProperty('topCustomers');
      expect(insights).toHaveProperty('monthlyRevenue');

      // Revenue compare keys (AC #1 — revenue this-month vs last, % change).
      expect(insights.revenue).toMatchObject({
        thisMonth: expect.any(Number),
        lastMonth: expect.any(Number),
        percentChange: expect.any(Number),
      });

      // Aging buckets (AC #2 — 0-30, 31-60, 61-90, 90+).
      expect(insights.aging).toMatchObject({
        current: expect.any(Number),
        thirtyDay: expect.any(Number),
        sixtyDay: expect.any(Number),
        ninetyPlus: expect.any(Number),
        currentAmount: expect.any(Number),
        thirtyDayAmount: expect.any(Number),
        sixtyDayAmount: expect.any(Number),
        ninetyPlusAmount: expect.any(Number),
      });

      // Top customers (AC #2 — top 5 by revenue).
      expect(Array.isArray(insights.topCustomers)).toBe(true);
      expect(insights.topCustomers.length).toBeLessThanOrEqual(5);
      if (insights.topCustomers.length > 0) {
        expect(insights.topCustomers[0]).toMatchObject({
          customerName: expect.any(String),
          revenue: expect.any(Number),
          invoiceCount: expect.any(Number),
        });
      }

      // 6-month revenue series — always returns exactly 6.
      expect(Array.isArray(insights.monthlyRevenue)).toBe(true);
      expect(insights.monthlyRevenue).toHaveLength(6);
    });

    test('F-STAT-01.api.g: top customers ordered DESC by revenue', async ({ request }) => {
      // The seed creates 5 customers with known revenue ranks:
      // Auckland Council ($18K) > Te Whanau ($9.8K) > Smith ($7.65K)
      // > Mike\'s ($4.2K) > Sarah ($3.95K).
      // Verify the API returns them in this order.
      test.skip(
        !process.env.BB_E2E_SEEDED,
        'Requires seeded top-5 customers via helpers/stats.ts:seedInsightsDataset()',
      );

      const res = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
      });
      const { insights } = (await res.json()).data;

      // Monotonic non-increasing revenue.
      const revenues = insights.topCustomers.map((c: { revenue: number }) => c.revenue);
      for (let i = 1; i < revenues.length; i++) {
        expect(revenues[i]).toBeLessThanOrEqual(revenues[i - 1]);
      }

      // Top customer matches our fixture: Auckland Council at the top.
      // (Names may vary if other seed runs left state — assert the
      // FIRST entry has the highest expected revenue at minimum.)
      if (insights.topCustomers.length > 0) {
        expect(insights.topCustomers[0].revenue).toBeGreaterThanOrEqual(
          TOP_CUSTOMERS_FIXTURE[0].revenue,
        );
      }
    });

    test('F-STAT-01.api.h: aging buckets sum to total outstanding count', async ({ request }) => {
      // Sanity: the four bucket counts should sum to total outstanding
      // (sent + overdue) invoices. Verifies the SQL FILTER clauses
      // cover the full date range without gaps or overlaps.
      test.skip(
        !process.env.BB_E2E_SEEDED,
        'Requires seeded aging distribution',
      );

      const res = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
      });
      const { insights } = (await res.json()).data;
      const summed =
        insights.aging.current +
        insights.aging.thirtyDay +
        insights.aging.sixtyDay +
        insights.aging.ninetyPlus;
      // Seed has 6 outstanding invoices across buckets.
      expect(summed).toBe(6);
    });

    test('F-STAT-01.api.i: monthlyRevenue length === 6 even for empty account (AC #4)', async ({ request }) => {
      // AC #4: empty account → zeros, not nulls. The SQL backfills
      // missing months with revenue=0, count=0. Even a brand-new user
      // gets a length-6 array.
      test.skip(
        !process.env.BB_E2E_LIVE,
        'Requires fresh-user fixture',
      );

      const res = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
      });
      const { insights } = (await res.json()).data;
      expect(insights.monthlyRevenue).toHaveLength(6);
      for (const m of insights.monthlyRevenue) {
        expect(typeof m.revenue).toBe('number');
        expect(typeof m.count).toBe('number');
        expect(m.revenue).toBe(0);
        expect(m.count).toBe(0);
      }
      // Revenue compare also zeroes for empty account.
      expect(insights.revenue.thisMonth).toBe(0);
      expect(insights.revenue.lastMonth).toBe(0);
      expect(insights.revenue.percentChange).toBe(0);
    });

    test('F-STAT-01.api.j: percentChange math matches (thisMonth-lastMonth)/lastMonth × 100', async ({ request }) => {
      // Pure-arithmetic sanity using the helper that mirrors insights.ts:74.
      // Seed numbers: thisMonth=$25K (2,500,000c), lastMonth=$18K (1,800,000c).
      // Expected: ((2500000-1800000)/1800000)*100 → 38.888… → 38.9 (1dp).
      test.skip(
        !process.env.BB_E2E_SEEDED,
        'Requires seeded revenue distribution',
      );

      const res = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
      });
      const { insights } = (await res.json()).data;
      const expected = computePercentChange(
        insights.revenue.thisMonth,
        insights.revenue.lastMonth,
      );
      expect(insights.revenue.percentChange).toBeCloseTo(expected, 1);
    });

    test('F-STAT-01.api.k: multi-tenant isolation (user A insights ≠ user B insights)', async ({ request }) => {
      // SETUP: two users; B seeded, A not. A must see zeros + empty
      // arrays; B must see the seeded numbers.
      test.skip(
        !process.env.BB_E2E_LIVE,
        'Requires dual-user fixture',
      );

      const tokenA = TOKEN_PLACEHOLDER + '-A';
      const resA = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const { insights: insightsA } = (await resA.json()).data;
      expect(insightsA.topCustomers).toEqual([]);
      expect(insightsA.aging.current).toBe(0);
    });

    test('F-STAT-01.api.l: SQL-only path — no Anthropic/Claude latency artefacts', async ({ request }) => {
      // Sanity check: AI-generated paths in this codebase (SWMS gen,
      // hazards) typically take 2-10s. Stats/insights are pure
      // Postgres aggregations and should resolve in <500ms even on a
      // moderate dataset. This test asserts that property to guard
      // against an accidental AI call being added to the path
      // (which would also blow up the dashboard\'s p99).
      test.skip(
        !process.env.BB_E2E_SEEDED,
        'Requires live API to time round-trip',
      );

      const t0 = Date.now();
      const res = await request.get(`${API}/api/v1/stats/insights`, {
        headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
      });
      const elapsed = Date.now() - t0;
      expect(res.status()).toBe(200);
      // Generous budget — local + small seed should be well under
      // 500ms; bump if CI is slower. The point is to fail loudly if
      // someone adds AI generation to this hot path.
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
