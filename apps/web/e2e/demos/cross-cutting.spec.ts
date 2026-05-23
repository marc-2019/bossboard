/**
 * Cross-cutting demo suite — F-X-01 (multi-tenant isolation, web surface)
 * and F-X-03 (security headers / CSP).
 *
 * Phase 3 Agent 14 deliverable. See:
 *   - docs/testing/SPEC_AND_DEMOS_MATRIX.md § Cross-cutting features
 *   - docs/testing/coverage/cross-cutting.md (this PR adds it)
 *
 * F-X-01 — multi-tenant isolation: the P0 load-bearing API isolation
 * pin lives in apps/web/e2e/multi-tenant-isolation.spec.ts +
 * multi-tenant-isolation-entities.spec.ts. THOSE SPECS ARE LOAD-BEARING
 * — this demo deliberately does NOT duplicate their assertions. What
 * this file adds is the WEB SURFACE smoke: when user B is signed into
 * the web dashboard, navigating to user A's resource id must not show
 * A's data. This is the customer-facing failure mode of the same SQL
 * scope; the API specs pin the boundary, this demo proves the UI does
 * not bypass it.
 *
 * F-X-03 — security headers: the existing branding.spec.ts covers
 * visual brand (title, colours, no "TradeMate" leakage); middleware.spec
 * covers the auth-redirect logic. NEITHER covers response headers. This
 * demo adds header-shape assertions in regression-guard mode — headers
 * that Next.js does not yet emit are recorded with `mode: 'aspirational'`
 * (they DO NOT fail the build) so the demo can land green today while
 * pinning the target state for the next next.config.ts edit.
 *
 * Demo realism note: cross-cutting concerns are infrastructure-level.
 * Unlike F-INV-* or F-QUO-* there's no realistic NZ-tradie fixture
 * data to display. The "demo" framing for a stakeholder watching
 * --headed is: see that user B canNOT see A's invoice, even with the
 * direct URL. That IS the demo.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { registerEphemeralUser, testDataName } from '../helpers/test-data';
import {
  SECURITY_HEADERS,
  PUBLIC_PAGES,
  AUTHED_PAGES,
  getHeader,
} from './helpers/cross-cutting';

const API_URL = process.env.PROD_API_URL || process.env.API_URL || 'http://localhost:29000';

// ===========================================================================
// F-X-01 — Multi-tenant isolation (WEB SURFACE)
// ===========================================================================

test.describe('F-X-01 multi-tenant isolation (web surface)', () => {
  test('F-X-01: Tradie B signed into the web app cannot view Tradie A\'s invoice by direct URL', async ({ page, context }) => {
    // We need an API context to provision the two users + A's invoice.
    // Then we hand B's session cookie to the page and navigate to /invoices/<A-id>.
    const apiRequest = await playwrightRequest.newContext();
    let a: Awaited<ReturnType<typeof registerEphemeralUser>> | null = null;
    let b: Awaited<ReturnType<typeof registerEphemeralUser>> | null = null;
    try {
      a = await registerEphemeralUser(apiRequest, API_URL, 'xweb-a');
      b = await registerEphemeralUser(apiRequest, API_URL, 'xweb-b');

      // A creates a tagged invoice via the API (faster than the web UI;
      // the web UI for invoice CREATE is covered by F-INV-01 demo).
      const invoiceTag = testDataName('xweb-iso-invoice');
      const createRes = await apiRequest.post(`${API_URL}/api/v1/invoices`, {
        headers: { Authorization: `Bearer ${a.accessToken}` },
        data: {
          clientName: invoiceTag.tag,
          clientEmail: invoiceTag.email,
          jobDescription: 'F-X-01 web-surface isolation probe',
          lineItems: [{ description: 'Web isolation test', amount: 9999 }],
          includeGst: true,
        },
        failOnStatusCode: false,
      });
      expect(createRes.status(), `create invoice for A: ${await createRes.text()}`).toBe(201);
      const invoiceA = (await createRes.json())?.data?.invoice;
      const invoiceAId: string = invoiceA?.id;
      expect(invoiceAId, 'invoice A id').toBeTruthy();

      // Sign B into the web app. We do this by setting the access-token
      // cookie directly — same shape as apps/web/src/lib/auth/login flow
      // (cookie name = ACCESS_TOKEN_COOKIE in apps/web/src/lib/constants).
      // We don't strictly need to call /login because the middleware
      // only checks cookie presence.
      //
      // Use process.env.PLAYWRIGHT_BASE_URL → page url fallback. The
      // playwright config sets baseURL='http://localhost:3000' but it's
      // not exposed on a public API of the context object.
      const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
      const baseHost = new URL(baseURL).hostname;
      await context.addCookies([
        {
          name: 'access_token',  // matches ACCESS_TOKEN_COOKIE constant
          value: b.accessToken,
          domain: baseHost,
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      // B navigates directly to A's invoice URL. The web invoice detail
      // page calls the API with B's token; the API must scope by user_id
      // and the page must render a not-found / forbidden state — NEVER
      // A's clientName.
      const response = await page.goto(`/invoices/${invoiceAId}`, { waitUntil: 'domcontentloaded' });
      // Accept any of: 200-with-error-state, 404 page, or redirect to a
      // not-found page. The CRITICAL assertion is that A's tagged client
      // name is NOT rendered anywhere on the page.
      const bodyText = await page.locator('body').innerText();
      expect(
        bodyText.includes(invoiceTag.tag),
        `P0 WEB LEAK: B\'s view of /invoices/${invoiceAId} contains A\'s clientName tag "${invoiceTag.tag}". ` +
          `Page text excerpt: ${bodyText.slice(0, 500)}`,
      ).toBe(false);

      // Soft assertion on the HTTP status — record but don't fail if the
      // app chooses a different not-found UX (200-with-empty-state is
      // also valid).
      if (response) {
        const status = response.status();
        test.info().annotations.push({
          type: 'note',
          description: `B GET /invoices/${invoiceAId} HTTP ${status}`,
        });
      }
    } finally {
      if (a) await a.cleanup();
      if (b) await b.cleanup();
      await apiRequest.dispose();
    }
  });
});

// ===========================================================================
// F-X-03 — Security headers / CSP
// ===========================================================================

test.describe('F-X-03 security headers', () => {
  for (const path of PUBLIC_PAGES) {
    test(`F-X-03: ${path} response headers (regression guard)`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response, `no response for ${path}`).toBeTruthy();
      // page.goto can return null for same-document navigations; guard.
      if (!response) return;

      const headers = response.headers();

      for (const spec of SECURITY_HEADERS) {
        const value = getHeader(headers, spec.name);

        if (spec.mode === 'required') {
          expect(value, `${spec.name} missing on ${path}: ${spec.rationale}`).toBeTruthy();
          if (spec.policy) {
            expect(value, `${spec.name} value mismatch on ${path}`).toMatch(spec.policy);
          }
        } else if (spec.mode === 'recommended') {
          // Same as required for this codebase right now — fail loud.
          expect(value, `${spec.name} missing on ${path}: ${spec.rationale}`).toBeTruthy();
        } else {
          // 'aspirational': record state without failing. The annotation
          // surfaces in Playwright HTML report so the next dev sees the
          // target state next time they touch next.config.ts.
          test.info().annotations.push({
            type: 'security-header-target',
            description: `${path} ${spec.name}=${value ?? 'MISSING'} (target: ${spec.rationale})`,
          });
        }
      }
    });
  }

  for (const path of AUTHED_PAGES) {
    test(`F-X-03: ${path} (unauthed → redirected to /login) sets cookies but should also set security headers`, async ({ page }) => {
      // Hitting /dashboard without auth redirects to /login per
      // middleware.spec.ts. We follow the redirect and assert headers on
      // the final response (the login page).
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response, `no response for ${path}`).toBeTruthy();
      if (!response) return;

      // Final URL should be /login per middleware.ts behaviour.
      await expect(page).toHaveURL(/\/login/);

      const headers = response.headers();
      for (const spec of SECURITY_HEADERS) {
        const value = getHeader(headers, spec.name);
        if (spec.mode === 'required' || spec.mode === 'recommended') {
          expect(value, `${spec.name} missing on ${path}→/login: ${spec.rationale}`).toBeTruthy();
          if (spec.mode === 'required' && spec.policy) {
            expect(value).toMatch(spec.policy);
          }
        } else {
          test.info().annotations.push({
            type: 'security-header-target',
            description: `${path}→/login ${spec.name}=${value ?? 'MISSING'} (target: ${spec.rationale})`,
          });
        }
      }
    });
  }

  test('F-X-03: landing page (/) does not leak legacy "TradeMate" brand string', async ({ page }) => {
    // Per CLAUDE.md brand-rename guidance, customer-facing surfaces must
    // say "BossBoard" not "TradeMate". This is also covered visually by
    // branding.spec.ts (title) — this assertion is the FULL-BODY scan
    // that catches stale copy outside the <title>.
    await page.goto('/');
    const bodyText = await page.locator('body').innerText();
    // Allow case-insensitive — copywriters sometimes write trademate-style
    // legacy text in different casings.
    expect(
      /trademate/i.test(bodyText),
      `Landing page leaks legacy "TradeMate" string. Excerpt: ${bodyText.slice(0, 500)}`,
    ).toBe(false);
  });
});
