/**
 * Live SQL proofs for quote sent_at (P1.1 4-eyes holes).
 *
 * HTTP 200 is not proof. These tests INSERT a real draft, exercise the write
 * path, then SELECT sent_at from Postgres. Injected-fixture unit asserts do
 * not close these cases. Fail (do not skip) when DATABASE_URL is unreachable.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import request from 'supertest';
import express, { Express } from 'express';

const NUDGE_LEAK_KEYS = [
  'lastOperatorNudgeAt',
  'operatorNudgeCount',
  'last_operator_nudge_at',
  'operator_nudge_count',
];

function assertNoNudgeLeak(payload: Record<string, unknown>, label: string): void {
  for (const key of NUDGE_LEAK_KEYS) {
    expect({ label, key, present: key in payload, value: payload[key] }).toEqual({
      label,
      key,
      present: false,
      value: undefined,
    });
  }
}

function assertTimestamptzIso(value: unknown): Date {
  expect(value).toBeTruthy();
  const asString =
    value instanceof Date ? value.toISOString() : String(value);
  // Must be parseable and UTC-honest (Z or numeric offset), not a naive local string.
  expect(asString).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
  );
  const parsed = new Date(asString);
  expect(Number.isNaN(parsed.getTime())).toBe(false);
  return parsed;
}

type LiveUser = { userId: string; email: string };
function liveUserSlot(): { current: LiveUser } {
  const g = globalThis as unknown as { __quoteSentAtLiveUser?: { current: LiveUser } };
  if (!g.__quoteSentAtLiveUser) {
    g.__quoteSentAtLiveUser = { current: { userId: '', email: '' } };
  }
  return g.__quoteSentAtLiveUser;
}

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: { user?: { userId: string; email: string } }, _res: unknown, next: () => void) {
    const live = (globalThis as unknown as { __quoteSentAtLiveUser: { current: LiveUser } })
      .__quoteSentAtLiveUser.current;
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
}));

const mockSendQuoteEmail = jest.fn();
jest.mock('../../services/email.js', () => ({
  __esModule: true,
  default: {
    isEmailConfigured: () => true,
    sendQuoteEmail: (...args: unknown[]) => mockSendQuoteEmail(...args),
    resolveInvoiceBcc: () => null,
  },
}));

jest.mock('../../services/pdf.js', () => ({
  __esModule: true,
  default: {
    generateQuotePDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 live-quote')),
  },
}));

import { runMigrations } from '../../services/migrate.js';
import { createQuote, markAsSent, getQuoteById, listQuotes } from '../../services/quotes.js';
import db from '../../services/database.js';
import quoteRoutes from '../../routes/quotes.js';
import syncRoutes from '../../routes/sync.js';
import { errorHandler } from '../../middleware/error.js';

liveUserSlot();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set for live quote sent_at proofs');
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

let quotesApp: Express;
let syncApp: Express;

function setLiveUser(userId: string, email: string): void {
  liveUserSlot().current = { userId, email };
}

async function insertUser(): Promise<{ id: string; email: string }> {
  const email = `live-sent-at-${randomUUID()}@example.test`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name, is_verified)
     VALUES ($1, 'x', 'Live Sent At', true)
     RETURNING id`,
    [email]
  );
  return { id: result.rows[0].id, email };
}

async function selectSentAt(quoteId: string): Promise<{
  status: string;
  sent_at: Date | null;
  updated_at: Date;
}> {
  const result = await pool.query<{
    status: string;
    sent_at: Date | null;
    updated_at: Date;
  }>(`SELECT status, sent_at, updated_at FROM quotes WHERE id = $1`, [quoteId]);
  expect(result.rows.length).toBe(1);
  return result.rows[0];
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    throw new Error(
      `Live quote sent_at proofs require a reachable Postgres (DATABASE_URL). ${String(err)}`
    );
  }
  await runMigrations();
  quotesApp = express();
  quotesApp.use(express.json());
  quotesApp.use('/api/v1/quotes', quoteRoutes);
  quotesApp.use(errorHandler);

  syncApp = express();
  syncApp.use(express.json());
  syncApp.use('/api/v1/sync', syncRoutes);
  syncApp.use(errorHandler);
}, 120000);

afterAll(async () => {
  await pool.end();
  await db.close();
});

beforeEach(() => {
  mockSendQuoteEmail.mockReset();
  mockSendQuoteEmail.mockResolvedValue({ messageId: 'live-msg-1' });
});

describe('live quote sent_at proofs', () => {
  it('1: live draft NULL sent_at → markAsSent / POST /send → SELECT sent_at is first-send via COALESCE', async () => {
    const user = await insertUser();
    setLiveUser(user.id, user.email);

    const created = await createQuote(user.id, {
      clientName: 'Live Send Client',
      clientEmail: 'client@example.test',
      lineItems: [{ description: 'Labour', amount: 10000 }],
      includeGst: true,
    });
    expect(created.status).toBe('draft');
    expect(created.sentAt ?? null).toBeNull();

    const beforeSql = await selectSentAt(created.id);
    expect(beforeSql.status).toBe('draft');
    expect(beforeSql.sent_at).toBeNull();

    const t0 = Date.now();
    const stamped = await markAsSent(created.id, user.id);
    const t1 = Date.now();
    expect(stamped).not.toBeNull();
    expect(stamped!.status).toBe('sent');

    const afterMark = await selectSentAt(created.id);
    expect(afterMark.status).toBe('sent');
    expect(afterMark.sent_at).not.toBeNull();
    const markSentAt = assertTimestamptzIso(afterMark.sent_at);
    expect(markSentAt.getTime()).toBeGreaterThanOrEqual(t0 - 2000);
    expect(markSentAt.getTime()).toBeLessThanOrEqual(t1 + 2000);

    const firstStamp = markSentAt.toISOString();

    // Second markAsSent is a no-op; SELECT stamp must be unchanged (COALESCE).
    const second = await markAsSent(created.id, user.id);
    expect(second).toBeNull();
    const afterSecond = await selectSentAt(created.id);
    expect(assertTimestamptzIso(afterSecond.sent_at).toISOString()).toBe(firstStamp);

    // HTTP send on a fresh draft — 200 is not enough; SELECT is the proof.
    const createdHttp = await createQuote(user.id, {
      clientName: 'Live HTTP Send',
      lineItems: [{ description: 'Callout', amount: 5000 }],
    });
    const httpBefore = Date.now();
    const sendRes = await request(quotesApp).post(`/api/v1/quotes/${createdHttp.id}/send`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body?.data?.quote?.status).toBe('sent');
    const httpRow = await selectSentAt(createdHttp.id);
    expect(httpRow.status).toBe('sent');
    const httpSentAt = assertTimestamptzIso(httpRow.sent_at);
    expect(httpSentAt.getTime()).toBeGreaterThanOrEqual(httpBefore - 2000);
    expect(httpSentAt.getTime()).toBeLessThanOrEqual(Date.now() + 2000);
  });

  it('2: live POST /sync/batch status=sent → SELECT sent only if sent_at is non-NULL', async () => {
    const user = await insertUser();
    setLiveUser(user.id, user.email);
    const entityId = randomUUID();

    const res = await request(syncApp)
      .post('/api/v1/sync/batch')
      .send({
        operations: [
          {
            id: 1,
            entity_type: 'quotes',
            entity_id: entityId,
            action: 'create',
            payload: {
              quote_number: 'QTE-LIVE-1',
              client_name: 'Batch Sent Client',
              line_items: [{ description: 'Estimate', amount: 8000 }],
              subtotal: 8000,
              gst_amount: 1200,
              total: 9200,
              status: 'sent',
            },
          },
        ],
        client_timestamp: new Date().toISOString(),
      });

    // Batch 200 is not proof.
    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);

    const row = await selectSentAt(entityId);
    if (row.status === 'sent') {
      expect(row.sent_at).not.toBeNull();
      assertTimestamptzIso(row.sent_at);
    } else {
      // Reject path is also valid: must not persist sent-with-null-sent_at.
      expect(row.sent_at).toBeNull();
    }
  });

  it('3: live migration 027 must not treat updated_at as first-send', async () => {
    const user = await insertUser();
    const quoteId = randomUUID();
    const lieUpdatedAt = '2019-03-04T05:06:07.000Z';

    await pool.query(
      `INSERT INTO quotes (
         id, user_id, quote_number, client_name, line_items,
         subtotal, gst_amount, total, status, sent_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, 1000, 150, 1150, 'accepted', NULL)`,
      [quoteId, user.id, 'QTE-BACKFILL', 'Past Draft', '[]']
    );

    // updated_at trigger would rewrite NOW() on UPDATE — disable it so the lie is visible.
    await pool.query('ALTER TABLE quotes DISABLE TRIGGER update_quotes_updated_at');
    try {
      await pool.query(`UPDATE quotes SET updated_at = $1::timestamptz, sent_at = NULL WHERE id = $2`, [
        lieUpdatedAt,
        quoteId,
      ]);
    } finally {
      await pool.query('ALTER TABLE quotes ENABLE TRIGGER update_quotes_updated_at');
    }

    const before = await selectSentAt(quoteId);
    expect(before.status).toBe('accepted');
    expect(before.sent_at).toBeNull();
    expect(new Date(before.updated_at).toISOString()).toBe(lieUpdatedAt);

    const migrationPath = path.resolve(
      __dirname,
      '../../../../../database/migrations/027_quote_chase.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/027|sent_at/i);
    await pool.query(sql);

    const after = await selectSentAt(quoteId);
    const afterSentAt =
      after.sent_at == null ? null : new Date(after.sent_at).toISOString();
    // Must not copy the non-first-send updated_at. Historical rows stay NULL.
    expect(afterSentAt).not.toBe(lieUpdatedAt);
    expect(afterSentAt).toBeNull();
  });

  it('4: live POST /email after sendQuoteEmail 200/messageId → SELECT sent_at (or fail the re-GET)', async () => {
    const user = await insertUser();
    setLiveUser(user.id, user.email);

    const created = await createQuote(user.id, {
      clientName: 'Email Stamp Client',
      clientEmail: 'email-client@example.test',
      lineItems: [{ description: 'Email job', amount: 4000 }],
    });
    expect((await selectSentAt(created.id)).sent_at).toBeNull();

    const res = await request(quotesApp)
      .post(`/api/v1/quotes/${created.id}/email`)
      .send({ recipientEmail: 'recipient@example.test' });

    expect(mockSendQuoteEmail).toHaveBeenCalled();
    const messageId = res.body?.data?.messageId;

    if (res.status === 200 && messageId) {
      const row = await selectSentAt(created.id);
      expect(row.status).toBe('sent');
      expect(row.sent_at).not.toBeNull();
      assertTimestamptzIso(row.sent_at);
      expect(res.body.data.quote?.sent_at ?? res.body.data.quote?.sentAt).toBeTruthy();
    } else {
      // Fail-closed: email provider 200/messageId must not produce HTTP 200 without a stamp.
      expect(res.status).not.toBe(200);
    }
  });

  it('5: live GET list/:id and mobile transform expose sent_at and do not leak nudge fields', async () => {
    const user = await insertUser();
    setLiveUser(user.id, user.email);

    const created = await createQuote(user.id, {
      clientName: 'No Nudge Leak',
      lineItems: [{ description: 'Work', amount: 2000 }],
    });
    await markAsSent(created.id, user.id);

    const detail = await request(quotesApp).get(`/api/v1/quotes/${created.id}`);
    expect(detail.status).toBe(200);
    const detailQuote = detail.body.data.quote as Record<string, unknown>;
    expect(detailQuote.sent_at ?? detailQuote.sentAt).toBeTruthy();
    assertTimestamptzIso(detailQuote.sent_at ?? detailQuote.sentAt);
    assertNoNudgeLeak(detailQuote, 'GET /:id');

    const list = await request(quotesApp).get('/api/v1/quotes?status=sent');
    expect(list.status).toBe(200);
    const listed = (list.body.data.quotes as Record<string, unknown>[]).find(
      (q) => q.id === created.id
    );
    expect(listed).toBeDefined();
    expect(listed!.sent_at ?? listed!.sentAt).toBeTruthy();
    assertTimestamptzIso(listed!.sent_at ?? listed!.sentAt);
    assertNoNudgeLeak(listed!, 'GET /?status=sent');

    const mobile = await getQuoteById(created.id, user.id);
    expect(mobile).not.toBeNull();
    expect(mobile!.sent_at).toBeTruthy();
    assertTimestamptzIso(mobile!.sent_at);
    assertNoNudgeLeak(mobile as Record<string, unknown>, 'transformForMobile');

    const listedSvc = await listQuotes(user.id, { status: 'sent' });
    const svcItem = listedSvc.quotes.find((q) => q.id === created.id);
    expect(svcItem).toBeDefined();
    expect(svcItem!.sent_at).toBeTruthy();
    assertNoNudgeLeak(svcItem as Record<string, unknown>, 'listQuotes transform');
  });
});
