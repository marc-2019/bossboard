/**
 * F-AUTH demos — Web (Playwright headed)
 *
 * One `test()` per feature ID (F-AUTH-01..05). Each test maps directly
 * to acceptance criteria in
 * `docs/testing/SPEC_AND_DEMOS_MATRIX.md` § Module 1 — Authentication.
 *
 * Surface coverage notes (matrix drift documented in Drift Appendix):
 *  - F-AUTH-03 (verify-email) — Web has NO `/verify-email` page. Web
 *    coverage is intentionally LIMITED to verifying the matrix-flagged
 *    drift (the page should exist but does not). Mobile + API carry
 *    the real flow.
 *  - F-AUTH-05 (onboarding wizard) — Web has NO `/onboarding` page.
 *    Web users onboard via `/settings` instead. This spec asserts the
 *    drift; full coverage is on Mobile + API.
 *
 * Execution model:
 *  - These tests are designed to run headed against a live web+api stack
 *    (workers=1, video=on per the demo config). When the env is not
 *    running, `npx playwright test ... --list` is the syntax-check
 *    proxy used by Phase 3 agents.
 *  - When live, page.route() is the planned hook for mocking outbound
 *    third-party calls (Resend, Stripe). Search for `TODO(phase5)` for
 *    the injection points.
 */

import { test, expect } from '@playwright/test';
import {
  demoTestData,
  demoPersona,
  cleanupUserByEmail,
  API_BASE_URL,
} from './helpers/auth';

