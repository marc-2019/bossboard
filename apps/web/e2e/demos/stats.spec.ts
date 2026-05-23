/**
 * F-STAT (Stats & insights module) — Web demos
 *
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 11 — Stats &
 * insights (1 feature)
 *   F-STAT-01 — Dashboard stats + insights
 *
 * Acceptance criteria (from the matrix):
 *   1. GET /api/v1/stats/dashboard returns SWMS count, invoice count
 *      (by status), expiring certs, revenue this-month vs last, % change.
 *   2. GET /api/v1/stats/insights returns: outstanding invoice aging
 *      buckets (0-30, 31-60, 61-90, 90+), top 5 customers by revenue,
 *      6-month revenue chart series.
 *   3. Multi-tenant isolated.
 *   4. Empty-account returns zeros, not nulls.
 *
 * Web scope: BossBoard\'s web dashboard (/dashboard) renders the basic
 * counts only — SWMS This Month, Unpaid Invoices, Pending Quotes,
 * Certifications. The richer insights surface (revenue compare, 6-month
 * chart, aging, top customers) is mobile-first; see apps/mobile/app/(tabs)/index.tsx.
 * This is documented drift (the spec calls W ✓ for the module, but the
 * web page does not consume /api/v1/stats/insights yet). The web demos
 * below exercise only the surfaces present on web today; the API spec
 * covers the insights endpoint shape, and the Maestro flow covers the
 * mobile rendering.
 *
 * Data realism: uses fixtures from helpers/stats.ts — Auckland Council /
 * Te Whanau Whānau Trust / Smith Residence top-5 customers, $14K→$25K
 * 6-month revenue trajectory.
 *
 * SQL-only path: insights are computed via pure Postgres aggregations
 * (date_trunc, FILTER, SUM/COUNT, LEFT JOIN customers). NOT AI-generated.
 * Tests below MUST NOT assume any Claude / Anthropic involvement.
 *
 * NO EXECUTION: dev env not running. Tests are syntax-verified via
 * `playwright test --list`. Test bodies are page.route()-mocked so they
 * remain runnable against any /dashboard UI state without depending on a
 * seeded DB.
 */
import { test, expect } from '@playwright/test';
import {
  DASHBOARD_STATS_FIXTURE,
  DASHBOARD_STATS_EMPTY,
  INSIGHTS_FIXTURE,
} from './helpers/stats';

