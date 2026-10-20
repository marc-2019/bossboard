import assert from 'node:assert/strict';
import { safeRedirect } from '../src/lib/safe-redirect';

for (const target of [null, '', '//evil.test', '/\\evil.test', '\\evil.test', 'https://evil.test', 'https://app.test/teams', 'javascript:alert(1)', '/\nevil', '/\tevil', '/%5cevil', '/%2fevil', '/%00evil', '/%zz', '/a/..//evil.test']) {
  assert.equal(safeRedirect(target, 'https://app.test'), '/dashboard', String(target));
}
for (const target of ['/teams', '/invite/test-code', '/teams?q=one#members']) {
  assert.equal(safeRedirect(target, 'https://app.test'), target);
}
assert.equal(safeRedirect('/a/../teams', 'https://app.test'), '/teams');
console.log('safe-redirect.test.ts: all passed');
