/**
 * Anthropic Claude browser-side route mocks — Phase 6a (2026-05-23)
 *
 * BossBoard does not call api.anthropic.com from the browser — all Claude
 * calls are server-side via apps/api/src/services/claude.ts, which is mocked
 * at SDK level by apps/api/src/services/mocks/claude-mock.ts when
 * MOCK_EXTERNAL_SERVICES=true.
 *
 * This module provides defence-in-depth interception in case a client-side
 * script ever directly fetches the Anthropic API. It also fulfils with a
 * realistic-shaped Anthropic Messages API response so any future client-side
 * use would still receive something parseable.
 */

import type { Page, Request } from '@playwright/test';

const interceptedRequests: Request[] = [];

/**
 * Install browser-side route handlers that intercept api.anthropic.com calls.
 */
export async function installClaudeBrowserMocks(page: Page): Promise<{
  getInterceptedRequests: () => Request[];
  clearIntercepted: () => void;
}> {
  await page.route(/https:\/\/api\.anthropic\.com\/.*/, async (route, request) => {
    interceptedRequests.push(request);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `msg_mock_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        content: [
          {
            type: 'text',
            text: '[]',
          },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
        mocked: true,
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

export default { installClaudeBrowserMocks };
