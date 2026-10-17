import assert from 'node:assert/strict';
import { decideInviteFlow } from '../src/lib/invite-flow';

const info = { teamName: 'Builders', invitedEmail: 'invited@example.com', matchesEmail: false };
const mismatch = decideInviteFlow('test-code', 'current@example.com', info);
assert.equal(mismatch.action, 'mismatch');
assert.notEqual(mismatch.action, 'accept');
if (mismatch.action === 'mismatch') {
  assert.equal(mismatch.message, "This invite was sent to invited@example.com. You're signed in as current@example.com.");
  assert.equal(mismatch.loginUrl, '/login?redirect=%2Finvite%2Ftest-code');
}
assert.deepEqual(decideInviteFlow('test-code', null), { action: 'redirect', loginUrl: '/login?redirect=%2Finvite%2Ftest-code' });
assert.deepEqual(decideInviteFlow('test-code', 'invited@example.com', { ...info, matchesEmail: true }), { action: 'accept' });
assert.deepEqual(decideInviteFlow('test-code', 'current@example.com'), { action: 'load' });
for (const code of ['//evil.test', '../login', 'https://evil.test', String.fromCharCode(10)]) {
  const decision = decideInviteFlow(code, null);
  assert.equal(decision.action, 'redirect');
  if (decision.action === 'redirect') {
    const target = new URL(decision.loginUrl, 'https://app.test').searchParams.get('redirect')!;
    assert.equal(new URL(target, 'https://app.test').origin, 'https://app.test');
  }
}
console.log('invite-flow.test.ts: all passed');
