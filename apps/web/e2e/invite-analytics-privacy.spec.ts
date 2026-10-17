import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const code = 'testcode123abc';
const analyticsHost = /(^|\.)(google-analytics\.com|googletagmanager\.com)$/i;

async function captureAnalytics(page: Page, context: BrowserContext, baseURL: string) {
  await context.addCookies([{
    name: 'klaro', value: encodeURIComponent(JSON.stringify({ 'google-analytics': true })),
    url: baseURL,
  }]);
  const requests: { url: string; postData: string }[] = [];
  page.on('request', request => {
    if (analyticsHost.test(new URL(request.url()).hostname)) {
      requests.push({ url: request.url(), postData: request.postData() || '' });
    }
  });
  // Intercept every Google analytics/tag-manager request; never send real traffic.
  await page.route(url => analyticsHost.test(url.hostname), route => route.fulfill({ status: 204 }));
  return requests;
}

for (const path of [
  `/invite/${code}`,
  `/login?redirect=%2Finvite%2F${code}`,
  `/verify-email?redirect=%2Finvite%2F${code}`,
  `/register?redirect=%2Finvite%2F${code}`,
]) {
  test(`analytics stays unloaded with consent on ${path}`, async ({ page, context, baseURL }) => {
    const requests = await captureAnalytics(page, context, baseURL!);
    await page.goto(path);
    await page.waitForFunction(() => Boolean((window as unknown as { klaroConfig?: unknown }).klaroConfig));
    // Allow deferred consent callbacks and script loading to run.
    await page.waitForTimeout(1000);
    for (const request of requests) {
      expect(request.url + request.postData).not.toContain(code);
    }
    expect(requests).toEqual([]);
  });
}

test('benign login requests the GA script with consent', async ({ page, context, baseURL }) => {
  const requests = await captureAnalytics(page, context, baseURL!);
  await page.goto('/login');
  await page.waitForFunction(() => Boolean((window as unknown as { klaroConfig?: unknown }).klaroConfig));
  const configured = await page.evaluate(() => {
    const dataLayer = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer || [];
    return dataLayer.some(row => row[0] === 'config' && typeof row[1] === 'string' && /^G-/.test(row[1]));
  });
  test.skip(!configured, 'No GA measurement ID configured');
  await expect.poll(() => requests.some(request =>
    new URL(request.url).hostname.endsWith('googletagmanager.com') &&
    new URL(request.url).pathname === '/gtag/js')).toBe(true);
});
