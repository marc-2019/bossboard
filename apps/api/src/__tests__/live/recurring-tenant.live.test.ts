/**
 * Live SQL proofs for recurring-invoice tenant isolation.
 * Fail (do not skip) when DATABASE_URL is unreachable.
 */

const TENANT_B_EMAIL = 'b-secret@example.test';
const TENANT_B_PHONE = '0210000002';
const TENANT_B_NAME = 'Tenant B Secret Customer';
const TENANT_A_EMAIL = 'a-visible@example.test';
const TENANT_A_PHONE = '0210000001';
const TENANT_A_NAME = 'Tenant A Customer';

type LiveUser = { userId: string; email: string };

function liveUserSlot(): { current: LiveUser } {
  const g = globalThis as unknown as { __recurringTenantLiveUser?: { current: LiveUser } };
  if (!g.__recurringTenantLiveUser) {
    g.__recurringTenantLiveUser = { current: { userId: '', email: '' } };
  }
  return g.__recurringTenantLiveUser;
}

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (
    req: { user?: { userId: string; email: string } },
    _res: unknown,
    next: () => void
  ) {
    const live = (
      globalThis as unknown as {
        __recurringTenantLiveUser: { current: { userId: string; email: string } };
      }
    ).__recurringTenantLiveUser.current;
    req.user = { userId: live.userId, email: live.email };
    next();
  },
}));

import request from 'supertest';
import express, { Express } from 'express';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import recurringInvoiceRoutes from '../../routes/recurring-invoices.js';
import { errorHandler } from '../../middleware/error.js';
import { runMigrations } from '../../services/migrate.js';
import db from '../../services/database.js';

liveUserSlot();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for live recurring tenant proofs');
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

const app: Express = express();
app.use(express.json());
app.use('/api/v1/recurring-invoices', recurringInvoiceRoutes);
app.use(errorHandler);

function setLiveUser(user: { id: string; email: string }): void {
  liveUserSlot().current = { userId: user.id, email: user.email };
}

