/**
 * Live SQL proofs that tenant A cannot read or write tenant B's rows
 * on customers, products, invoices, quotes, expenses, job logs, teams,
 * and the sync batch paths for those entities.
 *
 * Recurring-invoice template paths are covered by SEC-F1 and are not
 * retested here. Fail (do not skip) when DATABASE_URL is unreachable.
 */

const B_CUSTOMER_NAME = 'TenantBSecretCustomerQ2';
const B_CUSTOMER_EMAIL = 'b-secret-q2@example.test';
const B_CUSTOMER_PHONE = '0210000092';
const A_CUSTOMER_NAME = 'TenantACustomerQ2';
const B_PRODUCT_NAME = 'TenantBSecretProductQ2';
const A_PRODUCT_NAME = 'TenantAProductQ2';
const B_INVOICE_CLIENT = 'TenantBSecretInvoiceClientQ2';
const A_INVOICE_CLIENT = 'TenantAInvoiceClientQ2';
const B_QUOTE_CLIENT = 'TenantBSecretQuoteClientQ2';
const A_QUOTE_CLIENT = 'TenantAQuoteClientQ2';
const B_EXPENSE_VENDOR = 'TenantBSecretVendorQ2';
const A_EXPENSE_VENDOR = 'TenantAVendorQ2';
const B_JOB_DESC = 'TenantBSecretJobQ2';
const A_JOB_DESC = 'TenantAJobQ2';
const B_TEAM_NAME = 'TenantBSecretTeamQ2';
const A_TEAM_NAME = 'TenantATeamQ2';
const B_SWMS_TITLE = 'TenantBSecretSwmsQ2';
const B_INVITE_CODE = 'tenant-b-secret-invite-q2';

const B_SECRETS = [
  B_CUSTOMER_NAME,
  B_CUSTOMER_EMAIL,
  B_CUSTOMER_PHONE,
  B_PRODUCT_NAME,
  B_INVOICE_CLIENT,
  B_QUOTE_CLIENT,
  B_EXPENSE_VENDOR,
  B_JOB_DESC,
  B_TEAM_NAME,
  B_SWMS_TITLE,
  B_INVITE_CODE,
];

type LiveUser = { userId: string; email: string };

function liveUserSlot(): { current: LiveUser } {
  const g = globalThis as unknown as { __twoTenantLiveUser?: { current: LiveUser } };
  if (!g.__twoTenantLiveUser) {
    g.__twoTenantLiveUser = { current: { userId: '', email: '' } };
  }
  return g.__twoTenantLiveUser;
}

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (
    req: { user?: { userId: string; email: string } },
    _res: unknown,
    next: () => void
  ) {
    const live = (
      globalThis as unknown as {
        __twoTenantLiveUser: { current: { userId: string; email: string } };
      }
    ).__twoTenantLiveUser.current;
    req.user = { userId: live.userId, email: live.email };
    next();
  },
}));

import request from 'supertest';
import express, { Express } from 'express';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import customerRoutes from '../../routes/customers.js';
import productRoutes from '../../routes/products.js';
import invoiceRoutes from '../../routes/invoices.js';
import quoteRoutes from '../../routes/quotes.js';
import expenseRoutes from '../../routes/expenses.js';
import jobLogRoutes from '../../routes/job-logs.js';
import teamRoutes from '../../routes/teams.js';
import syncRoutes from '../../routes/sync.js';
import { errorHandler } from '../../middleware/error.js';
import { runMigrations } from '../../services/migrate.js';
import db from '../../services/database.js';

liveUserSlot();

