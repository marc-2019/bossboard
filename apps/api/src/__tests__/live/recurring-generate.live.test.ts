/**
 * Live Postgres proofs for recurring generate.
 *
 * A second generate for the same template and Auckland calendar month must
 * not insert another invoice, including when the two calls overlap.
 * Due dates are Auckland civil dates (Pacific/Auckland, DST-aware).
 *
 * Fail (do not skip) when DATABASE_URL is unreachable.
 */

import { randomUUID } from 'crypto';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for live recurring generate proofs');
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

import { runMigrations } from '../../services/migrate.js';
import db from '../../services/database.js';
import { generateInvoiceFromRecurring } from '../../services/recurring-invoices.js';

/** 2026-04-05 00:30 NZDT, before DST ends at 03:00. UTC date is still 4 April. */
const APRIL_EARLY_NZDT = new Date('2026-04-04T11:30:00.000Z');
/** 2026-04-01 01:00 NZDT. UTC date is still 31 March. */
const APRIL_OPEN_NZDT = new Date('2026-03-31T12:00:00.000Z');
/** 2026-05-01 00:00 NZST. UTC date is still 30 April. */
const MAY_OPEN_NZST = new Date('2026-04-30T12:00:00.000Z');

function asIsoDate(value: unknown): string {
  // node-pg parses DATE as local midnight. toISOString() would shift that
  // back a day in Pacific/Auckland. Read the civil Y-M-D instead.
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : String(value);
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
      `Live recurring generate proofs require a reachable Postgres (DATABASE_URL). ${String(err)}`
    );
  }
  await applyPendingMigrations();
}, 120000);

afterAll(async () => {
  await pool.end();
  await db.close();
});

async function seedTemplate(paymentTerms = 20): Promise<{ userId: string; recurringId: string }> {
  const email = `live-recurring-${randomUUID()}@example.test`;
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, is_verified)
     VALUES ($1, 'x', 'Live Recurring', true)
     RETURNING id`,
    [email]
  );
  const userId = user.rows[0].id;
  const customer = await pool.query<{ id: string }>(
    `INSERT INTO customers (user_id, name, email)
     VALUES ($1, 'Auckland Maintenance Ltd', 'accounts@example.test')
     RETURNING id`,
    [userId]
  );
  const product = await pool.query<{ id: string }>(
    `INSERT INTO products_services (user_id, name, unit_price, type)
     VALUES ($1, 'Monthly service', 15000, 'fixed')
     RETURNING id`,
    [userId]
  );
  const recurring = await pool.query<{ id: string }>(
    `INSERT INTO recurring_invoices (
       user_id, customer_id, name, recurrence, day_of_month,
       is_auto_generate, include_gst, payment_terms, next_generation_date
     )
     VALUES ($1, $2, 'Monthly', 'monthly', 5, true, true, $3, '2026-04-05')
     RETURNING id`,
    [userId, customer.rows[0].id, paymentTerms]
  );
  const recurringId = recurring.rows[0].id;
  await pool.query(
    `INSERT INTO recurring_line_items (
       recurring_invoice_id, product_service_id, description, unit_price, quantity, type, sort_order
     )
     VALUES ($1, $2, 'Monthly service', 15000, 1, 'fixed', 0)`,
    [recurringId, product.rows[0].id]
  );
  return { userId, recurringId };
}

async function invoiceRows(recurringId: string): Promise<Array<{ id: string; due_date: unknown; recurring_period: string | null }>> {
  const result = await pool.query<{ id: string; due_date: unknown; recurring_period: string | null }>(
    `SELECT id, due_date, recurring_period
     FROM invoices
     WHERE recurring_invoice_id = $1
     ORDER BY created_at ASC, id ASC`,
    [recurringId]
  );
  return result.rows;
}

describe('live recurring generate idempotency and Auckland dates', () => {
  it('stores an Auckland due date for an instant whose UTC date is the previous day', async () => {
    const { userId, recurringId } = await seedTemplate(20);
    const invoice = await generateInvoiceFromRecurring(recurringId, userId, undefined, APRIL_EARLY_NZDT) as { id: string };
    const rows = await invoiceRows(recurringId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(invoice.id);
    // 5 April 2026 NZDT + 20 calendar days. Not 2026-04-24 from toISOString.
    expect(asIsoDate(rows[0].due_date)).toBe('2026-04-25');
    expect(rows[0].recurring_period).toBe('2026-04');
  });

  it('a second generate for the same template and period does not insert another invoice', async () => {
    const { userId, recurringId } = await seedTemplate(20);
    const first = await generateInvoiceFromRecurring(recurringId, userId, undefined, APRIL_OPEN_NZDT) as { id: string };
    const second = await generateInvoiceFromRecurring(
      recurringId,
      userId,
      { 'ignored-override': 1 },
      new Date('2026-04-04T14:30:00.000Z'), // still 5 April 2026 NZST, same period
    ) as { id: string };
    const rows = await invoiceRows(recurringId);
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].recurring_period).toBe('2026-04');
  });

  it('two overlapping generates yield exactly one invoice', async () => {
    const { userId, recurringId } = await seedTemplate(20);
    const [a, b] = await Promise.all([
      generateInvoiceFromRecurring(recurringId, userId, undefined, APRIL_OPEN_NZDT),
      generateInvoiceFromRecurring(recurringId, userId, undefined, APRIL_OPEN_NZDT),
    ]);
    const rows = await invoiceRows(recurringId);
    expect(rows).toHaveLength(1);
    expect((a as { id: string }).id).toBe(rows[0].id);
    expect((b as { id: string }).id).toBe(rows[0].id);
  });

  it('the next Auckland month is a new period and inserts a second invoice', async () => {
    const { userId, recurringId } = await seedTemplate(14);
    const april = await generateInvoiceFromRecurring(recurringId, userId, undefined, APRIL_OPEN_NZDT) as { id: string };
    const may = await generateInvoiceFromRecurring(recurringId, userId, undefined, MAY_OPEN_NZST) as { id: string };
    const rows = await invoiceRows(recurringId);
    expect(rows).toHaveLength(2);
    expect(may.id).not.toBe(april.id);
    const periods = rows.map((row) => row.recurring_period).sort();
    expect(periods).toEqual(['2026-04', '2026-05']);
    const aprilRow = rows.find((row) => row.id === april.id);
    const mayRow = rows.find((row) => row.id === may.id);
    expect(asIsoDate(aprilRow?.due_date)).toBe('2026-04-15'); // 1 April + 14 days
    expect(asIsoDate(mayRow?.due_date)).toBe('2026-05-15'); // 1 May + 14 days
  });
});
