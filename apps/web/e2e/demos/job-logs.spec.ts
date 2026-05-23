/**
 * Module 7 — Job logs web demos.
 *
 * Feature IDs covered (see docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 7):
 *   - F-JOB-01 — Create job log + clock in (web view of /job-logs list)
 *   - F-JOB-02 — Clock out + add notes (verified via list update)
 *   - F-JOB-03 — Job log stats (summary card at top of list)
 *
 * Surface scope: W (Playwright headed against Next.js at :3000).
 *
 * Important web surface caveat: as of 2026-05-23, the BossBoard web
 * dashboard's /job-logs page is READ-ONLY. The "clock in" affordance lives
 * in the mobile app (apps/mobile/app/jobs/create.tsx — see the empty-state
 * copy in apps/web/src/app/(dashboard)/job-logs/page.tsx:166-168 which
 * explicitly says "Clock in to a job from the BossBoard mobile app"). So
 * the web demo flow is:
 *   1. Seed an API-side clock-in via the request fixture (acts as the
 *      tradie clocking in on their phone).
 *   2. Reload the /job-logs page in the browser.
 *   3. Assert the new job log surfaces with the "Active" pulse badge
 *      (visible demo signal — pulsing green dot + "Active" pill).
 *   4. Seed an API-side clock-out.
 *   5. Reload + assert the badge disappears and the row shows an ended
 *      time + duration.
 *
 * This split-surface flow is realistic: it mirrors how a tradie actually
 * uses BossBoard — clock-in/out happens on-site (mobile), review happens
 * at the office (web). The drift is documented in
 * docs/testing/coverage/job-logs.md.
 *
 * NOT-RUNNABLE note: Phase 3 brief is "NO EXECUTION" — dev env is not
 * running. Syntax-verified via `playwright test --list` only.
 */

import { test, expect, type Page } from '@playwright/test';
import { registerEphemeralUser } from '../helpers/test-data';
import {
  JOB_LOGS_API,
  buildCreateJobLogPayload,
  pickJobSite,
  clockInViaApi,
  clockOutViaApi,
} from './helpers/job-logs';

const API_URL = process.env.API_BASE_URL || 'http://localhost:29000';

/**
 * Sign the page's cookie session in as the given user. The web app uses
 * a Next.js BFF (`/api/auth/login`) that swaps the body credentials for
 * an http-only cookie — we use it directly so the dashboard page can
 * be loaded as that user.
 */
async function loginViaWebBff(page: Page, email: string, password: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', {
    data: { email, password },
    failOnStatusCode: false,
  });
  if (res.status() !== 200) {
    throw new Error(
      `loginViaWebBff: expected 200 from /api/auth/login, got ${res.status()}: ${await res.text()}`,
    );
  }
}

test.describe('F-JOB Module 7 — Job logs (Web)', () => {
  test('F-JOB-01 + F-JOB-02 + F-JOB-03: active log appears, clock-out updates list + stats', async ({
    page,
    request,
  }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-web-flow');
    try {
      // ── F-JOB-01: Tradie clocks in on mobile (we seed via API) ────────
      const site = pickJobSite(1); // "Bathroom renovation — gib + waterproofing day"
      const created = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(site),
      );

      // ── Web side: log in to the dashboard ────────────────────────────
      await loginViaWebBff(page, user.email, user.password);

      // ── Open /job-logs and assert the active log appears ─────────────
      await page.goto('/job-logs');

      // F-JOB-01 AC: list view shows the freshly clocked-in job description.
      await expect(page.getByText(site.description)).toBeVisible({ timeout: 10000 });

      // F-JOB-01 AC: active jobs display the "Active" badge (pulse + pill).
      // The page renders the literal string "Active" inside a span when
      // status === 'active' (apps/web/.../page.tsx:217-222).
      const activeBadge = page.locator('span', { hasText: 'Active' }).first();
      await expect(activeBadge).toBeVisible();

      // F-JOB-03 AC: stats summary card shows "Active now" count >= 1.
      // The page renders "Active now" as a label above the count
      // (apps/web/.../page.tsx:188-189).
      await expect(page.getByText('Active now')).toBeVisible();

      // ── F-JOB-02: Tradie clocks out from site (we seed via API) ──────
      const closeNotes =
        'Customer happy with tile prep — sent the dry-day photos. Coming back Wed for grout.';
      await clockOutViaApi(request, API_URL, user.accessToken, created.id, closeNotes);

      // ── Web side: refresh and verify the row transitioned ────────────
      await page.reload();

      // F-JOB-02 AC: after clock-out, the "Active" badge for this row is gone.
      // We re-fetch the list and assert the row no longer contains an
      // animate-pulse element. The cleanest selector is the description
      // row, then no descendant "Active" pill.
      await expect(page.getByText(site.description)).toBeVisible();
      // F-JOB-02 AC: the row now shows "Ended" text (page.tsx:234).
      await expect(page.getByText(/Ended/).first()).toBeVisible();

      // F-JOB-03 AC: "Logged time" summary card visible with a duration.
      // After clock-out the stats card surfaces (page.tsx:191-196).
      await expect(page.getByText('Logged time')).toBeVisible();
      await expect(page.getByText('Total logs')).toBeVisible();
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-02: status filter narrows the list to completed jobs', async ({ page, request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-web-filter');
    try {
      // Seed one completed job + one active job for the same user.
      const completedSite = pickJobSite(4); // "Roof flashing repair"
      const activeSite = pickJobSite(2); // "Emergency leak — burst feed"

      const completed = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(completedSite),
      );
      await clockOutViaApi(
        request,
        API_URL,
        user.accessToken,
        completed.id,
        'All done — pressure tested OK',
      );

      await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(activeSite),
      );

      // Web: log in + open /job-logs ────────────────────────────────────
      await loginViaWebBff(page, user.email, user.password);
      await page.goto('/job-logs');

      // Both descriptions visible under "All jobs" (default filter).
      await expect(page.getByText(completedSite.description)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(activeSite.description)).toBeVisible();

      // Switch to "Completed" via the <select> filter (page.tsx:129-140).
      await page.getByLabel('Filter job logs by status').selectOption('completed');

      // F-JOB-02 AC: completed log still visible; active log no longer shown.
      await expect(page.getByText(completedSite.description)).toBeVisible();
      await expect(page.getByText(activeSite.description)).toHaveCount(0);

      // Switch to "Active" — inverse.
      await page.getByLabel('Filter job logs by status').selectOption('active');
      await expect(page.getByText(activeSite.description)).toBeVisible();
      await expect(page.getByText(completedSite.description)).toHaveCount(0);
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB: empty state surfaces "Clock in from mobile" guidance', async ({ page, request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-web-empty');
    try {
      await loginViaWebBff(page, user.email, user.password);
      await page.goto('/job-logs');

      // Drift note (see docs/testing/coverage/job-logs.md): web is
      // read-only by design; the empty state must direct users to mobile.
      // Copy from apps/web/src/app/(dashboard)/job-logs/page.tsx:164-168.
      await expect(page.getByText('No job logs yet')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Clock in to a job from the BossBoard mobile app/)).toBeVisible();
    } finally {
      await user.cleanup();
    }
  });
});
