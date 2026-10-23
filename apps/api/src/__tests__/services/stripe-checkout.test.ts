/** Real disposable PostgreSQL, mock Stripe only. Opt in using
 * BB_CHECKOUT_TEST_DATABASE_URL=postgresql://...@127.0.0.1:<disposable port>/bb_checkout_disposable
 * No default product database, Stripe credentials, or payment calls.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer, Server } from 'node:http';
import type Stripe from 'stripe';

jest.mock('../../config/index.js', () => ({ config: {
  databaseUrl: process.env.BB_CHECKOUT_TEST_DATABASE_URL || 'postgresql://localhost:1/bb_checkout_disposable',
  nodeEnv: 'test', isDevelopment: false,
} }));
import db from '../../services/database.js';
import { durableCheckout, durableStripeCustomer } from '../../services/stripe-checkout.js';

const enabled = !!process.env.BB_CHECKOUT_TEST_DATABASE_URL;
const suite = enabled ? describe : describe.skip;
suite('durable checkout — disposable PostgreSQL', () => {
  let userId: string;
  let sessions: Map<string, any>;
  let customers: Map<string, any>;
  let requests: Map<string, { params: unknown; session: any }>;
  let subscriptionData: any[];
  let server: Server;
  let endpoint: string;
  const customerCreate = jest.fn(); const create = jest.fn(); const retrieve = jest.fn();
  const expire = jest.fn(); const list = jest.fn(); const subscriptions = jest.fn();
  const stripe = { customers: { create: customerCreate }, subscriptions: { list: subscriptions },
    checkout: { sessions: { create, retrieve, expire, list } } } as unknown as Stripe;
  const input = () => ({ userId, userEmail: 'mock@example.test', userName: null, tier: 'team' as const,
    successUrl: 'https://bossboard.instilligent.com/subscription?checkout=success',
    cancelUrl: 'https://bossboard.instilligent.com/subscription?checkout=cancelled' });
  const checkout = () => durableCheckout(stripe, 'price_team_test', input());
  const requestRow = async () => (await db.query("SELECT * FROM stripe_billing_requests WHERE user_id = $1 AND kind = 'checkout'", [userId])).rows[0];
  beforeAll(async () => {
    const url = new URL(process.env.BB_CHECKOUT_TEST_DATABASE_URL!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/bb_checkout_disposable') throw new Error('Refusing non-disposable database');
    // Fresh minimal users table + the actual migration. Reapply proves normal idempotent migration behavior.
    await db.query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, subscription_tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT, stripe_subscription_id TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`);
    const migration = readFileSync(resolve(__dirname, '../../../../../database/migrations/028_stripe_billing_requests.sql'), 'utf8');
    await db.query(migration); await db.query(migration);
    server = createServer(async (req, res) => {
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const { op, args } = JSON.parse(body);
        const operations: Record<string, (...args: any[]) => any> = { customer: customerCreate, create, retrieve, expire, list, subscriptions };
        const value = await operations[op](...args);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value));
      } catch { res.statusCode = 503; res.end('{}'); }
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(done => server.close(() => done()));
    await db.close();
  });
  beforeEach(async () => {
    jest.resetAllMocks();
    await db.query('TRUNCATE users CASCADE'); userId = randomUUID();
    await db.query('INSERT INTO users (id) VALUES ($1)', [userId]);
    sessions = new Map(); customers = new Map(); requests = new Map(); subscriptionData = [];
    customerCreate.mockImplementation(async (params, options) => {
      if (!customers.has(options.idempotencyKey)) customers.set(options.idempotencyKey, { id: `cus_${customers.size}`, params });
      return customers.get(options.idempotencyKey);
    });
    create.mockImplementation(async (params, options) => {
      const old = requests.get(options.idempotencyKey);
      if (old) { expect(params).toEqual(old.params); return old.session; }
      const session = { id: `cs_${sessions.size}`, status: 'open', mode: 'subscription', customer: params.customer,
        metadata: params.metadata, expires_at: Math.floor(Date.now() / 1000) + 3600,
        url: `https://checkout.stripe.com/c/pay/mock_${sessions.size}` };
      sessions.set(session.id, session); requests.set(options.idempotencyKey, { params, session });
      return session;
    });
    retrieve.mockImplementation(async id => ({ ...sessions.get(id) }));
    expire.mockImplementation(async id => { sessions.get(id).status = 'expired'; return { ...sessions.get(id) }; });
    list.mockImplementation(async () => ({ data: [...sessions.values()].filter(s => s.status === 'open'), has_more: false }));
    subscriptions.mockImplementation(async () => ({ data: subscriptionData, has_more: false }));
  });

  test('concurrent tabs and subsequent retry reuse one session and one customer', async () => {
    const results = await Promise.all([checkout(), checkout(), checkout()]);
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(await checkout()).toEqual(results[0]);
    expect(create).toHaveBeenCalledTimes(1); expect(customerCreate).toHaveBeenCalledTimes(1);
    expect((await requestRow()).state).toBe('open');
  });
  test('two independent Node processes share the database reservation and lock', async () => {
    const child = () => new Promise<any>((done, reject) => {
      const proc = spawn(process.execPath, ['--import', 'tsx', resolve(__dirname, 'stripe-checkout.worker.ts')], {
        cwd: resolve(__dirname, '../../..'), env: { PATH: process.env.PATH, NODE_ENV: 'test',
          DATABASE_URL: process.env.BB_CHECKOUT_TEST_DATABASE_URL, BB_CHECKOUT_TEST_PROVIDER: endpoint,
          BB_CHECKOUT_TEST_USER: userId, JWT_SECRET: 'mock-only', JWT_REFRESH_SECRET: 'mock-only' },
      });
      let output = ''; let errors = '';
      proc.stdout.on('data', b => { output += b; }); proc.stderr.on('data', b => { errors += b; });
      proc.on('error', reject); proc.on('exit', code => code === 0 ? done(JSON.parse(output.split('BB_CHECKOUT_RESULT:').at(-1)!)) : reject(new Error(errors || `worker exit ${code}`)));
    });
    const [a, b] = await Promise.all([child(), child()]);
    expect(a).toEqual(b); expect(create).toHaveBeenCalledTimes(1); expect(customerCreate).toHaveBeenCalledTimes(1);
    expect(await checkout()).toEqual(a);
  });
  test('concurrent standalone customer creation shares the checkout lock', async () => {
    const [id, result] = await Promise.all([durableStripeCustomer(stripe, userId, 'mock@example.test', null), checkout()]);
    expect(id).toBe(sessions.get(result.sessionId).customer); expect(customerCreate).toHaveBeenCalledTimes(1);
  });
  test('timeout after provider creates session replays the committed key and exact parameters', async () => {
    const real = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => { await real(...args); throw new Error('response lost'); });
    await expect(checkout()).rejects.toThrow('response lost');
    const before = await requestRow(); expect(before.provider_id).toBeNull();
    const recovered = await checkout();
    expect(sessions.size).toBe(1); expect(recovered.sessionId).toBe('cs_0');
    expect((await requestRow()).idempotency_key).toBe(before.idempotency_key);
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  });
  test('lost customer response retries original parameters even when profile changes', async () => {
    const real = customerCreate.getMockImplementation()!;
    customerCreate.mockImplementationOnce(async (...args) => { await real(...args); throw new Error('customer response lost'); });
    await expect(checkout()).rejects.toThrow('customer response lost');
    await durableStripeCustomer(stripe, userId, 'changed@example.test', 'Changed');
    await checkout(); expect(customers.size).toBe(1); expect(customerCreate.mock.calls[1]).toEqual(customerCreate.mock.calls[0]);
  });
  test.each(['customer', 'checkout'])('unknown %s older than safe key retention fails closed', async kind => {
    (kind === 'customer' ? customerCreate : create).mockRejectedValueOnce(new Error('timeout'));
    await expect(checkout()).rejects.toThrow('timeout');
    await db.query("UPDATE stripe_billing_requests SET created_at = NOW() - INTERVAL '25 hours' WHERE user_id = $1 AND kind = $2", [userId, kind]);
    const calls = (kind === 'customer' ? customerCreate : create).mock.calls.length;
    await expect(checkout()).rejects.toMatchObject({ statusCode: 503 });
    expect((kind === 'customer' ? customerCreate : create).mock.calls.length).toBe(calls);
  });
  test('known open session is reused across the key retention boundary', async () => {
    const a = await checkout();
    await db.query("UPDATE stripe_billing_requests SET created_at = NOW() - INTERVAL '25 hours' WHERE user_id = $1", [userId]);
    expect(await checkout()).toEqual(a); expect(create).toHaveBeenCalledTimes(1);
  });
  test('provider success followed by database write failure replays original request', async () => {
    // Fail after session creation, while allowing the durable reservation write.
    await db.query(`CREATE FUNCTION bb_test_reject_provider_id() RETURNS trigger AS $$
      BEGIN IF NEW.kind = 'checkout' AND NEW.provider_id IS NOT NULL THEN
        RAISE EXCEPTION 'disposable persistence failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER bb_test_provider_id BEFORE UPDATE ON stripe_billing_requests
      FOR EACH ROW EXECUTE FUNCTION bb_test_reject_provider_id()`);
    try { await expect(checkout()).rejects.toThrow('disposable persistence failure'); }
    finally { await db.query('DROP TRIGGER bb_test_provider_id ON stripe_billing_requests; DROP FUNCTION bb_test_reject_provider_id()'); }
    const key = (await requestRow()).idempotency_key;
    await checkout(); expect((await requestRow()).idempotency_key).toBe(key);
    expect(sessions.size).toBe(1); expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  });
  test('expired session permits a new generation with a new key', async () => {
    const a = await checkout(); const key = (await requestRow()).idempotency_key;
    sessions.get(a.sessionId).status = 'expired';
    const b = await checkout(); expect(b.sessionId).not.toBe(a.sessionId);
    expect((await requestRow()).idempotency_key).not.toBe(key);
  });
  test('local expiry alone never permits creating beside an open provider session', async () => {
    const a = await checkout(); sessions.get(a.sessionId).expires_at = Math.floor(Date.now() / 1000) - 1;
    expire.mockRejectedValueOnce(new Error('unknown expiry'));
    await expect(checkout()).rejects.toThrow('unknown expiry'); expect(create).toHaveBeenCalledTimes(1);
    const b = await checkout(); expect(b.sessionId).not.toBe(a.sessionId); expect(sessions.get(a.sessionId).status).toBe('expired');
  });
  test('tier change expires old link before new session; subsequent retries reuse it', async () => {
    const a = await checkout();
    const b = await durableCheckout(stripe, 'price_tradie_test', { ...input(), tier: 'tradie' });
    expect(sessions.get(a.sessionId).status).toBe('expired'); expect(b.sessionId).not.toBe(a.sessionId);
    expect(expire.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[1]);
    expect(await durableCheckout(stripe, 'price_tradie_test', { ...input(), tier: 'tradie' })).toEqual(b);
  });
  test('tier change recovers unknown old create before expiring it', async () => {
    const real = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => { await real(...args); throw new Error('lost'); });
    await expect(checkout()).rejects.toThrow('lost');
    await durableCheckout(stripe, 'price_tradie_test', { ...input(), tier: 'tradie' });
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0]); expect(sessions.get('cs_0').status).toBe('expired');
    expect(sessions.size).toBe(2);
  });
  test.each(['expired response lost', 'completed during expiry'])('tier change blocks after %s', async failure => {
    await checkout(); expire.mockImplementationOnce(async id => {
      sessions.get(id).status = failure === 'expired response lost' ? 'expired' : 'complete'; throw new Error(failure);
    });
    await expect(durableCheckout(stripe, 'price_tradie_test', { ...input(), tier: 'tradie' })).rejects.toThrow(failure);
    expect(create).toHaveBeenCalledTimes(1);
    if (failure === 'completed during expiry') await expect(checkout()).rejects.toMatchObject({ statusCode: 409 });
    else { await durableCheckout(stripe, 'price_tradie_test', { ...input(), tier: 'tradie' }); expect(create).toHaveBeenCalledTimes(2); }
  });
  test.each(['team', 'tradie', null])('paid or unknown database tier %s blocks before provider work', async tier => {
    if (tier === null) await db.query('DELETE FROM users WHERE id = $1', [userId]);
    else await db.query('UPDATE users SET subscription_tier = $2 WHERE id = $1', [userId, tier]);
    await expect(checkout()).rejects.toMatchObject({ statusCode: tier === null ? 503 : 409 });
    expect(customerCreate).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
  test('free tier with existing subscription ID blocks; store paid state is reread on retry', async () => {
    await db.query("UPDATE users SET stripe_subscription_id = 'sub_mock' WHERE id = $1", [userId]);
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 });
    await db.query('UPDATE users SET stripe_subscription_id = NULL WHERE id = $1', [userId]);
    await checkout(); await db.query("UPDATE users SET subscription_tier = 'tradie' WHERE id = $1", [userId]);
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).toHaveBeenCalledTimes(1);
  });
  test('paid state changes during provider work are reread before creating', async () => {
    subscriptions.mockImplementationOnce(async () => {
      await db.query("UPDATE users SET subscription_tier = 'team' WHERE id = $1", [userId]);
      return { data: [], has_more: false };
    });
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).not.toHaveBeenCalled();
  });
  test('paid state changes during session creation prevent returning URL', async () => {
    const real = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => {
      const value = await real(...args); await db.query("UPDATE users SET subscription_tier = 'team' WHERE id = $1", [userId]); return value;
    });
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 });
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).toHaveBeenCalledTimes(1);
  });
  test.each(['active', 'incomplete', 'past_due', 'paused', 'unpaid', 'trialing', 'unknown'])('Stripe %s state blocks delayed webhook duplicate', async status => {
    subscriptionData = [{ status }]; await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).not.toHaveBeenCalled();
  });
  test('completed session blocks even while user tier and Stripe subscription list lag', async () => {
    const a = await checkout(); sessions.get(a.sessionId).status = 'complete';
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).toHaveBeenCalledTimes(1);
  });
  test.each(['canceled', 'incomplete_expired'])('Free account can re-subscribe after exact prior subscription is proven %s', async status => {
    const a = await checkout();
    Object.assign(sessions.get(a.sessionId), { status: 'complete', subscription: 'sub_prior' });
    subscriptionData = [{ id: 'sub_prior', customer: sessions.get(a.sessionId).customer, status }];
    const [b, c] = await Promise.all([checkout(), checkout()]);
    expect(b.sessionId).not.toBe(a.sessionId); expect(c).toEqual(b); expect(await checkout()).toEqual(b);
    expect(create).toHaveBeenCalledTimes(2);
  });
  test.each(['missing reference', 'empty history', 'different subscription', 'foreign customer'])('completed history with %s still blocks pending activation', async ambiguity => {
    const a = await checkout();
    Object.assign(sessions.get(a.sessionId), { status: 'complete', subscription: ambiguity === 'missing reference' ? null : 'sub_prior' });
    subscriptionData = ambiguity === 'empty history' ? [] : [{ id: ambiguity === 'different subscription' ? 'sub_other' : 'sub_prior',
      customer: ambiguity === 'foreign customer' ? 'cus_foreign' : sessions.get(a.sessionId).customer, status: 'canceled' }];
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).toHaveBeenCalledTimes(1);
  });
  test('canceled history cannot override a paid account', async () => {
    const a = await checkout(); Object.assign(sessions.get(a.sessionId), { status: 'complete', subscription: 'sub_prior' });
    subscriptionData = [{ id: 'sub_prior', customer: sessions.get(a.sessionId).customer, status: 'canceled' }];
    await db.query("UPDATE users SET subscription_tier = 'team' WHERE id = $1", [userId]);
    await expect(checkout()).rejects.toMatchObject({ statusCode: 409 }); expect(create).toHaveBeenCalledTimes(1);
  });
  test('unknown retrieval never overwrites reservation or creates a parallel session', async () => {
    await checkout(); const key = (await requestRow()).idempotency_key;
    retrieve.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(checkout()).rejects.toThrow('provider unavailable'); expect((await requestRow()).idempotency_key).toBe(key);
    await checkout(); expect(create).toHaveBeenCalledTimes(1);
  });
  test.each([{ data: [], has_more: true }, {}, { data: null, has_more: false }])('unknown/truncated subscription list fails closed: %j', async response => {
    subscriptions.mockResolvedValueOnce(response); await expect(checkout()).rejects.toMatchObject({ statusCode: 503 }); expect(create).not.toHaveBeenCalled();
  });
  test('untracked pre-migration checkout blocks another session', async () => {
    list.mockResolvedValueOnce({ data: [{ id: 'cs_legacy' }], has_more: false });
    await expect(checkout()).rejects.toMatchObject({ statusCode: 503 }); expect(create).not.toHaveBeenCalled();
  });
  test.each([{ status: null }, { customer: 'cus_foreign' }, { metadata: {} }, { url: 'https://evil.test' }])('unknown/foreign/unsafe provider response blocks: %j', async patch => {
    const a = await checkout(); Object.assign(sessions.get(a.sessionId), patch);
    await expect(checkout()).rejects.toMatchObject({ statusCode: 503 }); expect(create).toHaveBeenCalledTimes(1);
  });
  test('migration absence fails closed before any provider creation', async () => {
    await db.query('ALTER TABLE stripe_billing_requests RENAME TO stripe_billing_requests_hidden');
    try { await expect(checkout()).rejects.toThrow(); expect(customerCreate).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); }
    finally { await db.query('ALTER TABLE stripe_billing_requests_hidden RENAME TO stripe_billing_requests'); }
  });
});
