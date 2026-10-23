/** After `npm run build`, run `node scripts/test-subscription-adapter.mjs`.
 * Real Next standalone route/cookie adapter behind a loopback reverse proxy;
 * only the upstream BossBoard API is mocked. No live auth/Stripe/payment calls.
 */
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const standalone = fileURLToPath(new URL('../.next/standalone/apps/web/server.js', import.meta.url));
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(done => server.close(done));
const calls = [];
let paid = false;
let nextPort;
const api = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  calls.push({ path: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
  const subscription = { tier: paid ? 'team' : 'free', stripeCustomerId: paid ? 'cus_mock' : null,
    stripeSubscriptionId: paid ? 'sub_mock' : null };
  const data = req.url.endsWith('/me') ? { subscription } : {
    url: req.url.endsWith('/portal') ? 'https://billing.stripe.com/p/session/mock' : 'https://checkout.stripe.com/c/pay/mock',
  };
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, data }));
});
const proxy = createServer((req, res) => {
  const upstream = httpRequest({ hostname: '127.0.0.1', port: nextPort, path: req.url, method: req.method,
    headers: { ...req.headers, host: 'bossboard.instilligent.com',
      'x-forwarded-host': req.headers['x-forwarded-host'] ?? 'bossboard.instilligent.com', 'x-forwarded-proto': 'https' } }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { res.statusCode = 502; res.end(); }); req.pipe(upstream);
});
let child;
async function start(publicOrigin, apiPort) {
  // Reserve an unused loopback port. Standalone is bound to loopback, never a host-wide interface.
  const reserve = createServer(); nextPort = await listen(reserve); await close(reserve);
  const env = { PATH: process.env.PATH, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(nextPort),
    API_URL: `http://127.0.0.1:${apiPort}`, NEXT_TELEMETRY_DISABLED: '1' };
  if (publicOrigin) env.BOSSBOARD_PUBLIC_ORIGIN = publicOrigin;
  child = spawn(process.execPath, [standalone], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${logs}`);
    try { if ((await fetch(`http://127.0.0.1:${nextPort}/api/subscriptions/tiers`, { signal: AbortSignal.timeout(1000) })).status === 401) return; } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error(`Next not ready: ${logs}`);
}
async function stop() {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
}
try {
  const apiPort = await listen(api); const proxyPort = await listen(proxy);
  const local = `http://127.0.0.1:${proxyPort}`;
  const send = (action, origin, extra = {}) => fetch(`${local}/api/subscriptions/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin,
      cookie: 'bb_access_token=mock.e30.signature', ...extra },
    body: JSON.stringify({ tier: 'team', successUrl: 'https://evil.test' }),
  });
  for (const configured of [local, undefined]) {
    const origin = configured ?? 'https://bossboard.instilligent.com';
    await start(configured, apiPort);
    paid = false; calls.length = 0;
    assert.equal((await send('checkout', origin, { 'x-forwarded-host': 'evil.test' })).status, 200);
    assert.equal(calls.length, 2); assert.equal(calls[0].auth, 'Bearer mock.e30.signature');
    assert.deepEqual(calls[1].body, { tier: 'team', successUrl: `${origin}/subscription?checkout=success`, cancelUrl: `${origin}/subscription?checkout=cancelled` });
    console.log(`PASS Next standalone reverse proxy checkout: ${configured ? 'explicit loopback origin' : 'canonical default'}`);
    const before = calls.length;
    assert.equal((await send('checkout', 'https://evil.test', { 'x-forwarded-host': 'evil.test' })).status, 403);
    assert.equal((await send('checkout', origin, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await send('checkout', 'null')).status, 403); assert.equal(calls.length, before);
    console.log('PASS forged/missing-authority/cross-site origins blocked before upstream');
    paid = true;
    assert.equal((await send('checkout', origin)).status, 409);
    const portal = await send('portal', origin, { 'x-forwarded-host': 'evil.test' });
    assert.equal(portal.status, 200); assert.deepEqual(calls.at(-1).body, { returnUrl: `${origin}/subscription` });
    console.log('PASS paid-state guard and portal return URL through actual adapter');
    await stop();
  }
} finally {
  await stop(); await close(proxy); await close(api);
}
