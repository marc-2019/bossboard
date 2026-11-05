/**
 * Live SQL proofs that invoice and quote writes keep customer_id inside the
 * caller's account, and that insights does not return another account's
 * customer name. Fail (do not skip) when DATABASE_URL is unreachable.
 */

type LiveUser = { userId: string; email: string };

function liveUserSlot(): { current: LiveUser } {
  const g = globalThis as unknown as { __customerOwnershipLiveUser?: { current: LiveUser } };
  if (!g.__customerOwnershipLiveUser) {
    g.__customerOwnershipLiveUser = { current: { userId: '', email: '' } };
  }
  return g.__customerOwnershipLiveUser;
}

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (
    req: { user?: { userId: string; email: string } },
    _res: unknown,
    next: () => void
  ) {
    const live = (
      globalThis as unknown as {
        __customerOwnershipLiveUser: { current: { userId: string; email: string } };
      }
    ).__customerOwnershipLiveUser.current;
    req.user = { userId: live.userId, email: live.email };
    next();
  },
}));

jest.mock('../../middleware/subscription.js', () => ({
  attachSubscription: function (_req: unknown, _res: unknown, next: () => void) {
    next();
  },
  requireFeature: function () {
    return function (_req: unknown, _res: unknown, next: () => void) {
      next();
    };
  },
  checkLimit: function () {
    return function (_req: unknown, _res: unknown, next: () => void) {
      next();
    };
  },
}));

import request from 'supertest';
import express, { Express } from 'express';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import invoiceRoutes from '../../routes/invoices.js';
import quoteRoutes from '../../routes/quotes.js';
import statsRoutes from '../../routes/stats.js';
import { errorHandler } from '../../middleware/error.js';
import { runMigrations } from '../../services/migrate.js';
import db from '../../services/database.js';

liveUserSlot();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for live customer ownership proofs');
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

const app: Express = express();
app.use(express.json());
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/quotes', quoteRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use(errorHandler);

function setLiveUser(user: { id: string; email: string }): void {
  liveUserSlot().current = { userId: user.id, email: user.email };
}

