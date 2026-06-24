import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // E2E test-data lifecycle safety net: sweep any leftover e2e-tagged
  // accounts (e2e-...@example.test) after the run. The web demo specs
  // register real ephemeral users via establishWebSession but assert against
  // page.route mocks, so they never DELETE their own account — this teardown
  // is the backstop the helpers have always documented. See e2e/global-teardown.ts.
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node ../../node_modules/next/dist/bin/next dev --port 3000',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