process.on('unhandledRejection', (err) => {
  // Express 4 does not forward async throws. Log and keep the suite alive
  // so a hanging denial still fails the assertion instead of killing Jest.
  console.error('two-tenant live unhandledRejection:', err);
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for live two-tenant proofs');
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

function mount(path: string, router: express.Router): Express {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  app.use(errorHandler);
  return app;
}

const customersApp = mount('/api/v1/customers', customerRoutes);
const productsApp = mount('/api/v1/products', productRoutes);
const invoicesApp = mount('/api/v1/invoices', invoiceRoutes);
const quotesApp = mount('/api/v1/quotes', quoteRoutes);
const expensesApp = mount('/api/v1/expenses', expenseRoutes);
const jobLogsApp = mount('/api/v1/job-logs', jobLogRoutes);
const teamsApp = mount('/api/v1/teams', teamRoutes);
const syncApp = mount('/api/v1/sync', syncRoutes);

function setLiveUser(user: { id: string; email: string }): void {
  liveUserSlot().current = { userId: user.id, email: user.email };
}

function assertNoSecrets(body: unknown, secrets: string[] = B_SECRETS): void {
  const text = JSON.stringify(body);
  for (const secret of secrets) {
    expect(text).not.toContain(secret);
  }
}

function assertDenied(status: number, body: unknown, secrets: string[] = B_SECRETS): void {
  expect([403, 404]).toContain(status);
  expect((body as { success?: boolean }).success).not.toBe(true);
  assertNoSecrets(body, secrets);
}

async function hit(req: request.Test): Promise<request.Response> {
  return req.timeout({ deadline: 4000 });
}

async function insertUser(): Promise<{ id: string; email: string }> {
  const email = `tenant-q2-${randomUUID()}@example.test`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, is_verified, subscription_tier)
     VALUES ($1, 'x', 'Tenant Q2', true, 'tradie')
     RETURNING id`,
    [email]
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertUser returned no row');
  return { id: row.id, email };
}

function readId(body: unknown, path: string[]): string {
  let cur: unknown = body;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null || !(key in (cur as Record<string, unknown>))) {
      throw new Error(`missing ${path.join('.')}`);
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur !== 'string' || cur.length === 0) {
    throw new Error(`id at ${path.join('.')} is not a string`);
  }
  return cur;
}

async function countRows(sql: string, params: unknown[]): Promise<number> {
  const result = await pool.query<{ count: number }>(sql, params);
  return result.rows[0]?.count ?? -1;
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
      `Live two-tenant proofs require a reachable Postgres (DATABASE_URL). ${String(err)}`
    );
  }
  const lockClient = await pool.connect();
  try {
    // Shared with quote-sent-at.live.test.ts so parallel workers migrate once.
    await lockClient.query('SELECT pg_advisory_lock(1010101012)');
    await applyPendingMigrations();
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(1010101012)');
    lockClient.release();
  }
}, 120000);

afterAll(async () => {
  await pool.end();
  await db.close();
});

describe('live two-tenant isolation', () => {
  it('customers: A cannot list, search, read, update, or delete B', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const createdB = await hit(request(customersApp).post('/api/v1/customers').send({
      name: B_CUSTOMER_NAME,
      email: B_CUSTOMER_EMAIL,
      phone: B_CUSTOMER_PHONE,
    }));
    expect(createdB.status).toBe(201);
    const customerB = readId(createdB.body, ['data', 'customer', 'id']);

    setLiveUser(userA);
    const createdA = await hit(request(customersApp).post('/api/v1/customers').send({
      name: A_CUSTOMER_NAME,
      email: 'a-visible-q2@example.test',
      phone: '0210000001',
    }));
    expect(createdA.status).toBe(201);
    const customerA = readId(createdA.body, ['data', 'customer', 'id']);

    const list = await hit(request(customersApp).get('/api/v1/customers'));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(A_CUSTOMER_NAME);
    assertNoSecrets(list.body);

    const search = await hit(
      request(customersApp).get('/api/v1/customers').query({ search: B_CUSTOMER_NAME })
    );
    expect(search.status).toBe(200);
    assertNoSecrets(search.body);
    expect(JSON.stringify(search.body)).not.toContain(customerB);

    const emailSearch = await hit(
      request(customersApp).get('/api/v1/customers').query({ search: B_CUSTOMER_EMAIL })
    );
    expect(emailSearch.status).toBe(200);
    assertNoSecrets(emailSearch.body);

    const detail = await hit(request(customersApp).get(`/api/v1/customers/${customerB}`));
    assertDenied(detail.status, detail.body);

    const updated = await hit(
      request(customersApp).put(`/api/v1/customers/${customerB}`).send({ name: 'Hijacked Customer' })
    );
    assertDenied(updated.status, updated.body);

    const removed = await hit(request(customersApp).delete(`/api/v1/customers/${customerB}`));
    assertDenied(removed.status, removed.body);

    const row = await pool.query<{ name: string; is_active: boolean; user_id: string }>(
      `SELECT name, is_active, user_id FROM customers WHERE id = $1`,
      [customerB]
    );
    expect(row.rows[0]).toEqual({
      name: B_CUSTOMER_NAME,
      is_active: true,
      user_id: userB.id,
    });

    const own = await hit(request(customersApp).get(`/api/v1/customers/${customerA}`));
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).toContain(A_CUSTOMER_NAME);
    assertNoSecrets(own.body);
  });

  it('products: A cannot list, read, update, or delete B', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const createdB = await hit(request(productsApp).post('/api/v1/products').send({
      name: B_PRODUCT_NAME,
      unitPrice: 8800,
    }));
    expect(createdB.status).toBe(201);
    const productB = readId(createdB.body, ['data', 'product', 'id']);

    setLiveUser(userA);
    const createdA = await hit(request(productsApp).post('/api/v1/products').send({
      name: A_PRODUCT_NAME,
      unitPrice: 1100,
    }));
    expect(createdA.status).toBe(201);
    const productA = readId(createdA.body, ['data', 'product', 'id']);

    const list = await hit(request(productsApp).get('/api/v1/products'));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(A_PRODUCT_NAME);
    assertNoSecrets(list.body);

    const detail = await hit(request(productsApp).get(`/api/v1/products/${productB}`));
    assertDenied(detail.status, detail.body);

    const updated = await hit(
      request(productsApp).put(`/api/v1/products/${productB}`).send({ name: 'Hijacked Product', unitPrice: 1 })
    );
    assertDenied(updated.status, updated.body);

    const removed = await hit(request(productsApp).delete(`/api/v1/products/${productB}`));
    assertDenied(removed.status, removed.body);

    const row = await pool.query<{ name: string; unit_price: number; is_active: boolean; user_id: string }>(
      `SELECT name, unit_price, is_active, user_id FROM products_services WHERE id = $1`,
      [productB]
    );
    expect(row.rows[0]).toEqual({
      name: B_PRODUCT_NAME,
      unit_price: 8800,
      is_active: true,
      user_id: userB.id,
    });

    const own = await hit(request(productsApp).get(`/api/v1/products/${productA}`));
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).toContain(A_PRODUCT_NAME);
  });

  it('invoices: A cannot read or write B, or attach B customer or SWMS', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const customerBRes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: B_CUSTOMER_NAME,
      email: B_CUSTOMER_EMAIL,
      phone: B_CUSTOMER_PHONE,
    }));
    expect(customerBRes.status).toBe(201);
    const customerB = readId(customerBRes.body, ['data', 'customer', 'id']);

    const swms = await pool.query<{ id: string }>(
      `INSERT INTO swms_documents (user_id, template_type, title, client_name)
       VALUES ($1, 'plumber', $2, $2)
       RETURNING id`,
      [userB.id, B_SWMS_TITLE]
    );
    const swmsB = swms.rows[0]?.id;
    if (!swmsB) throw new Error('swms insert returned no row');

    const createdB = await hit(request(invoicesApp).post('/api/v1/invoices').send({
      clientName: B_INVOICE_CLIENT,
      lineItems: [{ description: 'B labour', amount: 5000 }],
      customerId: customerB,
    }));
    expect(createdB.status).toBe(201);
    const invoiceB = readId(createdB.body, ['data', 'invoice', 'id']);

    setLiveUser(userA);
    const customerARes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: A_CUSTOMER_NAME,
    }));
    expect(customerARes.status).toBe(201);
    const customerA = readId(customerARes.body, ['data', 'customer', 'id']);

    const createdA = await hit(request(invoicesApp).post('/api/v1/invoices').send({
      clientName: A_INVOICE_CLIENT,
      lineItems: [{ description: 'A labour', amount: 2500 }],
      customerId: customerA,
    }));
    expect(createdA.status).toBe(201);
    const invoiceA = readId(createdA.body, ['data', 'invoice', 'id']);

    const list = await hit(request(invoicesApp).get('/api/v1/invoices'));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(A_INVOICE_CLIENT);
    assertNoSecrets(list.body);

    const detail = await hit(request(invoicesApp).get(`/api/v1/invoices/${invoiceB}`));
    assertDenied(detail.status, detail.body);

    const updated = await hit(
      request(invoicesApp).put(`/api/v1/invoices/${invoiceB}`).send({ clientName: 'Hijacked Invoice' })
    );
    assertDenied(updated.status, updated.body);

    const sent = await hit(request(invoicesApp).post(`/api/v1/invoices/${invoiceB}/send`));
    assertDenied(sent.status, sent.body);

    const paid = await hit(request(invoicesApp).post(`/api/v1/invoices/${invoiceB}/paid`));
    assertDenied(paid.status, paid.body);

    const share = await hit(request(invoicesApp).post(`/api/v1/invoices/${invoiceB}/share`));
    assertDenied(share.status, share.body);

    const removed = await hit(request(invoicesApp).delete(`/api/v1/invoices/${invoiceB}`));
    assertDenied(removed.status, removed.body);

    const foreignCustomer = await hit(request(invoicesApp).post('/api/v1/invoices').send({
      clientName: A_INVOICE_CLIENT,
      lineItems: [{ description: 'Should not save', amount: 100 }],
      customerId: customerB,
    }));
    assertDenied(foreignCustomer.status, foreignCustomer.body);
    expect(foreignCustomer.status).toBe(404);

    const foreignSwms = await hit(request(invoicesApp).post('/api/v1/invoices').send({
      clientName: A_INVOICE_CLIENT,
      lineItems: [{ description: 'Should not link swms', amount: 100 }],
      swmsId: swmsB,
    }));
    assertDenied(foreignSwms.status, foreignSwms.body);
    expect(foreignSwms.status).toBe(404);

    const swapCustomer = await hit(
      request(invoicesApp).put(`/api/v1/invoices/${invoiceA}`).send({ customerId: customerB })
    );
    assertDenied(swapCustomer.status, swapCustomer.body);

    const swapSwms = await hit(
      request(invoicesApp).put(`/api/v1/invoices/${invoiceA}`).send({ swmsId: swmsB })
    );
    assertDenied(swapSwms.status, swapSwms.body);

    const bRow = await pool.query<{ client_name: string; status: string; user_id: string; share_token: string | null }>(
      `SELECT client_name, status, user_id, share_token FROM invoices WHERE id = $1`,
      [invoiceB]
    );
    expect(bRow.rows[0]).toEqual({
      client_name: B_INVOICE_CLIENT,
      status: 'draft',
      user_id: userB.id,
      share_token: null,
    });

    const aRow = await pool.query<{ customer_id: string | null; swms_id: string | null }>(
      `SELECT customer_id, swms_id FROM invoices WHERE id = $1`,
      [invoiceA]
    );
    expect(aRow.rows[0]).toEqual({ customer_id: customerA, swms_id: null });

    expect(await countRows(
      `SELECT count(*)::int AS count FROM invoices WHERE user_id = $1 AND customer_id = $2`,
      [userA.id, customerB]
    )).toBe(0);
    expect(await countRows(
      `SELECT count(*)::int AS count FROM invoices WHERE user_id = $1 AND swms_id = $2`,
      [userA.id, swmsB]
    )).toBe(0);
  });

  it('quotes: A cannot read or write B, or attach B customer', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const customerBRes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: B_CUSTOMER_NAME,
      email: B_CUSTOMER_EMAIL,
      phone: B_CUSTOMER_PHONE,
    }));
    expect(customerBRes.status).toBe(201);
    const customerB = readId(customerBRes.body, ['data', 'customer', 'id']);

    const createdB = await hit(request(quotesApp).post('/api/v1/quotes').send({
      clientName: B_QUOTE_CLIENT,
      lineItems: [{ description: 'B estimate', amount: 7000 }],
      customerId: customerB,
    }));
    expect(createdB.status).toBe(201);
    const quoteB = readId(createdB.body, ['data', 'quote', 'id']);

    setLiveUser(userA);
    const customerARes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: A_CUSTOMER_NAME,
    }));
    expect(customerARes.status).toBe(201);
    const customerA = readId(customerARes.body, ['data', 'customer', 'id']);

    const createdA = await hit(request(quotesApp).post('/api/v1/quotes').send({
      clientName: A_QUOTE_CLIENT,
      lineItems: [{ description: 'A estimate', amount: 3000 }],
      customerId: customerA,
    }));
    expect(createdA.status).toBe(201);
    const quoteA = readId(createdA.body, ['data', 'quote', 'id']);

    const list = await hit(request(quotesApp).get('/api/v1/quotes'));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(A_QUOTE_CLIENT);
    assertNoSecrets(list.body);

    const detail = await hit(request(quotesApp).get(`/api/v1/quotes/${quoteB}`));
    assertDenied(detail.status, detail.body);

    const updated = await hit(
      request(quotesApp).put(`/api/v1/quotes/${quoteB}`).send({ clientName: 'Hijacked Quote' })
    );
    assertDenied(updated.status, updated.body);

    const sent = await hit(request(quotesApp).post(`/api/v1/quotes/${quoteB}/send`));
    assertDenied(sent.status, sent.body);

    const accepted = await hit(request(quotesApp).post(`/api/v1/quotes/${quoteB}/accept`));
    assertDenied(accepted.status, accepted.body);

    const declined = await hit(request(quotesApp).post(`/api/v1/quotes/${quoteB}/decline`));
    assertDenied(declined.status, declined.body);

    const converted = await hit(request(quotesApp).post(`/api/v1/quotes/${quoteB}/convert`));
    assertDenied(converted.status, converted.body);

    const removed = await hit(request(quotesApp).delete(`/api/v1/quotes/${quoteB}`));
    assertDenied(removed.status, removed.body);

    const foreignCustomer = await hit(request(quotesApp).post('/api/v1/quotes').send({
      clientName: A_QUOTE_CLIENT,
      lineItems: [{ description: 'Should not save', amount: 100 }],
      customerId: customerB,
    }));
    assertDenied(foreignCustomer.status, foreignCustomer.body);
    expect(foreignCustomer.status).toBe(404);

    const swapCustomer = await hit(
      request(quotesApp).put(`/api/v1/quotes/${quoteA}`).send({ customerId: customerB })
    );
    assertDenied(swapCustomer.status, swapCustomer.body);

    const bRow = await pool.query<{ client_name: string; status: string; user_id: string }>(
      `SELECT client_name, status, user_id FROM quotes WHERE id = $1`,
      [quoteB]
    );
    expect(bRow.rows[0]).toEqual({
      client_name: B_QUOTE_CLIENT,
      status: 'draft',
      user_id: userB.id,
    });

    const aRow = await pool.query<{ customer_id: string | null }>(
      `SELECT customer_id FROM quotes WHERE id = $1`,
      [quoteA]
    );
    expect(aRow.rows[0]?.customer_id).toBe(customerA);

    expect(await countRows(
      `SELECT count(*)::int AS count FROM quotes WHERE user_id = $1 AND customer_id = $2`,
      [userA.id, customerB]
    )).toBe(0);
    expect(await countRows(
      `SELECT count(*)::int AS count FROM invoices WHERE user_id = $1 AND client_name = $2`,
      [userA.id, B_QUOTE_CLIENT]
    )).toBe(0);
  });

  it('expenses: A cannot list, read, update, delete, or see B in stats', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const createdB = await hit(request(expensesApp).post('/api/v1/expenses').send({
      amount: 99999,
      category: 'materials',
      vendor: B_EXPENSE_VENDOR,
      description: 'secret materials',
    }));
    expect(createdB.status).toBe(201);
    const expenseB = readId(createdB.body, ['data', 'expense', 'id']);

    setLiveUser(userA);
    const createdA = await hit(request(expensesApp).post('/api/v1/expenses').send({
      amount: 150,
      category: 'fuel',
      vendor: A_EXPENSE_VENDOR,
    }));
    expect(createdA.status).toBe(201);

    const list = await hit(request(expensesApp).get('/api/v1/expenses'));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(A_EXPENSE_VENDOR);
    assertNoSecrets(list.body);

    const stats = await hit(request(expensesApp).get('/api/v1/expenses/stats'));
    expect(stats.status).toBe(200);
    assertNoSecrets(stats.body);
    expect(JSON.stringify(stats.body)).not.toContain('99999');

    const detail = await hit(request(expensesApp).get(`/api/v1/expenses/${expenseB}`));
    assertDenied(detail.status, detail.body);

    const updated = await hit(
      request(expensesApp).put(`/api/v1/expenses/${expenseB}`).send({ vendor: 'Hijacked Vendor', amount: 1 })
    );
    assertDenied(updated.status, updated.body);

    const removed = await hit(request(expensesApp).delete(`/api/v1/expenses/${expenseB}`));
    assertDenied(removed.status, removed.body);

    const row = await pool.query<{ vendor: string; amount: number; user_id: string }>(
      `SELECT vendor, amount, user_id FROM expenses WHERE id = $1`,
      [expenseB]
    );
    expect(row.rows[0]).toEqual({
      vendor: B_EXPENSE_VENDOR,
      amount: 99999,
      user_id: userB.id,
    });
  });

  it('job logs: A cannot read or write B, or attach B customer', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const customerBRes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: B_CUSTOMER_NAME,
      email: B_CUSTOMER_EMAIL,
      phone: B_CUSTOMER_PHONE,
    }));
    expect(customerBRes.status).toBe(201);
    const customerB = readId(customerBRes.body, ['data', 'customer', 'id']);

    const createdB = await hit(request(jobLogsApp).post('/api/v1/job-logs').send({
      description: B_JOB_DESC,
      customerId: customerB,
      siteAddress: '9 Secret Site',
    }));
    expect(createdB.status).toBe(201);
    const jobB = readId(createdB.body, ['data', 'jobLog', 'id']);

    setLiveUser(userA);
    const customerARes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: A_CUSTOMER_NAME,
    }));
    expect(customerARes.status).toBe(201);
    const customerA = readId(customerARes.body, ['data', 'customer', 'id']);

    const createdA = await hit(request(jobLogsApp).post('/api/v1/job-logs').send({
      description: A_JOB_DESC,
      customerId: customerA,
    }));
    expect(createdA.status).toBe(201);
    const jobA = readId(createdA.body, ['data', 'jobLog', 'id']);

    const list = await hit(request(jobLogsApp).get('/api/v1/job-logs'));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(A_JOB_DESC);
    assertNoSecrets(list.body);

    const active = await hit(request(jobLogsApp).get('/api/v1/job-logs/active'));
    expect(active.status).toBe(200);
    expect(JSON.stringify(active.body)).toContain(A_JOB_DESC);
    assertNoSecrets(active.body);

    const stats = await hit(request(jobLogsApp).get('/api/v1/job-logs/stats'));
    expect(stats.status).toBe(200);
    assertNoSecrets(stats.body);
    const totalLogs = (stats.body as { data: { stats: { totalLogs: number } } }).data.stats.totalLogs;
    expect(totalLogs).toBe(1);

    const detail = await hit(request(jobLogsApp).get(`/api/v1/job-logs/${jobB}`));
    assertDenied(detail.status, detail.body);

    const updated = await hit(
      request(jobLogsApp).put(`/api/v1/job-logs/${jobB}`).send({ description: 'Hijacked Job' })
    );
    assertDenied(updated.status, updated.body);

    const clock = await hit(request(jobLogsApp).post(`/api/v1/job-logs/${jobB}/clock-out`).send({}));
    assertDenied(clock.status, clock.body);

    const removed = await hit(request(jobLogsApp).delete(`/api/v1/job-logs/${jobB}`));
    assertDenied(removed.status, removed.body);

    const foreignCustomer = await hit(request(jobLogsApp).post('/api/v1/job-logs').send({
      description: 'Should not save',
      customerId: customerB,
    }));
    assertDenied(foreignCustomer.status, foreignCustomer.body);
    expect(foreignCustomer.status).toBe(404);

    const swapCustomer = await hit(
      request(jobLogsApp).put(`/api/v1/job-logs/${jobA}`).send({ customerId: customerB })
    );
    assertDenied(swapCustomer.status, swapCustomer.body);

    const bRow = await pool.query<{ description: string; status: string; user_id: string; customer_id: string }>(
      `SELECT description, status, user_id, customer_id FROM job_logs WHERE id = $1`,
      [jobB]
    );
    expect(bRow.rows[0]).toEqual({
      description: B_JOB_DESC,
      status: 'active',
      user_id: userB.id,
      customer_id: customerB,
    });

    const aRow = await pool.query<{ customer_id: string | null }>(
      `SELECT customer_id FROM job_logs WHERE id = $1`,
      [jobA]
    );
    expect(aRow.rows[0]?.customer_id).toBe(customerA);

    expect(await countRows(
      `SELECT count(*)::int AS count FROM job_logs WHERE user_id = $1 AND customer_id = $2`,
      [userA.id, customerB]
    )).toBe(0);
  });

  it('teams: A cannot read or change B team, members, or invites', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const createdB = await hit(request(teamsApp).post('/api/v1/teams').send({ name: B_TEAM_NAME }));
    expect(createdB.status).toBe(201);
    const teamB = readId(createdB.body, ['data', 'team', 'team', 'id']);
    const memberB = readId(createdB.body, ['data', 'team', 'membership', 'id']);

    const inviteCode = `${B_INVITE_CODE}-${randomUUID()}`;
    await pool.query(
      `INSERT INTO team_invites (team_id, email, role, invited_by, invite_code, expires_at)
       VALUES ($1, $2, 'worker', $3, $4, NOW() + interval '7 days')`,
      [teamB, 'invitee-b-secret-q2@example.test', userB.id, inviteCode]
    );

    setLiveUser(userA);
    const createdA = await hit(request(teamsApp).post('/api/v1/teams').send({ name: A_TEAM_NAME }));
    expect(createdA.status).toBe(201);

    const mine = await hit(request(teamsApp).get('/api/v1/teams/my-team'));
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).toContain(A_TEAM_NAME);
    assertNoSecrets(mine.body);

    const pending = await hit(request(teamsApp).get('/api/v1/teams/invites/pending'));
    expect(pending.status).toBe(200);
    assertNoSecrets(pending.body);

    const detail = await hit(request(teamsApp).get(`/api/v1/teams/${teamB}`));
    assertDenied(detail.status, detail.body);

    const renamed = await hit(
      request(teamsApp).put(`/api/v1/teams/${teamB}`).send({ name: 'Hijacked Team' })
    );
    assertDenied(renamed.status, renamed.body);

    const members = await hit(request(teamsApp).get(`/api/v1/teams/${teamB}/members`));
    assertDenied(members.status, members.body);
    expect(JSON.stringify(members.body)).not.toContain(userB.email);

    const invites = await hit(request(teamsApp).get(`/api/v1/teams/${teamB}/invites`));
    assertDenied(invites.status, invites.body);

    const removed = await hit(
      request(teamsApp).delete(`/api/v1/teams/${teamB}/members/${memberB}`)
    );
    assertDenied(removed.status, removed.body);

    const accepted = await hit(
      request(teamsApp).post(`/api/v1/teams/invites/${inviteCode}/accept`)
    );
    assertDenied(accepted.status, accepted.body);

    const declined = await hit(
      request(teamsApp).post(`/api/v1/teams/invites/${inviteCode}/decline`)
    );
    assertDenied(declined.status, declined.body);

    const teamRow = await pool.query<{ name: string; owner_id: string }>(
      `SELECT name, owner_id FROM teams WHERE id = $1`,
      [teamB]
    );
    expect(teamRow.rows[0]).toEqual({ name: B_TEAM_NAME, owner_id: userB.id });

    const memberRow = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM team_members
       WHERE id = $1 AND team_id = $2 AND user_id = $3 AND role = 'owner'`,
      [memberB, teamB, userB.id]
    );
    expect(memberRow.rows[0]?.count).toBe(1);

    const inviteRow = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM team_invites
       WHERE invite_code = $1 AND accepted_at IS NULL`,
      [inviteCode]
    );
    expect(inviteRow.rows[0]?.count).toBe(1);

    const aTeam = await pool.query<{ team_id: string | null }>(
      `SELECT team_id FROM users WHERE id = $1`,
      [userA.id]
    );
    expect(aTeam.rows[0]?.team_id).not.toBe(teamB);
  });

  it('sync batch: A cannot overwrite B rows or store B customer id', async () => {
    const userA = await insertUser();
    const userB = await insertUser();

    setLiveUser(userB);
    const customerBRes = await hit(request(customersApp).post('/api/v1/customers').send({
      name: B_CUSTOMER_NAME,
      email: B_CUSTOMER_EMAIL,
      phone: B_CUSTOMER_PHONE,
    }));
    expect(customerBRes.status).toBe(201);
    const customerB = readId(customerBRes.body, ['data', 'customer', 'id']);

    const invoiceBRes = await hit(request(invoicesApp).post('/api/v1/invoices').send({
      clientName: B_INVOICE_CLIENT,
      lineItems: [{ description: 'B labour', amount: 4000 }],
    }));
    expect(invoiceBRes.status).toBe(201);
    const invoiceB = readId(invoiceBRes.body, ['data', 'invoice', 'id']);

    const quoteBRes = await hit(request(quotesApp).post('/api/v1/quotes').send({
      clientName: B_QUOTE_CLIENT,
      lineItems: [{ description: 'B estimate', amount: 4000 }],
    }));
    expect(quoteBRes.status).toBe(201);
    const quoteB = readId(quoteBRes.body, ['data', 'quote', 'id']);

    const expenseBRes = await hit(request(expensesApp).post('/api/v1/expenses').send({
      amount: 4200,
      category: 'tools',
      vendor: B_EXPENSE_VENDOR,
    }));
    expect(expenseBRes.status).toBe(201);
    const expenseB = readId(expenseBRes.body, ['data', 'expense', 'id']);

    const jobBRes = await hit(request(jobLogsApp).post('/api/v1/job-logs').send({
      description: B_JOB_DESC,
    }));
    expect(jobBRes.status).toBe(201);
    const jobB = readId(jobBRes.body, ['data', 'jobLog', 'id']);

    setLiveUser(userA);
    const overwrite = await hit(request(syncApp).post('/api/v1/sync/batch').send({
      operations: [
        {
          id: 1,
          entity_type: 'invoices',
          entity_id: invoiceB,
          action: 'update',
          payload: { client_name: 'Hijacked Invoice' },
        },
        {
          id: 2,
          entity_type: 'quotes',
          entity_id: quoteB,
          action: 'update',
          payload: { client_name: 'Hijacked Quote' },
        },
        {
          id: 3,
          entity_type: 'expenses',
          entity_id: expenseB,
          action: 'update',
          payload: { vendor: 'Hijacked Vendor', amount: 1, category: 'other' },
        },
        {
          id: 4,
          entity_type: 'job-logs',
          entity_id: jobB,
          action: 'update',
          payload: { description: 'Hijacked Job' },
        },
      ],
      client_timestamp: new Date().toISOString(),
    }));
    expect(overwrite.status).toBe(200);
    assertNoSecrets(overwrite.body);

    expect((await pool.query(`SELECT client_name FROM invoices WHERE id = $1`, [invoiceB])).rows[0].client_name)
      .toBe(B_INVOICE_CLIENT);
    expect((await pool.query(`SELECT client_name FROM quotes WHERE id = $1`, [quoteB])).rows[0].client_name)
      .toBe(B_QUOTE_CLIENT);
    expect((await pool.query(`SELECT vendor, amount FROM expenses WHERE id = $1`, [expenseB])).rows[0])
      .toEqual({ vendor: B_EXPENSE_VENDOR, amount: 4200 });
    expect((await pool.query(`SELECT description FROM job_logs WHERE id = $1`, [jobB])).rows[0].description)
      .toBe(B_JOB_DESC);

    const plantedInvoice = randomUUID();
    const plantedQuote = randomUUID();
    const plantedJob = randomUUID();
    const plant = await hit(request(syncApp).post('/api/v1/sync/batch').send({
      operations: [
        {
          id: 11,
          entity_type: 'invoices',
          entity_id: plantedInvoice,
          action: 'create',
          payload: {
            client_name: A_INVOICE_CLIENT,
            customer_id: customerB,
            line_items: [],
            subtotal: 100,
            gst_amount: 15,
            total: 115,
          },
        },
        {
          id: 12,
          entity_type: 'quotes',
          entity_id: plantedQuote,
          action: 'create',
          payload: {
            client_name: A_QUOTE_CLIENT,
            customer_id: customerB,
            line_items: [],
            subtotal: 100,
            gst_amount: 15,
            total: 115,
          },
        },
        {
          id: 13,
          entity_type: 'job-logs',
          entity_id: plantedJob,
          action: 'create',
          payload: {
            description: 'Should not link',
            customer_id: customerB,
          },
        },
      ],
      client_timestamp: new Date().toISOString(),
    }));
    expect(plant.status).toBe(200);
    assertNoSecrets(plant.body);
    const results = (plant.body as { results: { id: number; success: boolean }[] }).results;
    expect(results.every((row) => row.success === false)).toBe(true);

    expect(await countRows(
      `SELECT count(*)::int AS count FROM invoices WHERE id = $1 OR (user_id = $2 AND customer_id = $3)`,
      [plantedInvoice, userA.id, customerB]
    )).toBe(0);
    expect(await countRows(
      `SELECT count(*)::int AS count FROM quotes WHERE id = $1 OR (user_id = $2 AND customer_id = $3)`,
      [plantedQuote, userA.id, customerB]
    )).toBe(0);
    expect(await countRows(
      `SELECT count(*)::int AS count FROM job_logs WHERE id = $1 OR (user_id = $2 AND customer_id = $3)`,
      [plantedJob, userA.id, customerB]
    )).toBe(0);
  });
});
