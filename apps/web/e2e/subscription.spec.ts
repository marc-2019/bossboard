import { test, expect } from '@playwright/test';

const subscription = { tier: 'free', stripeCustomerId: null, stripeSubscriptionId: null };
const limits = { invoicesPerMonth: 3, swmsPerMonth: 2, aiCallsPerMonth: 1, teamMembers: 5 };
const pricing = { free: { price: 0, period: 'forever' }, tradie: { price: 5, period: 'week', currency: 'NZD' }, team: { price: 10, period: 'week', currency: 'NZD' } };

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: 'bb_access_token', value: 'mock-session', url: 'http://127.0.0.1:3137' }]);
  // Reject all non-local requests, including analytics and real billing.
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:3137') return route.abort();
    return route.fallback();
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/auth/me' ? { user: { name: 'Test User', email: 'mock@example.test' } } :
      path === '/api/subscriptions/me' ? { subscription, betaMode: false } :
      path === '/api/subscriptions/tiers' ? { tiers: ['free', 'tradie', 'team'].map(tier => ({ ...limits, tier })), pricing, betaMode: false } : {};
    return route.fulfill({ json: { success: true, data } });
  });
});

test('settings link opens plans, Team click posts checkout and navigates to allowlisted mock URL', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'View plans and manage subscription' }).click();
  await expect(page.getByRole('heading', { name: 'Compare plans' })).toBeVisible();
  await expect(page.getByText('$10 NZD per week', { exact: true })).toBeVisible();
  await page.route('**/api/subscriptions/checkout', async route => {
    expect(route.request().postDataJSON()).toEqual({ tier: 'team' });
    await route.fulfill({ json: { success: true, data: { url: 'https://checkout.stripe.com/c/pay/mock' } } });
  });
  // Fulfil a synthetic page, never contact Stripe.
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock checkout destination</h1>' }));
  await page.getByRole('button', { name: 'Continue to Team checkout' }).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/mock');
  await expect(page.getByRole('heading', { name: 'Mock checkout destination' })).toBeVisible();
});

test('paid store subscriber cannot purchase again', async ({ page }) => {
  await page.route('**/api/subscriptions/me', route => route.fulfill({ json: { success: true, data: { subscription: { ...subscription, tier: 'tradie' }, betaMode: false } } }));
  await page.goto('/subscription');
  await expect(page.getByText('Current plan: tradie')).toBeVisible();
  await expect(page.getByRole('button', { name: /checkout/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage Stripe billing' })).toHaveCount(0);
  await expect(page.getByText(/where you subscribed/)).toBeVisible();
});

test('beta, error and unsafe URL responses stay on the page with accessible feedback', async ({ page }) => {
  for (const result of [
    { success: true, data: { betaMode: true } },
    { success: false, message: 'Unavailable' },
    { success: true, data: { url: 'https://checkout.stripe.com.evil.test/mock' } },
  ]) {
    await page.route('**/api/subscriptions/checkout', route => route.fulfill({ json: result }));
    await page.goto('/subscription');
    await page.getByRole('button', { name: 'Continue to Team checkout' }).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/subscription');
  }
});

test('unknown subscription cannot purchase, retry recovers', async ({ page }) => {
  await page.route('**/api/subscriptions/me', route => route.fulfill({ status: 503, json: { success: false } }));
  await page.goto('/subscription');
  await expect(page.locator('main').getByRole('alert')).toContainText('Could not load');
  await expect(page.getByRole('button', { name: /checkout/ })).toHaveCount(0);
  await page.unroute('**/api/subscriptions/me');
  await page.getByRole('button', { name: 'Refresh subscription details' }).click();
  await expect(page.getByRole('button', { name: 'Continue to Team checkout' })).toBeVisible();
});

test('return URLs never assert payment or tier activation', async ({ page }) => {
  await page.goto('/subscription?checkout=success');
  await expect(page.getByText('Current plan: free')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('only after payment confirmation is processed');
  await page.goto('/subscription?checkout=cancelled');
  await expect(page.getByRole('status')).toContainText('No plan change is confirmed here');
});

test('paid Stripe subscriber uses portal instead of checkout', async ({ page }) => {
  await page.route('**/api/subscriptions/me', route => route.fulfill({ json: { success: true, data: { subscription: { ...subscription, tier: 'team', stripeCustomerId: 'cus_mock', stripeSubscriptionId: 'sub_mock' }, betaMode: false } } }));
  await page.goto('/subscription');
  await expect(page.getByRole('button', { name: /checkout/ })).toHaveCount(0);
  await page.route('**/api/subscriptions/portal', route => route.fulfill({ json: { success: true, data: { url: 'https://billing.stripe.com/p/session/mock' } } }));
  await page.route('https://billing.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock portal destination</h1>' }));
  await page.getByRole('button', { name: 'Manage Stripe billing' }).click();
  await expect(page.getByRole('heading', { name: 'Mock portal destination' })).toBeVisible();
});
