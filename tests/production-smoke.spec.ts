import { test, expect } from '@playwright/test';

/**
 * Narrow production smoke — asserts the BossBoard production API
 * returns JSON and not an HTML 502. This is intentionally a thin canary for
 * the 2026-04-13 class of outage (Railway edge / proxy returning an HTML
 * error page while the upstream Express app was down or misconfigured), and
 * is the minimum required to catch that regression before users do.
 *
 * The fuller web-based flow (landing page, signup → login → dashboard) lives
 * at `apps/web/e2e/production-smoke.spec.ts`. Run this file first; it has no
 * browser deps and fails fast on edge-level breakage.
 *
 * Target:
 *   PROD_API_URL (defaults to https://api.instilligent.com)
 *
 * Run:
 *   npx playwright test tests/production-smoke.spec.ts \
 *     --config=playwright.smoke.config.ts
 */

const API_URL = process.env.PROD_API_URL || 'https://api.instilligent.com';

test.describe('BossBoard production API — JSON contract', () => {
  test('GET /health returns 200 JSON, not an HTML 502', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);

    expect(res.status(), `expected 200 from ${API_URL}/health, got ${res.status()}`).toBe(200);
    expect(res.status()).not.toBe(502);

    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType, `expected JSON content-type, got "${contentType}"`).toMatch(/application\/json/);

    const body = await res.text();
    expect(body.trim().startsWith('<'), 'body looks like HTML, not JSON').toBe(false);

    const json = JSON.parse(body);
    expect(json.status).toBe('healthy');
  });

  test('POST /api/v1/auth/login rejects bad creds with JSON 401, not HTML 502', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: 'smoke-bad-creds@instilligent.com', password: 'definitely-not-real-xyz' },
      failOnStatusCode: false,
    });

    expect(res.status()).not.toBe(502);
    expect([400, 401, 404, 422]).toContain(res.status());

    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/application\/json/);

    const body = await res.text();
    expect(body.trim().startsWith('<'), 'body looks like HTML, not JSON').toBe(false);

    const json = JSON.parse(body);
    expect(json).toHaveProperty('success', false);
  });
});
