import { defineConfig } from '@playwright/test';
// Entirely mocked local CI harness: no account setup/teardown or live API.
export default defineConfig({
  testDir: './e2e', testMatch: 'subscription.spec.ts', workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:3137', headless: true },
  webServer: {
    command: 'API_URL=http://127.0.0.1:9 BOSSBOARD_PUBLIC_ORIGIN=http://127.0.0.1:3137 node ../../node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3137',
    url: 'http://127.0.0.1:3137/login', reuseExistingServer: false, timeout: 90000,
  },
});