async function insertUser(): Promise<{ id: string; email: string }> {
  const email = `tenant-live-${randomUUID()}@example.test`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, is_verified)
     VALUES ($1, 'x', 'Tenant Live', true)
     RETURNING id`,
    [email]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('insertUser returned no row');
  }
  return { id: row.id, email };
}

async function insertCustomer(
  userId: string,
  name: string,
  email: string,
  phone: string
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO customers (user_id, name, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, name, email, phone]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('insertCustomer returned no row');
  }
  return row.id;
}

async function insertProduct(
  userId: string,
  name: string,
  unitPrice = 1000,
  type = 'fixed'
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO products_services (user_id, name, unit_price, type)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, name, unitPrice, type]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('insertProduct returned no row');
  }
  return row.id;
}

async function countRecurringForUser(userId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM recurring_invoices WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.count ?? -1;
}

function readRecurringId(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error('response missing data');
  }
  const data = (body as { data: unknown }).data;
  if (typeof data !== 'object' || data === null || !('recurring' in data)) {
    throw new Error('response missing data.recurring');
  }
  const recurring = (data as { recurring: unknown }).recurring;
  if (typeof recurring !== 'object' || recurring === null || !('id' in recurring)) {
    throw new Error('response missing data.recurring.id');
  }
  const id = (recurring as { id: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('response recurring id is not a string');
  }
  return id;
}

/**
 * CI applies database/init.sql via psql before Jest and does not record
 * 000_init in _migrations. Re-running init.sql then fails on
 * CREATE TRIGGER update_users_updated_at. If users already exists, treat
 * 000_init as applied and only run numbered migrations.
 */
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
      `Live recurring tenant proofs require a reachable Postgres (DATABASE_URL). ${String(err)}`
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

describe('live recurring tenant isolation', () => {
  it('create with another tenant\'s customer is rejected and saves nothing', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerB = await insertCustomer(userB.id, TENANT_B_NAME, TENANT_B_EMAIL, TENANT_B_PHONE);
    await insertProduct(userB.id, 'B Catalog Item');
    const productA = await insertProduct(userA.id, 'A Catalog Item');

    setLiveUser(userA);
    const response = await request(app)
      .post('/api/v1/recurring-invoices')
      .send({
        customerId: customerB,
        name: 'Should fail',
        lineItems: [
          { productServiceId: productA, unitPrice: 1000, quantity: 1, type: 'fixed' },
        ],
      });

    const body = response.body as { success: boolean; error: string };
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('NOT_FOUND');
    expect(String(JSON.stringify(response.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(response.body))).not.toContain(TENANT_B_PHONE);
    expect(await countRecurringForUser(userA.id)).toBe(0);
  });

  it('create with another tenant\'s product is rejected and saves nothing', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerA = await insertCustomer(userA.id, TENANT_A_NAME, TENANT_A_EMAIL, TENANT_A_PHONE);
    await insertCustomer(userB.id, TENANT_B_NAME, TENANT_B_EMAIL, TENANT_B_PHONE);
    const productB = await insertProduct(userB.id, 'B Catalog Item');

    setLiveUser(userA);
    const response = await request(app)
      .post('/api/v1/recurring-invoices')
      .send({
        customerId: customerA,
        name: 'Should fail',
        lineItems: [
          { productServiceId: productB, unitPrice: 1000, quantity: 1, type: 'fixed' },
        ],
      });

    const body = response.body as { success: boolean; error: string };
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('NOT_FOUND');
    expect(String(JSON.stringify(response.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(response.body))).not.toContain(TENANT_B_PHONE);
    expect(await countRecurringForUser(userA.id)).toBe(0);
  });

  it('update that swaps in another tenant\'s product is rejected and keeps the original line', async () => {
    const userA = await insertUser();
    const userB = await insertUser();
    const customerA = await insertCustomer(userA.id, TENANT_A_NAME, TENANT_A_EMAIL, TENANT_A_PHONE);
    await insertCustomer(userB.id, TENANT_B_NAME, TENANT_B_EMAIL, TENANT_B_PHONE);
    const productA = await insertProduct(userA.id, 'A Catalog Item');
    const productB = await insertProduct(userB.id, 'B Catalog Item');

    setLiveUser(userA);
    const created = await request(app)
      .post('/api/v1/recurring-invoices')
      .send({
        customerId: customerA,
        name: 'Keep original',
        lineItems: [
          { productServiceId: productA, unitPrice: 1000, quantity: 1, type: 'fixed' },
        ],
      });
    expect(created.status).toBe(201);
    const recurringId = readRecurringId(created.body);

    const response = await request(app)
      .put(`/api/v1/recurring-invoices/${recurringId}`)
      .send({
        lineItems: [
          { productServiceId: productB, unitPrice: 1000, quantity: 1, type: 'fixed' },
        ],
      });

    const body = response.body as { success: boolean; error: string };
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('NOT_FOUND');
    expect(String(JSON.stringify(response.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(response.body))).not.toContain(TENANT_B_PHONE);

    const lines = await pool.query<{ product_service_id: string }>(
      `SELECT product_service_id FROM recurring_line_items WHERE recurring_invoice_id = $1`,
      [recurringId]
    );
    expect(lines.rows.map((row) => row.product_service_id)).toEqual([productA]);
  });

  it('list, detail, and generate do not return another tenant\'s customer', async () => {
    const userB = await insertUser();
    const customerB = await insertCustomer(userB.id, TENANT_B_NAME, TENANT_B_EMAIL, TENANT_B_PHONE);
    const productB = await insertProduct(userB.id, 'B Catalog Item');

    const userA = await insertUser();
    const customerA = await insertCustomer(userA.id, TENANT_A_NAME, TENANT_A_EMAIL, TENANT_A_PHONE);
    const productA = await insertProduct(userA.id, 'A Catalog Item');

    setLiveUser(userB);
    const createdB = await request(app)
      .post('/api/v1/recurring-invoices')
      .send({
        customerId: customerB,
        name: 'B Monthly',
        lineItems: [
          { productServiceId: productB, unitPrice: 1000, quantity: 1, type: 'fixed' },
        ],
      });
    expect(createdB.status).toBe(201);
    const templateB = readRecurringId(createdB.body);

    setLiveUser(userA);
    const createdA = await request(app)
      .post('/api/v1/recurring-invoices')
      .send({
        customerId: customerA,
        name: 'A Monthly',
        lineItems: [
          { productServiceId: productA, unitPrice: 1000, quantity: 1, type: 'fixed' },
        ],
      });
    expect(createdA.status).toBe(201);
    const templateA = readRecurringId(createdA.body);

    const poison = await pool.query<{ id: string }>(
      `INSERT INTO recurring_invoices (
         user_id, customer_id, name, recurrence, day_of_month,
         is_auto_generate, include_gst, payment_terms, next_generation_date
       )
       VALUES ($1, $2, 'Poisoned', 'monthly', 1, true, true, 20, CURRENT_DATE)
       RETURNING id`,
      [userA.id, customerB]
    );
    const poisonId = poison.rows[0]?.id;
    if (!poisonId) {
      throw new Error('poison insert returned no row');
    }
    await pool.query(
      `INSERT INTO recurring_line_items (
         recurring_invoice_id, product_service_id, unit_price, quantity, type, sort_order
       )
       VALUES ($1, $2, 1000, 1, 'fixed', 0)`,
      [poisonId, productB]
    );

    setLiveUser(userA);

    const list = await request(app).get('/api/v1/recurring-invoices');
    expect(list.status).toBe(200);
    expect(String(JSON.stringify(list.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(list.body))).not.toContain(TENANT_B_PHONE);
    expect(String(JSON.stringify(list.body))).not.toContain(TENANT_B_NAME);
    expect(String(JSON.stringify(list.body))).toContain(TENANT_A_NAME);

    const pending = await request(app).get('/api/v1/recurring-invoices/pending');
    expect(pending.status).toBe(200);
    expect(String(JSON.stringify(pending.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(pending.body))).not.toContain(TENANT_B_PHONE);
    expect(String(JSON.stringify(pending.body))).not.toContain(TENANT_B_NAME);

    const poisonDetail = await request(app).get(`/api/v1/recurring-invoices/${poisonId}`);
    expect(poisonDetail.status).toBe(404);
    expect(String(JSON.stringify(poisonDetail.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(poisonDetail.body))).not.toContain(TENANT_B_PHONE);
    expect(String(JSON.stringify(poisonDetail.body))).not.toContain(TENANT_B_NAME);

    const otherDetail = await request(app).get(`/api/v1/recurring-invoices/${templateB}`);
    expect(otherDetail.status).toBe(404);
    expect(String(JSON.stringify(otherDetail.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(otherDetail.body))).not.toContain(TENANT_B_PHONE);
    expect(String(JSON.stringify(otherDetail.body))).not.toContain(TENANT_B_NAME);

    const poisonGenerate = await request(app)
      .post(`/api/v1/recurring-invoices/${poisonId}/generate`)
      .send({});
    expect(String(JSON.stringify(poisonGenerate.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(poisonGenerate.body))).not.toContain(TENANT_B_PHONE);
    expect(String(JSON.stringify(poisonGenerate.body))).not.toContain(TENANT_B_NAME);

    const leakedInvoices = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM invoices
       WHERE user_id = $1
         AND (client_email = $2 OR client_name = $3)`,
      [userA.id, TENANT_B_EMAIL, TENANT_B_NAME]
    );
    expect(leakedInvoices.rows[0]?.count).toBe(0);

    const generated = await request(app)
      .post(`/api/v1/recurring-invoices/${templateA}/generate`)
      .send({});
    expect(generated.status).toBe(201);
    expect(String(JSON.stringify(generated.body))).toContain(TENANT_A_NAME);
    expect(String(JSON.stringify(generated.body))).not.toContain(TENANT_B_EMAIL);
    expect(String(JSON.stringify(generated.body))).not.toContain(TENANT_B_PHONE);

    setLiveUser(userB);
    const ownDetail = await request(app).get(`/api/v1/recurring-invoices/${templateB}`);
    expect(ownDetail.status).toBe(200);
    expect(String(JSON.stringify(ownDetail.body))).toContain(TENANT_B_NAME);
  });
});
