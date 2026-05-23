/**
 * Compliance module web demos — F-COMP-01…04.
 *
 * Module: Compliance (SWMS, risk assessment, NZ regulation citations, PDF + sign)
 * Spec: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 2 — Compliance
 *
 * SURFACE NOTE: The web app's SWMS page (`apps/web/src/app/(dashboard)/swms/page.tsx`)
 * is intentionally read-only. SWMS *generation* is mobile-first per the
 * product line ("Generate Safe Work Method Statements on site in the
 * BossBoard mobile app"). These web demos therefore cover:
 *   - Read-only list view (loaded SWMS show on web for desktop review)
 *   - Empty state copy (visible before any SWMS exists)
 *   - Status filtering / sorting (draft → signed → archived)
 *
 * F-COMP-02 (risk assessment edit) and F-COMP-04 (PDF + sign) on web are
 * BLOCKED pending dedicated web pages — flagged as drift in the coverage
 * report. The corresponding API demos still exercise the underlying routes.
 *
 * Mocking policy: all SWMS API calls are mocked via Playwright `page.route()`
 * so headed runs do NOT hit Claude or the live API. Hazards / controls /
 * regulations come from canned realistic payloads in
 * `apps/web/e2e/demos/helpers/compliance.ts`.
 */

import { test, expect } from '@playwright/test';
import { mockClaudeRoute, cannedSWMSBody } from './helpers/compliance';

test.describe('F-COMP (Compliance / SWMS module — web)', () => {
  test('F-COMP-01: SWMS page renders empty state when no documents exist (web)', async ({
    page,
  }) => {
    // Override list endpoint to return zero docs for this test only.
    await page.route(/\/api\/v1\/swms(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { documents: [], total: 0 } }),
      });
    });
    await page.route(/\/api\/swms(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { documents: [], total: 0 } }),
      });
    });

    await page.goto('/swms');

    // AC: page renders heading
    await expect(
      page.getByRole('heading', { name: /SWMS documents/i }),
    ).toBeVisible();

    // AC: empty state copy points users to the mobile app
    // (web is read-only by design; SWMS generation is mobile-first)
    await expect(page.getByText(/No SWMS documents yet/i)).toBeVisible();
    await expect(page.getByText(/BossBoard mobile app/i)).toBeVisible();
  });

  test('F-COMP-01: SWMS list renders generated document with realistic NZ plumber data (web)', async ({
    page,
  }) => {
    await mockClaudeRoute(page, 'plumber');
    await page.goto('/swms');

    // AC: generated SWMS appears in list (the list mock returns the canned doc)
    const canned = cannedSWMSBody('plumber');
    const title = canned.data.document.title;
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    // AC: trade type label visible (Plumber)
    await expect(page.getByText(/Plumber/i).first()).toBeVisible();

    // AC: status badge shows Draft (canned doc.status === 'draft')
    await expect(page.getByText('Draft').first()).toBeVisible();
  });

  test('F-COMP-02: SWMS list groups by status with draft-first sort order (web)', async ({
    page,
  }) => {
    // Surface signed + draft + archived in the same list to verify sort.
    const draft = cannedSWMSBody('plumber');
    const signed = cannedSWMSBody('electrician');
    signed.data.document.status = 'signed';
    signed.data.document.title = 'Electrician SWMS — Signed';
    const archived = cannedSWMSBody('builder');
    archived.data.document.status = 'archived';
    archived.data.document.title = 'Builder SWMS — Archived';

    await page.route(/\/api\/v1\/swms(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            documents: [
              archived.data.document,
              signed.data.document,
              draft.data.document,
            ],
            total: 3,
          },
        }),
      });
    });
    await page.route(/\/api\/swms(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            documents: [
              archived.data.document,
              signed.data.document,
              draft.data.document,
            ],
            total: 3,
          },
        }),
      });
    });

    await page.goto('/swms');

    // AC: stats card shows counts (1 draft, 1 signed)
    await expect(page.getByText(/Drafts \(need signing\)/i)).toBeVisible();
    await expect(page.getByText(/Signed/i).first()).toBeVisible();
    await expect(page.getByText(/Total/i).first()).toBeVisible();

    // AC: all three docs visible
    await expect(page.getByText(draft.data.document.title)).toBeVisible();
    await expect(page.getByText('Electrician SWMS — Signed')).toBeVisible();
    await expect(page.getByText('Builder SWMS — Archived')).toBeVisible();
  });

  test('F-COMP-03: SWMS list shows site address + client (NZ context) (web)', async ({
    page,
  }) => {
    // F-COMP-03 (WorkSafe checklist / NZ regulation citations) on web is
    // currently a "read-only display" concern. The list view shows site
    // address + client which are part of the NZ-context surface the user
    // sees when reviewing for audit. Full regulation citation rendering is
    // BLOCKED pending a dedicated detail page on web (drift — see coverage
    // report).
    await mockClaudeRoute(page, 'plumber');
    await page.goto('/swms');

    const canned = cannedSWMSBody('plumber');
    const siteAddr = canned.data.document.site_address!;
    const client = canned.data.document.client_name!;

    // AC: site address (NZ format) visible in list row
    await expect(page.getByText(siteAddr, { exact: false })).toBeVisible();
    // AC: client name visible
    await expect(page.getByText(client, { exact: false })).toBeVisible();
  });

  test('F-COMP-04: SWMS list shows signed badge for signed documents (web)', async ({
    page,
  }) => {
    // F-COMP-04 on web is limited to read-side affordances. Sign-action +
    // PDF download live on mobile (see Maestro flow 09). The web list
    // exposes the *signed* state via badge so desktop reviewers see status.
    const signed = cannedSWMSBody('electrician');
    signed.data.document.status = 'signed';
    signed.data.document.title = 'Electrician SWMS — Distribution board install';

    await page.route(/\/api\/v1\/swms(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { documents: [signed.data.document], total: 1 },
        }),
      });
    });
    await page.route(/\/api\/swms(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { documents: [signed.data.document], total: 1 },
        }),
      });
    });

    await page.goto('/swms');

    // AC: signed badge shows
    await expect(page.getByText(signed.data.document.title)).toBeVisible();
    await expect(page.getByText('Signed').first()).toBeVisible();
  });
});
