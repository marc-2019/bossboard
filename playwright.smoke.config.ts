import { defineConfig } from '@playwright/test';

/**
 * Root-level Playwright config for the narrow production smoke at
 * `tests/production-smoke.spec.ts`. Kept deliberately lean: no webServer, no
 * browser (the tests use `request` only), one worker.
 *
 * The richer browser-based smoke suite lives under `apps/web/` with its own
 * config — see `apps/web/playwright.smoke.config.ts`.
 *
 * Run:
 *   npx playwright test --config=playwright.smoke.config.ts
 *
 * Override target:
 *   PROD_API_URL=https://api-staging.instilligent.com \
 *     npx playwright test --config=playwright.smoke.config.ts
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['production-smoke.spec.ts'],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,

  reporter: 'list',

  use: {
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: false,
  },

  projects: [
    {
      name: 'api',
      use: {
        apiBaseUrl: 'https://api-staging.instilligent.com',
      },
    },
    {
      name: 'ai-swms',
      use: {
        enabled: true,
      },
    },
  ],

  webServer: undefined,
});
