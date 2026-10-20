import { test, expect } from '@playwright/test';

const invitePath = '/invite/test-code';

test('signed-out visitors go to login with the invite return address', async ({ page }) => {
  await page.goto(invitePath);
  await expect(page).toHaveURL(/\/login\?redirect=%2Finvite%2Ftest-code$/);
});

for (const matchesEmail of [false, true]) {
  test(`invite page handles ${matchesEmail ? 'matching' : 'mismatched'} accounts`, async ({ page, context }) => {
    await context.addCookies([{ name: 'bb_access_token', value: 'e2e-placeholder', url: 'http://localhost:3000' }]);
    let acceptCalls = 0;
    let loggedOut = false;
    await page.route('**/api/auth/me', route => route.fulfill({ json: {
      success: true, data: { user: { id: 'test-user', email: 'current@example.com', name: 'Test User' } },
    } }));
    await page.route('**/api/teams/invites/test-code', route => route.fulfill({ json: {
      success: true, data: { teamName: 'Builders', invitedEmail: matchesEmail ? 'current@example.com' : 'invited@example.com', matchesEmail },
    } }));
    await page.route('**/api/teams/invites/test-code/accept', route => {
      acceptCalls++;
      return route.fulfill({ json: { success: true, data: {} } });
    });
    await page.route('**/api/auth/logout', async route => {
      loggedOut = true;
      await context.clearCookies();
      await route.fulfill({ json: { success: true } });
    });
    await page.goto(invitePath);
    if (matchesEmail) {
      await expect(page).toHaveURL('/teams');
      expect(acceptCalls).toBe(1);
    } else {
      await expect(page.getByRole('status')).toHaveText("This invite was sent to invited@example.com. You're signed in as current@example.com.");
      expect(acceptCalls).toBe(0);
      await page.getByRole('button', { name: 'Switch account', exact: true }).click();
      await expect(page).toHaveURL(/\/login\?redirect=%2Finvite%2Ftest-code$/);
      expect(loggedOut).toBe(true);
      expect(acceptCalls).toBe(0);
    }
  });
}
