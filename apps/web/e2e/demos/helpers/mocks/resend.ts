/**
 * Resend browser-side route mocks — Phase 6a (2026-05-23)
 *
 * BossBoard does not call api.resend.com from the browser — all email sends
 * are server-side via apps/api/src/services/email.ts, which is mocked at SDK
 * level by apps/api/src/services/mocks/resend-mock.ts when
 * MOCK_EXTERNAL_SERVICES=true.
 *
 * This module provides defence-in-depth interception in case a client-side
 * script ever directly fetches the Resend HTTP API. It also exposes a helper
 * for specs that want to assert "no Resend HTTP call was attempted from the
 * browser" — useful as a regression guard.
 */

import type { Page, Request } from '@playwright/test';

const interceptedRequests: Request[] = [];

/**
 * Install browser-side route handlers that intercept api.resend.com calls.
 * Returns a `getInterceptedRequests()` accessor for spec-side assertions.
 */
export async function installResendBrowserMocks(page: Page): Promise<{
  getInterceptedRequests: () => Request[];
  clearIntercepted: () => void;
}> {
  await page.route(/https:\/\/api\.resend\.com\/.*/, async (route, request) => {
    interceptedRequests.push(request);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `mocked-resend-${Date.now()}`,
        mocked: true,
        message: 'api.resend.com call intercepted by Playwright mock — Phase 6a',
      }),
    });
  });

  return {
    getInterceptedRequests: () => interceptedRequests.slice(),
    clearIntercepted: () => {
      interceptedRequests.length = 0;
    },
  };
}

export default { installResendBrowserMocks };
