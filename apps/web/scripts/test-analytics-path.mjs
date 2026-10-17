// Exercise the actual pure helper and browser integration in an isolated context.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/klaro/analytics.js', import.meta.url), 'utf8');
const helper = { module: { exports: {} } };
vm.runInNewContext(source, helper);
const { sanitizeAnalyticsPath } = helper.module.exports;
for (const value of ['/invite/private-code', '/invite/private-code?secret=value#fragment', '/invite/private-code/?x=1']) {
  assert.equal(sanitizeAnalyticsPath(value), '/invite/:code');
}
assert.equal(sanitizeAnalyticsPath('https://app.test/invite/private-code?q=1'), 'https://app.test/invite/:code');
assert.equal(sanitizeAnalyticsPath('/teams?q=1'), '/teams?q=1');
for (const pathname of ['/invite/private-code', '/teams']) {
  let loads = 0;
  const window = { location: { pathname, search: '?x=1', href: `https://app.test${pathname}?x=1` } };
  const document = {
    title: 'BossBoard', referrer: 'https://app.test/invite/private-code?x=1',
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => loads++ } }],
    createElement: () => ({}), addEventListener: () => {},
  };
  vm.runInNewContext(source, { window, document });
  window.gtag('event', 'page_view');
  const views = window.dataLayer.filter(row => row[0] === 'event' && row[1] === 'page_view');
  assert.equal(views.length, pathname.startsWith('/invite/') ? 0 : 1);
  assert.equal(loads, pathname.startsWith('/invite/') ? 0 : 1);
  for (const row of window.dataLayer.filter(row => ['event', 'config'].includes(row[0]))) {
    assert.ok(!JSON.stringify(row).includes('private-code'));
  }
  window.location.pathname = '/invite/another-code';
  window.gtag('event', 'page_view');
  assert.equal(window.dataLayer.filter(row => row[0] === 'event').length, views.length);
}
console.log('analytics-path: all passed');
