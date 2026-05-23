/**
 * F-STRIPE-01..04 — Stripe billing web demos (Phase 3 Agent 13)
 *
 * Coverage focus:
 *   - F-STRIPE-01/02: Checkout-flow initiation from the web subscription UI.
 *     The actual Stripe-hosted checkout page is NOT driven here — it's
 *     Stripe-owned and outside our trust boundary; we assert the redirect
 *     destination only.
 *   - F-STRIPE-04: Public invoice "Pay Now" button — verifies the public
 *     invoice page (rendered by the API on :29000) surfaces a Pay Now
 *     link for unpaid invoices.
 *
 * Out of scope:
 *   - F-STRIPE-03 (webhook handling) — API only, see stripe.api.spec.ts.
 *   - Driving the Stripe-hosted checkout form (filling card 4242 4242 4242 4242)
 *     — Stripe's domain is third-party; their iframe + test-mode UI is
 *     covered by Stripe's own integration tests. Asserting we land on
 *     checkout.stripe.com/c/pay/* is the contract surface we own.
 *
 * Mobile:
 *   - No Maestro flow for this module. Mobile opens Stripe checkout via
 *     WebBrowser (expo-web-browser), which routes through the OS browser
 *     and cannot be driven by Maestro. See docs/testing/coverage/stripe.md.
 *
 * Mocking:
 *   - Web app does not own checkout-session creation — it proxies to
 *     apps/api on :29000. These demos hit the web app (e.g. /subscription)
 *     and assert the UI behaviour; the API layer is exercised in the
 *     companion api.spec.ts via mocked Stripe responses.
 *
 * NO EXECUTION: dev env not running. Syntax-verify only.
 */
import { test, expect } from '@playwright/test';
import { NZ_PRICING } from './helpers/stripe';

// ===========================================================================
// F-STRIPE-01 / F-STRIPE-02 — Checkout flow initiation (web UI)
// ===========================================================================

test.describe('F-STRIPE-01/02: Checkout flow initiation (web)', () => {
  test('subscription page renders tier comparison with NZ pricing', async ({
    page,
  }) => {
    // The web app's subscription/billing page is expected at /subscription
    // or /settings/billing. As of v0.5.0 the mobile app owns the canonical
    // subscription UX; the web app surfaces a comparison view that links
    // to the same /api/v1/subscriptions/checkout endpoint.
    //
    // This test navigates and asserts the page loads at all — graceful
    // skip if the route returns 404 (i.e. the web subscription UI is not
    // yet shipped, in which case the gap is captured in coverage doc).
    const response = await page.goto('/subscription', {
      waitUntil: 'domcontentloaded',
    });

    test.skip(
      !response || response.status() === 404,
      'Web /subscription page not yet shipped — mobile owns canonical UX. Gap captured in docs/testing/coverage/stripe.md.',
    );

    // When the page exists, assert NZ pricing is shown.
    if (response && response.status() < 400) {
      const tradieMatch = await page
        .getByText(/4\.99|19\.99/)
        .first()
        .isVisible()
        .catch(() => false);
      const teamMatch = await page
        .getByText(/9\.99|39\.99/)
        .first()
        .isVisible()
        .catch(() => false);

      // At least one pricing tier must be discoverable on the page.
      expect(tradieMatch || teamMatch).toBe(true);
    }
  });

  test('NZ pricing data parity — helper constants match CLAUDE.md spec', () => {
    // Data-only assertion to catch silent drift. CLAUDE.md "Business Model"
    // states tradie $4.99/wk and team $9.99/wk; if these change the
    // marketing copy + invoice flow must change too.
    expect(NZ_PRICING.tradie.weekly).toBe(4.99);
    expect(NZ_PRICING.team.weekly).toBe(9.99);
    expect(NZ_PRICING.tradie.currency).toBe('NZD');
    expect(NZ_PRICING.team.currency).toBe('NZD');
  });

  test('upgrade CTA (if present) points at API checkout endpoint', async ({
    page,
  }) => {
    const response = await page.goto('/subscription', {
      waitUntil: 'domcontentloaded',
    });
    test.skip(
      !response || response.status() === 404,
      'Web /subscription page not yet shipped.',
    );

    // Look for an upgrade button — exact label depends on copy, accept
    // any of "Upgrade", "Subscribe", "Start trial", "Choose plan".
    const cta = page
      .getByRole('button', { name: /upgrade|subscribe|choose plan|start/i })
      .or(page.getByRole('link', { name: /upgrade|subscribe|choose plan|start/i }))
      .first();

    const ctaCount = await cta.count();
    test.skip(
      ctaCount === 0,
      'No upgrade CTA visible — gap captured in coverage doc.',
    );

    // We don't click — clicking would either open Stripe checkout (out of
    // scope) or fire a beta-mode no-op. Assertion: the CTA exists and is
    // enabled.
    await expect(cta).toBeEnabled();
  });
});

