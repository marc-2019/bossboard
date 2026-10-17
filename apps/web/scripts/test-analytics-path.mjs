// Exercise the actual pure helper and browser integration in an isolated context.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/klaro/analytics.js', import.meta.url), 'utf8');
const helper = { module: { exports: {} } };
vm.runInNewContext(source, helper);
const { sanitizeAnalyticsPath, isSensitiveAnalyticsUrl } = helper.module.exports;
for (const value of ['/invite/private-code', '/invite/private-code?secret=value#fragment', '/invite/private-code/?x=1']) {
  assert.equal(sanitizeAnalyticsPath(value), '/invite/:code');
}
assert.equal(sanitizeAnalyticsPath('https://app.test/invite/private-code?q=1'), 'https://app.test/invite/:code');
assert.equal(sanitizeAnalyticsPath('/teams?q=1'), '/teams?q=1');
const sensitiveUrls = [
  '/login?redirect=%2Finvite%2Fabc123',
  '/register?redirect=%2Finvite%2Fabc123',
  '/login?returnTo=%252Finvite%252Fabc123',
  '/login?next=%25252Finvite%25252Fabc123',
  '/login?callbackUrl=https%3A%2F%2Fapp.test%2Finvite%2Fabc123',
  '/login?custom=/invite/abc123&keep=yes',
  '/login#redirect=%252Finvite%252Fabc123',
  '/login#/invite/abc123',
  '/%2569nvite%252Fabc123',
];
for (const value of sensitiveUrls) {
  const sanitized = sanitizeAnalyticsPath(value);
  assert.ok(!sanitized.includes('abc123'), value);
  assert.ok(sanitized.includes(':code') || sanitized.includes('%3Acode'), value);
}
assert.equal(sanitizeAnalyticsPath('/login?redirect=%2Fteams%3Ftab%3Dmembers#help'),
  '/login?redirect=%2Fteams%3Ftab%3Dmembers#help');
assert.equal(sanitizeAnalyticsPath('/login?redirect=%2Finvite%2Fabc123&keep=yes'),
  '/login?redirect=%2Finvite%2F%3Acode&keep=yes');
for (const value of sensitiveUrls) {
  let loads = 0;
  const url = new URL(value, 'https://app.test');
  const window = { location: { pathname: url.pathname, search: url.search, hash: url.hash, href: url.href } };
  const document = {
    title: 'BossBoard', referrer: `https://app.test${value}`,
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => loads++ } }],
    createElement: () => ({}), addEventListener: () => {},
  };
  vm.runInNewContext(source, { window, document });
  window.gtag('event', 'page_view', { referrer: `https://app.test${value}` });
  const config = window.dataLayer.find(row => row[0] === 'config');
  assert.equal(loads, isSensitiveAnalyticsUrl(url) ? 0 : 1);
  assert.equal(Boolean(config), !isSensitiveAnalyticsUrl(url));
  if (config) assert.equal(config[2].send_page_view, false);
  for (const row of window.dataLayer.filter(row => ['event', 'config'].includes(row[0]))) {
    for (const field of ['page_path', 'page_location', 'page_referrer']) {
      assert.equal(typeof row[2][field], 'string');
      assert.ok(!row[2][field].includes('abc123'), `${value}: ${field}`);
    }
    assert.ok(!JSON.stringify(row).includes('abc123'), value);
  }
}
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

for (const path of ['/invite/', '/invite/code/nested', ...sensitiveUrls.slice(0, -1),
  '/forgot-password?anything=%2Finvite%2F', '/reset-password#/invite/code',
  '/auth/callback?url=%25252Finvite%25252Fcode']) {
  assert.equal(isSensitiveAnalyticsUrl(new URL(path, 'https://app.test')), true, path);
}
for (const path of ['/login', '/register?redirect=/teams', '/teams?next=/invite/code',
  '/login?invite=/teams', '/login?next=%broken', '/login?/invite/code=benign']) {
  assert.equal(isSensitiveAnalyticsUrl(new URL(path, 'https://app.test')), false, path);
}
// An already-loaded integration must suppress every event and config on entry.
{
  const window = { location: new URL('/teams', 'https://app.test') };
  const document = { title: 'Teams', referrer: '', addEventListener() {},
    createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }] };
  vm.runInNewContext(source, { window, document });
  for (const path of ['/invite/code/nested', '/login?next=%252Finvite%252Fcode', '/register#/invite/code']) {
    window.location = new URL(path, 'https://app.test');
    const before = window.dataLayer.length;
    window.gtag('event', 'custom_click', { secret: 'code' });
    window.gtag('config', 'test');
    assert.equal(window.dataLayer.length, before);
    assert.equal(window['ga-disable-G-83NPHN0QP5'], true);
  }
  window.location = new URL('/login', 'https://app.test');
  window.gtag('event', 'custom_click');
  assert.equal(window['ga-disable-G-83NPHN0QP5'], false);
}

console.log('analytics-path: all passed');