test.describe('F-AUTH (Authentication module) — Web', () => {
  // ---------------------------------------------------------------------
  // F-AUTH-01 — Register account
  // ACs (from matrix):
  //  1. POST /auth/register with valid email+password+name returns 201
  //     + tokens + user.id.
  //  2. Duplicate email returns 409.       <-- API-only (covered in api.spec)
  //  3. Weak password (<8 chars) returns 400. <-- Web enforces via minlength
  //  4. Successful registration provisions a verification code.
  //  5. Web register screen collects email/password/name and on success
  //     routes onward (Web today: -> /dashboard; matrix mentions
  //     /verify-email but Web has no such page — drift item #1).
  // ---------------------------------------------------------------------
  test('F-AUTH-01: register account from /register form', async ({ page, request }) => {
    const data = demoTestData('auth01');
    const persona = demoPersona('auth01');
    let cleanupToken: string | undefined;

    try {
      // TODO(phase5): once Resend mock is wired, set up page.route() here
      // to intercept the verification-email send (`/emails` to api.resend.com).

      await page.goto('/register');

      // AC5 — form is the register form with name/email/password fields.
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await expect(page.getByLabel('Name')).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();

      // AC3 — minlength=8 enforced client-side.
      await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '8');

      // AC5 — fill realistic NZ-tradie persona; submit.
      await page.getByLabel('Name').fill(persona.name);
      await page.getByLabel('Email').fill(data.email);
      await page.getByLabel('Password').fill(data.password);
      await page.getByRole('button', { name: 'Create account' }).click();

      // AC1 / AC5 — successful submit either lands on /dashboard (current
      // Web behaviour) or /verify-email (matrix-aspirational). Either is
      // acceptable as a green-state assertion; failure ends up still on
      // /register with an error banner. We use a regex that allows either
      // landing page.
      await expect(page).toHaveURL(/\/(dashboard|verify-email)/);

      // AC4 — the register endpoint should have set tokens for the user.
      // We can confirm the auth session exists by hitting /api/auth/me
      // via the page's cookie context.
      const meRes = await page.request.get('/api/auth/me');
      expect(meRes.status()).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.data?.user?.email).toBe(data.email);

      // Stash the access token for cleanup (Web stores it in a cookie
      // managed by the Next proxy — we use the API helper as fallback).
      cleanupToken = meBody.data?.tokens?.accessToken;
    } finally {
      // Best-effort teardown. The global e2e sweep is the safety net.
      await cleanupUserByEmail(request, API_BASE_URL, cleanupToken);
    }
  });

  // ---------------------------------------------------------------------
  // F-AUTH-02 — Login
  // ACs:
  //  1. POST /auth/login with correct credentials returns tokens.   (api)
  //  2. Wrong password returns 401.                                  (api)
  //  3. Refresh issues a new access token.                          (api)
  //  4. Logout invalidates the refresh token.                       (api)
  //  5. Web login screen stores tokens + routes to /dashboard.       (this)
  // ---------------------------------------------------------------------
  test('F-AUTH-02: login from /login form routes to dashboard', async ({ page, request }) => {
    // Setup: register a user via the API so the login form has a real
    // account to authenticate against.
    const data = demoTestData('auth02');
    const persona = demoPersona('auth02');
    let cleanupToken: string | undefined;

    try {
      const regRes = await request.post(`${API_BASE_URL}/api/v1/auth/register`, {
        data: {
          email: data.email,
          password: data.password,
          name: persona.name,
          tradeType: persona.tradeType,
          businessName: persona.businessName,
        },
        failOnStatusCode: false,
      });
      expect([200, 201]).toContain(regRes.status());
      const regBody = await regRes.json();
      cleanupToken = regBody?.data?.tokens?.accessToken;

      // Drive the login form.
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

      await page.getByLabel('Email').fill(data.email);
      await page.getByLabel('Password').fill(data.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // AC5 — successful login routes to /dashboard.
      await expect(page).toHaveURL(/\/dashboard/);

      // AC5 (session persisted) — reload, still authenticated.
      await page.reload();
      await expect(page).toHaveURL(/\/dashboard/);
    } finally {
      await cleanupUserByEmail(request, API_BASE_URL, cleanupToken);
    }
  });

  // ---------------------------------------------------------------------
  // F-AUTH-03 — Email verification (6-digit code)
  // ACs 1–4 are API-only (no Web verify page). AC5 (feature gates) is
  // also API-driven. Web-side, all we can verify is the DRIFT: there is
  // no /verify-email page today. Phase 3 surfaces this for Phase 4's
  // executive gap report.
  // ---------------------------------------------------------------------
  test('F-AUTH-03: web drift — /verify-email page is not present', async ({ page }) => {
    // The Next.js app does not have an /verify-email route. Navigating
    // returns the framework's 404. We assert that explicitly so the
    // matrix drift item #1 is automation-tracked, not just documentation.
    const res = await page.goto('/verify-email', { waitUntil: 'domcontentloaded' });
    // Next 14 renders /404 with status 404 for unknown app-router pages.
    // Some hosts return 200 with an in-page 404 component. Accept either
    // form; the load-bearing assertion is "no real verify-email form".
    const status = res?.status();
    if (status && status !== 404) {
      // If it resolved 200, confirm the page is the 404 fallback, NOT a
      // real verify-email form.
      await expect(page.getByRole('button', { name: /verify/i })).toHaveCount(0);
    } else {
      expect(status).toBe(404);
    }
  });

  // ---------------------------------------------------------------------
  // F-AUTH-04 — Password reset (6-digit code)
  // ACs:
  //  1. POST /auth/forgot-password returns 200 for any email.       (api)
  //  2. Reset code TTL-bounded.                                       (api)
  //  3. POST /auth/reset-password updates the hash.                  (api)
  //  4. Old pw fails / new pw works after reset.                    (api)
  //  5. Web has forgot-password + reset-password screens that drive
  //     the API.                                                    (this)
  // ---------------------------------------------------------------------
  test('F-AUTH-04: forgot-password flow drives /reset-password screen', async ({ page }) => {
    // Use a benign nonexistent email — backend returns the same shape
    // regardless (anti-enumeration), so no setup or teardown needed.
    const email = demoTestData('auth04').email;

    // Step 1 — open forgot-password.
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset code' }).click();

    // AC5 — success message is privacy-safe (if-an-account-exists copy).
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();

    // AC5 — "Enter reset code" CTA navigates to /reset-password with
    // the email pre-filled via query param.
    await page.getByRole('link', { name: 'Enter reset code' }).click();
    await expect(page).toHaveURL(/\/reset-password\?email=/);
    await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveValue(email);
    await expect(page.getByLabel('6-digit code')).toBeVisible();
    await expect(page.getByLabel('New password')).toBeVisible();
    await expect(page.getByLabel('Confirm new password')).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // F-AUTH-05 — Onboarding wizard (trade type, company, bank)
  // ACs 1–3 (API) + AC4 (Mobile wizard) covered elsewhere. AC5 (resume
  // mid-flow) is best tested on Mobile. Web's onboarding is NOT a
  // dedicated wizard — it lives in /settings. This test verifies the
  // matrix drift (item #2): /onboarding 404s on Web.
  // ---------------------------------------------------------------------
  test('F-AUTH-05: web drift — /onboarding wizard page is not present', async ({ page }) => {
    const res = await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    const status = res?.status();
    if (status && status !== 404) {
      // If 200, confirm it is the 404 fallback (no real wizard UI).
      await expect(page.getByText(/step\s*1\s*of\s*3/i)).toHaveCount(0);
    } else {
      expect(status).toBe(404);
    }
  });
});