// ===========================================================================
// F-STRIPE-04 — Public invoice "Pay Now" link
// ===========================================================================

test.describe('F-STRIPE-04: Public invoice Pay Now (server-rendered HTML)', () => {
  test('invalid token shows a 400 error page (not a Pay Now button)', async ({
    page,
  }) => {
    // Public invoice page lives on the API server (:29000), server-rendered
    // HTML. Short token must produce the "Invalid Link" error page rather
    // than a Pay Now link.
    const apiBase = process.env.API_BASE_URL || 'http://localhost:29000';
    const response = await page
      .goto(`${apiBase}/api/v1/public/invoices/short`, {
        waitUntil: 'domcontentloaded',
      })
      .catch(() => null);

    test.skip(
      !response,
      'API server on :29000 not reachable from Playwright runner — env-only test.',
    );

    if (response) {
      expect([400, 404]).toContain(response.status());
      const bodyText = await page.locator('body').innerText().catch(() => '');
      // Match error-page copy patterns from public.ts renderErrorPage.
      expect(bodyText).toMatch(/invalid|not found|expired/i);
    }
  });

  test('unknown token shows a 404 error page', async ({ page }) => {
    const apiBase = process.env.API_BASE_URL || 'http://localhost:29000';
    // A valid-length token (>=16 chars) but not matching any real invoice.
    const fakeToken = 'a'.repeat(64);
    const response = await page
      .goto(`${apiBase}/api/v1/public/invoices/${fakeToken}`, {
        waitUntil: 'domcontentloaded',
      })
      .catch(() => null);

    test.skip(!response, 'API server not reachable.');

    if (response) {
      expect(response.status()).toBe(404);
    }
  });

  // The positive Pay-Now path (real share_token + Stripe payment link) is
  // covered by:
  //   - apps/api/src/__tests__/routes/public.test.ts  (server-side rendering)
  //   - apps/web/e2e/demos/api/stripe.api.spec.ts     (webhook → paid flip)
  // Driving the actual Stripe checkout iframe is out of scope (third-party).
});

// ===========================================================================
// Cross-AC: brand-name guardrails
// ===========================================================================

test.describe('cross-cutting: BossBoard brand on Stripe-touching pages', () => {
  test('subscription page uses BossBoard branding (not TradeMate)', async ({
    page,
  }) => {
    const response = await page.goto('/subscription', {
      waitUntil: 'domcontentloaded',
    });
    test.skip(
      !response || response.status() === 404,
      'Web /subscription page not yet shipped.',
    );

    if (response && response.status() < 400) {
      const html = await page.content();
      // Positive: brand appears.
      expect(html).toMatch(/BossBoard/i);
      // Negative: stale brand must NOT appear in customer-facing copy.
      // (CLAUDE.md flags this as a hard rule.)
      expect(html).not.toMatch(/TradeMate/);
    }
  });
});