async function insertUser(): Promise<{ id: string; email: string }> {
  const email = `own-live-${randomUUID()}@example.test`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, is_verified)
     VALUES ($1, 'x', 'Ownership Live', true)
     RETURNING id`,
    [email]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('insertUser returned no row');
  }
  return { id: row.id, email };
}

async function insertCustomer(userId: string, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO customers (user_id, name, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, name, `${randomUUID()}@example.test`, '0210000099']
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('insertCustomer returned no row');
  }
  return row.id;
}

async function countForUser(table: 'invoices' | 'quotes', userId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.count ?? -1;
}

function expectCustomerNotFound(status: number, body: { error?: string; message?: string }): void {
  expect(status).toBe(404);
  expect(body.error).toBe('NOT_FOUND');
  expect(body.message).toBe('Customer not found');
}

function readNestedId(body: unknown, key: 'invoice' | 'quote'): string {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('response missing data');
  }
  const data = (body as { data: unknown }).data;
  if (typeof data !== 'object' || data === null || !(key in data)) {
    throw new Error(`response missing data.${key}`);
  }
  const row = (data as Record<string, unknown>)[key];
  if (typeof row !== 'object' || row === null || !('id' in row)) {
    throw new Error(`response missing data.${key}.id`);
  }
  const id = (row as { id: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('response id is not a string');
  }
  return id;
}

async function applyPendingMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const existing = await pool.query<{ t: string | null }>(
    `SELECT to_regclass('public.users') AS t`
  );
  if (existing.rows[0]?.t) {
    await pool.query(
      `INSERT INTO _migrations (name) VALUES ('000_init') ON CONFLICT (name) DO NOTHING`
    );
  }
  await runMigrations();
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    throw new Error(
      `Live customer ownership proofs require a reachable Postgres (DATABASE_URL). ${String(err)}`
    );
  }
  const lockClient = await pool.connect();
  try {
    await lockClient.query('SELECT pg_advisory_lock(1010101010)');
    await applyPendingMigrations();
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(1010101010)');
    lockClient.release();
  }
}, 120000);

afterAll(async () => {
  await pool.end();
  await db.close();
});

describe('live customer ownership', () => {
  const line = [{ description: 'Labour', amount: 10000 }];

  it('invoice create rejects a customer id the caller does not own', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerB = await insertCustomer(userB.id, `Other Customer ${randomUUID()}`);
    const missingId = randomUUID();
    setLiveUser(userA);

    const foreign = await request(app)
      .post('/api/v1/invoices')
      .send({ clientName: 'Own Client', lineItems: line, customerId: customerB });
    const missing = await request(app)
      .post('/api/v1/invoices')
      .send({ clientName: 'Own Client', lineItems: line, customerId: missingId });

    expectCustomerNotFound(foreign.status, foreign.body);
    expectCustomerNotFound(missing.status, missing.body);
    expect(foreign.body.error).toBe(missing.body.error);
    expect(foreign.body.message).toBe(missing.body.message);
    expect(await countForUser('invoices', userA.id)).toBe(0);
  });

  it('invoice update rejects a customer id the caller does not own', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerA = await insertCustomer(userA.id, `Own Customer ${randomUUID()}`);
    const customerB = await insertCustomer(userB.id, `Other Customer ${randomUUID()}`);
    setLiveUser(userA);

    const created = await request(app)
      .post('/api/v1/invoices')
      .send({ clientName: 'Own Client', lineItems: line });
    expect(created.status).toBe(201);
    const invoiceId = readNestedId(created.body, 'invoice');

    const foreign = await request(app)
      .put(`/api/v1/invoices/${invoiceId}`)
      .send({ customerId: customerB });
    expectCustomerNotFound(foreign.status, foreign.body);

    const missing = await request(app)
      .put(`/api/v1/invoices/${invoiceId}`)
      .send({ customerId: randomUUID() });
    expectCustomerNotFound(missing.status, missing.body);

    const stored = await pool.query<{ customer_id: string | null }>(
      'SELECT customer_id FROM invoices WHERE id = $1 AND user_id = $2',
      [invoiceId, userA.id]
    );
    expect(stored.rows[0]?.customer_id).toBeNull();

    const owned = await request(app)
      .put(`/api/v1/invoices/${invoiceId}`)
      .send({ customerId: customerA });
    expect(owned.status).toBe(200);
    const after = await pool.query<{ customer_id: string | null }>(
      'SELECT customer_id FROM invoices WHERE id = $1 AND user_id = $2',
      [invoiceId, userA.id]
    );
    expect(after.rows[0]?.customer_id).toBe(customerA);
  });

  it('quote create rejects a customer id the caller does not own', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerB = await insertCustomer(userB.id, `Other Customer ${randomUUID()}`);
    setLiveUser(userA);

    const foreign = await request(app)
      .post('/api/v1/quotes')
      .send({ clientName: 'Own Client', lineItems: line, customerId: customerB });
    const missing = await request(app)
      .post('/api/v1/quotes')
      .send({ clientName: 'Own Client', lineItems: line, customerId: randomUUID() });

    expectCustomerNotFound(foreign.status, foreign.body);
    expectCustomerNotFound(missing.status, missing.body);
    expect(foreign.body.message).toBe(missing.body.message);
    expect(await countForUser('quotes', userA.id)).toBe(0);
  });

  it('quote update rejects a customer id the caller does not own', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerA = await insertCustomer(userA.id, `Own Customer ${randomUUID()}`);
    const customerB = await insertCustomer(userB.id, `Other Customer ${randomUUID()}`);
    setLiveUser(userA);

    const created = await request(app)
      .post('/api/v1/quotes')
      .send({ clientName: 'Own Client', lineItems: line });
    expect(created.status).toBe(201);
    const quoteId = readNestedId(created.body, 'quote');

    const foreign = await request(app)
      .put(`/api/v1/quotes/${quoteId}`)
      .send({ customerId: customerB });
    expectCustomerNotFound(foreign.status, foreign.body);

    const stored = await pool.query<{ customer_id: string | null }>(
      'SELECT customer_id FROM quotes WHERE id = $1 AND user_id = $2',
      [quoteId, userA.id]
    );
    expect(stored.rows[0]?.customer_id).toBeNull();

    const owned = await request(app)
      .put(`/api/v1/quotes/${quoteId}`)
      .send({ customerId: customerA });
    expect(owned.status).toBe(200);
    const after = await pool.query<{ customer_id: string | null }>(
      'SELECT customer_id FROM quotes WHERE id = $1 AND user_id = $2',
      [quoteId, userA.id]
    );
    expect(after.rows[0]?.customer_id).toBe(customerA);
  });

  it('insights top customers omit a customer name from another account', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const ownName = `Own Account ${randomUUID()}`;
    const otherName = `Other Account ${randomUUID()}`;
    const fallbackName = `Walk In ${randomUUID()}`;
    const customerA = await insertCustomer(userA.id, ownName);
    const customerB = await insertCustomer(userB.id, otherName);

    await pool.query(
      `INSERT INTO invoices (
         user_id, invoice_number, client_name, customer_id,
         line_items, subtotal, gst_amount, total, status, paid_at
       ) VALUES
         ($1, $2, $3, $4, '[]', 10000, 1500, 11500, 'paid', NOW()),
         ($1, $5, $6, $7, '[]', 20000, 3000, 23000, 'paid', NOW())`,
      [
        userA.id,
        `INV-${randomUUID()}`,
        fallbackName,
        customerB,
        `INV-${randomUUID()}`,
        'Linked Client',
        customerA,
      ]
    );

    setLiveUser(userA);
    const insights = await request(app).get('/api/v1/stats/insights');
    expect(insights.status).toBe(200);
    const body = JSON.stringify(insights.body);
    expect(body).toContain(fallbackName);
    expect(body).toContain(ownName);
    expect(body).not.toContain(otherName);
  });
});