test.describe('F-STAT (Stats & insights module) — Web', () => {
  test.describe('F-STAT-01: Dashboard stats render (web surface)', () => {
    test('F-STAT-01.a: populated stats render all four count cards', async ({ page }) => {
      // Intercept the dashboard stats fetch (web page calls /api/stats/dashboard
      // proxy → which proxies to API /api/v1/stats/dashboard). Mock the
      // proxy response with our canonical fixture.
      await page.route('**/api/stats/dashboard', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            stats: DASHBOARD_STATS_FIXTURE,
          }),
        });
      });
      // Web dashboard also probes job logs — stub empty list so page
      // renders fully.
      await page.route('**/api/job-logs**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobLogs: [] }),
        });
      });

      await page.goto('/dashboard');

      // AC #1 (counts surface): each stat card renders the expected number.
      await expect(page.getByTestId('stat-swms-this-month')).toHaveText('3');
      await expect(page.getByTestId('stat-unpaid-invoices')).toHaveText('6');
      await expect(page.getByTestId('stat-pending-quotes')).toHaveText('3');
      await expect(page.getByTestId('stat-certifications')).toHaveText('4');

      // Header sanity — confirms we\'re on the dashboard, not a redirect.
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    });

    test('F-STAT-01.b: empty-account renders zeros, not dashes / nulls (AC #4)', async ({ page }) => {
      // SETUP: brand-new account scene — every count is zero, no
      // customers, no invoices, no SWMS. AC #4 of the spec requires
      // zeros (not nulls, not "—") so the dashboard never looks broken
      // for a tradie on day one.
      await page.route('**/api/stats/dashboard', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            stats: DASHBOARD_STATS_EMPTY,
          }),
        });
      });
      await page.route('**/api/job-logs**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobLogs: [] }),
        });
      });

      await page.goto('/dashboard');

      await expect(page.getByTestId('stat-swms-this-month')).toHaveText('0');
      await expect(page.getByTestId('stat-unpaid-invoices')).toHaveText('0');
      await expect(page.getByTestId('stat-pending-quotes')).toHaveText('0');
      await expect(page.getByTestId('stat-certifications')).toHaveText('0');

      // Empty-state guidance copy: tradie sees the onboarding tiles
      // (Log a job / Draft a SWMS / Send an invoice).
      await expect(page.getByRole('heading', { name: /Kia ora/i })).toBeVisible();
    });

    test('F-STAT-01.c: stats error → "Stats unavailable" + Retry button', async ({ page }) => {
      // SETUP: simulate API failure on first load. The dashboard
      // should not crash; it should show a graceful error card with a
      // Retry action.
      let callCount = 0;
      await page.route('**/api/stats/dashboard', async (route) => {
        callCount += 1;
        if (callCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Database connection lost' }),
          });
        } else {
          // Retry succeeds.
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ stats: DASHBOARD_STATS_FIXTURE }),
          });
        }
      });
      await page.route('**/api/job-logs**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobLogs: [] }),
        });
      });

      await page.goto('/dashboard');

      // First load → error UI visible.
      await expect(page.getByText(/Stats unavailable/i)).toBeVisible();
      const retryButton = page.getByRole('button', { name: /Retry/i });
      await expect(retryButton).toBeVisible();

      // Click Retry → second call succeeds → cards populate.
      await retryButton.click();
      await expect(page.getByTestId('stat-swms-this-month')).toHaveText('3');
    });

    test('F-STAT-01.d: AC #2 drift — web does NOT render insights (revenue / aging / top customers / chart)', async ({ page }) => {
      // Documented drift: the spec says W ✓ for F-STAT-01 but the
      // current web dashboard only consumes /api/v1/stats/dashboard.
      // The insights surface (revenue comparison, aging buckets, top
      // customers, 6-month chart) is mobile-only as of 2026-05-23.
      //
      // This test ASSERTS the absence so a future commit that adds
      // insights to /dashboard will need to update this test +
      // coverage/stats.md drift entry — keeps the gap visible.
      await page.route('**/api/stats/dashboard', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ stats: DASHBOARD_STATS_FIXTURE }),
        });
      });
      // Stub insights too in case a future commit wires it up — if
      // wired, the assertions below will fail and force the
      // coverage doc update.
      await page.route('**/api/stats/insights', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ insights: INSIGHTS_FIXTURE }),
        });
      });
      await page.route('**/api/job-logs**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobLogs: [] }),
        });
      });

      await page.goto('/dashboard');

      // Insights heading + top-customer name should NOT appear on web
      // today. (Mobile-only.)
      await expect(page.getByText(/6-Month Revenue/i)).toHaveCount(0);
      await expect(page.getByText(/Top Customers/i)).toHaveCount(0);
      await expect(page.getByText('Auckland Council')).toHaveCount(0);
      await expect(page.getByText(/Outstanding Invoices/i)).toHaveCount(0);
    });

    test('F-STAT-01.e: refresh-on-focus re-pulls stats (live freshness behaviour)', async ({ page }) => {
      // The dashboard page listens for window focus and re-fetches
      // stats so the numbers don\'t go stale after a tradie creates an
      // invoice in the mobile app and flips back to the web. Verify
      // that focus → second fetch.
      let callCount = 0;
      await page.route('**/api/stats/dashboard', async (route) => {
        callCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            stats: {
              ...DASHBOARD_STATS_FIXTURE,
              // Bump the unpaid count on the second fetch so we can
              // assert the page re-rendered with fresh data.
              invoices: {
                ...DASHBOARD_STATS_FIXTURE.invoices,
                outstanding: callCount === 1 ? 6 : 7,
              },
            },
          }),
        });
      });
      await page.route('**/api/job-logs**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobLogs: [] }),
        });
      });

      await page.goto('/dashboard');
      await expect(page.getByTestId('stat-unpaid-invoices')).toHaveText('6');

      // Simulate focus: fire the focus event manually.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));

      await expect(page.getByTestId('stat-unpaid-invoices')).toHaveText('7');
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
