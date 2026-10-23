import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionProxy } from '../subscription-proxy.ts';
import { safeStripeUrl, canStartCheckout } from '../subscription-checkout.ts';
import type { SubscriptionInfo } from '@bossboard/shared';

const free = { tier: 'free', stripeCustomerId: null, stripeSubscriptionId: null, startedAt: null, expiresAt: null } as SubscriptionInfo;
function harness(options: { token?: string | null; subscription?: SubscriptionInfo; result?: unknown; status?: number; broken?: boolean; meStatus?: number } = {}) {
  const calls: { path: string; init?: RequestInit }[] = [];
  return { calls, deps: {
    getToken: async () => options.token === undefined ? 'mock-token' : options.token,
    apiUrl: 'https://api.example.test',
    publicOrigin: 'https://bossboard.example.test',
    fetch: (async (url, init) => {
      calls.push({ path: String(url), init });
      if (String(url).endsWith('/me')) return Response.json({ success: !options.meStatus, data: { subscription: options.subscription ?? free } }, { status: options.meStatus ?? 200 });
      if (options.broken) return new Response('<html>unavailable</html>');
      return Response.json(options.result ?? { success: true, data: { url: 'https://checkout.stripe.com/c/pay/mock' } }, { status: options.status ?? 200 });
    }) as typeof fetch,
  } };
}
function request(origin: string | null = 'https://bossboard.example.test', body: unknown = { tier: 'team' }) {
  return new Request('https://bossboard.example.test/api/subscriptions/checkout', {
    method: 'POST', headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('requires session for tiers and checkout without forwarding anything', async () => {
  for (const action of ['tiers', 'checkout'] as const) {
    const h = harness({ token: null });
    assert.equal((await subscriptionProxy(request(), action, h.deps)).status, 401);
    assert.equal(h.calls.length, 0);
  }
});
test('rejects missing, cross-origin and cross-site mutation requests', async () => {
  for (const origin of [null, 'https://attacker.example.test']) {
    const h = harness();
    assert.equal((await subscriptionProxy(request(origin), 'checkout', h.deps)).status, 403);
    assert.equal(h.calls.length, 0);
  }
  const h = harness(); const req = request(); req.headers.set('sec-fetch-site', 'cross-site');
  assert.equal((await subscriptionProxy(req, 'portal', h.deps)).status, 403);
});
test('valid Free to Team checkout authenticates, replaces return URLs and emits only validated URL', async () => {
  const h = harness();
  const res = await subscriptionProxy(request(undefined, { tier: 'team', successUrl: 'https://evil.test' }), 'checkout', h.deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(h.calls.length, 2);
  assert.equal((h.calls[1].init?.headers as Record<string,string>).Authorization, 'Bearer mock-token');
  assert.deepEqual(JSON.parse(h.calls[1].init?.body as string), {
    tier: 'team', successUrl: 'https://bossboard.example.test/subscription?checkout=success',
    cancelUrl: 'https://bossboard.example.test/subscription?checkout=cancelled',
  });
  assert.deepEqual(await res.json(), { success: true, data: { url: 'https://checkout.stripe.com/c/pay/mock' } });
});
test('paid, store and existing Stripe subscriptions cannot start another purchase', async () => {
  for (const subscription of [{ ...free, tier: 'team' }, { ...free, tier: 'tradie' }, { ...free, stripeSubscriptionId: 'sub_mock' }] as SubscriptionInfo[]) {
    const h = harness({ subscription });
    assert.equal((await subscriptionProxy(request(), 'checkout', h.deps)).status, 409);
    assert.equal(h.calls.length, 1);
  }
  assert.equal(canStartCheckout(null), false);
});
test('unknown current subscription fails closed and never calls checkout', async () => {
  const h = harness({ meStatus: 500 });
  assert.equal((await subscriptionProxy(request(), 'checkout', h.deps)).status, 503);
  assert.equal(h.calls.length, 1);
});
test('invalid tier is rejected before upstream call', async () => {
  const h = harness();
  assert.equal((await subscriptionProxy(request(undefined, { tier: 'free' }), 'checkout', h.deps)).status, 400);
  assert.equal(h.calls.length, 0);
});
test('beta response never redirects even if it contains a URL', async () => {
  const h = harness({ result: { success: true, data: { betaMode: true, url: 'https://checkout.stripe.com/mock', message: 'mock private diagnostic' } } });
  const data = await (await subscriptionProxy(request(), 'checkout', h.deps)).json();
  assert.equal(data.data.betaMode, true); assert.equal(data.data.url, undefined);
  assert.ok(!JSON.stringify(data).includes('private diagnostic'));
});
test('rejects unsafe Stripe URLs and malformed/missing billing results', async () => {
  for (const url of ['http://checkout.stripe.com/x', 'https://checkout.stripe.com.evil.test/x', 'https://evil.test', 'javascript:alert(1)', 'https://user:pass@checkout.stripe.com/x', 'https://checkout.stripe.com:8443/x', '//checkout.stripe.com/x', undefined]) {
    assert.equal(safeStripeUrl(url, 'checkout'), null);
    const h = harness({ result: { success: true, data: { url } } });
    assert.equal((await subscriptionProxy(request(), 'checkout', h.deps)).status, 502);
  }
});
test('upstream failures are bounded and sanitized', async () => {
  for (const options of [{ status: 503, result: { success: false, message: 'mock sensitive detail' } }, { broken: true }]) {
    const h = harness(options); const res = await subscriptionProxy(request(), 'checkout', h.deps);
    assert.ok(res.status >= 500); assert.ok(!(await res.text()).includes('sensitive detail'));
  }
});
test('portal requires Stripe customer and validates billing hostname', async () => {
  const noCustomer = harness({ subscription: { ...free, tier: 'team' } });
  assert.equal((await subscriptionProxy(request(), 'portal', noCustomer.deps)).status, 409);
  const h = harness({ subscription: { ...free, tier: 'team', stripeCustomerId: 'cus_mock', stripeSubscriptionId: 'sub_mock' }, result: { success: true, data: { url: 'https://billing.stripe.com/p/session/mock' } } });
  const res = await subscriptionProxy(request(), 'portal', h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(h.calls[1].init?.body as string), { returnUrl: 'https://bossboard.example.test/subscription' });
  assert.equal(safeStripeUrl('https://checkout.stripe.com/x', 'portal'), null);
});


test('internal Next origin and forged forwarding headers never set browser or return origins', async () => {
  for (const action of ['checkout', 'portal'] as const) {
    const h = harness({ subscription: action === 'portal' ? { ...free, stripeCustomerId: 'cus_mock' } : free,
      result: { success: true, data: { url: action === 'portal' ? 'https://billing.stripe.com/p/session/mock' : 'https://checkout.stripe.com/c/pay/mock' } } });
    const req = new Request('http://0.0.0.0:3000/api/subscriptions/' + action, {
      method: 'POST', headers: { origin: 'https://bossboard.example.test', 'Content-Type': 'application/json',
        host: 'evil.test', 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'http' }, body: JSON.stringify({ tier: 'team' }),
    });
    assert.equal((await subscriptionProxy(req, action, h.deps)).status, 200);
    assert.ok(JSON.stringify(h.calls[1].init?.body).includes('https://bossboard.example.test/subscription'));
    assert.ok(!JSON.stringify(h.calls).includes('evil.test'));
  }
});
test('explicit local public origin works while invalid public configuration fails closed', async () => {
  const h = harness(); h.deps.publicOrigin = 'http://127.0.0.1:3137';
  const req = new Request('http://0.0.0.0:3000/api/subscriptions/checkout', { method: 'POST',
    headers: { origin: h.deps.publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'team' }) });
  assert.equal((await subscriptionProxy(req, 'checkout', h.deps)).status, 200);
  assert.ok(String(h.calls[1].init?.body).includes('http://127.0.0.1:3137/subscription'));
  for (const origin of ['http://remote.test', 'https://user:pass@bossboard.example.test', 'https://bossboard.example.test/path',
    'https://bossboard.example.test?x=1', 'https://bossboard.example.test#fragment', 'null', '']) {
    const bad = harness(); bad.deps.publicOrigin = origin;
    assert.equal((await subscriptionProxy(request(), 'checkout', bad.deps)).status, 502);
    assert.equal(bad.calls.length, 0);
  }
});
test('forged forwarding headers cannot authorize a foreign browser origin', async () => {
  const h = harness(); const req = request('https://evil.test'); req.headers.set('x-forwarded-host', 'evil.test');
  assert.equal((await subscriptionProxy(req, 'checkout', h.deps)).status, 403); assert.equal(h.calls.length, 0);
});
