/**
 * Stripe browser-side route mocks — Phase 6a (2026-05-23)
 *
 * Most Stripe interactions in BossBoard go via the server (createCheckoutSession
 * → server SDK → /webhooks/stripe), and those are mocked at SDK level by
 * apps/api/src/services/mocks/stripe-mock.ts when MOCK_EXTERNAL_SERVICES=true.
 *
 * This module handles the small subset that originates in the browser:
 *   1. The redirect to checkout.stripe.com after createCheckoutSession returns
 *      a `url`. We can't sandbox real Stripe-hosted pages, so we substitute a
 *      local stub page that simulates the success redirect back to the app.
 *   2. Direct fetches to api.stripe.com from any client-side code (none today,
 *      but the guard is here for defence-in-depth).
 *
 * Usage in a Playwright spec:
 *   import { installStripeBrowserMocks } from './helpers/mocks/stripe';
 *   test.beforeEach(async ({ page }) => {
 *     await installStripeBrowserMocks(page);
 *   });
 */

import type { Page } from '@playwright/test';

/**
 * Install browser-side route handlers that intercept Stripe-hosted URLs.
 *
 * For checkout.stripe.com pages, we fulfil with a minimal HTML stub that
 * exposes the same observable behaviour (a "Pay" button that redirects to
 * the success_url) without ever loading Stripe assets.
 */
export async function installStripeBrowserMocks(page: Page): Promise<void> {
  // Intercept checkout.stripe.com — the hosted checkout page.
  await page.route(/https:\/\/checkout\.stripe\.com\/.*/, async (route) => {
    const url = new URL(route.request().url());
    // Try to recover a useful success_url from the session ID embedded in the
    // path; otherwise default to a recognisable demo-success page.
    const sessionId = url.pathname.split('/').pop() ?? 'cs_test_mock_unknown';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Stripe Checkout (MOCKED)</title>
</head>
<body style="font-family: -apple-system, sans-serif; padding: 32px; max-width: 480px; margin: 0 auto;">
  <h1>Stripe Checkout (mocked)</h1>
  <p>Session: <code data-testid="mock-session-id">${sessionId}</code></p>
  <p>This is a Playwright mock of the Stripe-hosted checkout page.
     No real charge will occur.</p>
  <button id="mock-pay-button" data-testid="mock-pay-button"
          style="background: #635BFF; color: #fff; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px;">
    Simulate successful payment
  </button>
  <script>
    document.getElementById('mock-pay-button').addEventListener('click', () => {
      // Bossboard's e2e harness can listen for this navigation OR drive it
      // via window.history. Tests that need the post-pay UI should call
      // page.goto(successUrl) directly after clicking, since we can't read
      // the real success_url from this stub page reliably.
      window.dispatchEvent(new CustomEvent('mock-stripe-paid', { detail: { sessionId: '${sessionId}' } }));
    });
  </script>
</body>
</html>`;

    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: html,
    });
  });

  // Intercept any direct api.stripe.com fetch (defence-in-depth — no client
  // code is expected to call this).
  await page.route(/https:\/\/api\.stripe\.com\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mocked: true,
        message: 'api.stripe.com call intercepted by Playwright mock — Phase 6a',
      }),
    });
  });

  // Intercept billing.stripe.com (billing portal hosted page) — same
  // strategy: render a stub.
  await page.route(/https:\/\/billing\.stripe\.com\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!DOCTYPE html><html><body>
        <h1>Stripe Billing Portal (mocked)</h1>
        <p data-testid="mock-billing-portal">This is a Playwright mock of the Stripe billing portal.</p>
      </body></html>`,
    });
  });
}

export default { installStripeBrowserMocks };
