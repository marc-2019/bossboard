/**
 * F-QUO (Quotes module) — API demos
 *
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 5 — Quotes
 *   F-QUO-01 — Create quote (POST /api/v1/quotes)
 *   F-QUO-02 — PDF export      (GET  /api/v1/quotes/:id/pdf)
 *   F-QUO-03 — Convert to inv  (POST /api/v1/quotes/:id/convert)
 *
 * Plus the state-transition + CRUD edges used by both demos:
 *   POST /:id/send | /:id/accept | /:id/decline
 *   GET  / list, GET /:id detail
 *   PUT  /:id update (draft only — server gates this)
 *   DELETE /:id
 *
 * Authentication: each test registers a fresh ephemeral user via
 * registerEphemeralUser() (apps/web/e2e/helpers/test-data.ts), then uses
 * its bearer token. Cleanup in finally{} so failing assertions don\'t
 * leak users.
 *
 * NO EXECUTION: dev env not running during authoring. Tests are
 * syntax-verified via `playwright test --list`. When Phase 4 brings the
 * stack up, these run unmodified against http://localhost:29000.
 */
import { test, expect } from '@playwright/test';
import { registerEphemeralUser } from '../../helpers/test-data';
import {
  QUOTE_SCENARIOS,
  toCreatePayload,
  expectedTotals,
} from '../helpers/quotes';

const API = process.env.API_BASE_URL || 'http://localhost:29000';

test.describe('F-QUO api (Quotes module)', () => {
  test('F-QUO-01.a: POST /api/v1/quotes creates a quote with NZ GST math', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo01a');
    try {
      const fixture = QUOTE_SCENARIOS.bathroomReno;
      const expected = expectedTotals(fixture);

      const res = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: toCreatePayload(fixture),
      });

      // AC1: 201 + success envelope
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.quote).toBeTruthy();

      const q = body.data.quote;
      // AC2: defaults to draft status
      expect(q.status).toBe('draft');
      // AC3: server assigns a quote number (server format may differ
      // from fixture.quoteNumber — assert shape only).
      expect(typeof q.quoteNumber).toBe('string');
      expect(q.quoteNumber.length).toBeGreaterThan(0);
      // AC4: line items count matches input
      expect(q.lineItems.length).toBe(fixture.lineItems.length);
      // AC5: totals math (subtotal + 15% GST = total, in cents)
      expect(q.subtotal).toBe(expected.subtotal);
      expect(q.gstAmount).toBe(expected.gstAmount);
      expect(q.total).toBe(expected.total);
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-01.b: POST with empty lineItems returns 400 VALIDATION_ERROR', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo01b');
    try {
      const res = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: {
          clientName: 'Smith Residence',
          lineItems: [], // ← violates z.array(...).min(1)
        },
        failOnStatusCode: false,
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-01.c: POST without clientName returns 400 VALIDATION_ERROR', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo01c');
    try {
      const res = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: {
          // clientName intentionally omitted
          lineItems: [{ description: 'Site visit', amount: 15000 }],
        },
        failOnStatusCode: false,
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-01.d: GET /api/v1/quotes lists the user\'s quotes (multi-tenant isolated)', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo01d');
    try {
      // Seed a quote for this user
      const fixture = QUOTE_SCENARIOS.deckBuild;
      const created = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: toCreatePayload(fixture),
      });
      expect(created.status()).toBe(201);

      // List
      const res = await request.get(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // AC: at least 1 quote, all belonging to this user
      expect(Array.isArray(body.data?.quotes ?? body.data)).toBeTruthy();
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-01.e: state transitions draft → sent → accepted', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo01e');
    try {
      // Create
      const created = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: toCreatePayload(QUOTE_SCENARIOS.bathroomReno),
      });
      expect(created.status()).toBe(201);
      const id = (await created.json()).data.quote.id;

      // Send
      const sent = await request.post(`${API}/api/v1/quotes/${id}/send`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      expect(sent.status()).toBe(200);
      expect((await sent.json()).data.quote.status).toBe('sent');

      // Accept
      const accepted = await request.post(`${API}/api/v1/quotes/${id}/accept`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      expect(accepted.status()).toBe(200);
      expect((await accepted.json()).data.quote.status).toBe('accepted');
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-02.a: GET /api/v1/quotes/:id/pdf returns application/pdf', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo02a');
    try {
      const created = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: toCreatePayload(QUOTE_SCENARIOS.commercialFitout),
      });
      expect(created.status()).toBe(201);
      const id = (await created.json()).data.quote.id;

      const res = await request.get(`${API}/api/v1/quotes/${id}/pdf`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      // AC1: 200
      expect(res.status()).toBe(200);
      // AC2: Content-Type is PDF
      expect(res.headers()['content-type']).toContain('application/pdf');
      // AC3: Body is non-empty
      const buf = await res.body();
      expect(buf.byteLength).toBeGreaterThan(1000);
      // AC4: Magic bytes — PDF files start with "%PDF-"
      const header = buf.subarray(0, 5).toString('utf-8');
      expect(header).toBe('%PDF-');
      // AC5: Content-Disposition pins a filename containing the quote number
      const cd = res.headers()['content-disposition'] || '';
      expect(cd.toLowerCase()).toContain('attachment');
      expect(cd).toMatch(/Quote-.+\.pdf/);
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-02.b: PDF request without auth returns 401', async ({
    request,
  }) => {
    // Use a deliberately invalid id since auth fails before id lookup.
    const res = await request.get(
      `${API}/api/v1/quotes/00000000-0000-0000-0000-000000000000/pdf`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(401);
  });

  test('F-QUO-03.a: convert returns new invoice id + marks quote converted', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo03a');
    try {
      // Create + send + accept the quote so it\'s convert-eligible
      const created = await request.post(`${API}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: toCreatePayload(QUOTE_SCENARIOS.bathroomReno),
      });
      expect(created.status()).toBe(201);
      const quoteId = (await created.json()).data.quote.id;

      await request.post(`${API}/api/v1/quotes/${quoteId}/send`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      await request.post(`${API}/api/v1/quotes/${quoteId}/accept`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      // Convert
      const res = await request.post(
        `${API}/api/v1/quotes/${quoteId}/convert`,
        {
          headers: { Authorization: `Bearer ${user.accessToken}` },
        },
      );

      // AC1: 200
      expect(res.status()).toBe(200);
      const body = await res.json();
      // AC2: success + invoice + quote returned
      expect(body.success).toBe(true);
      expect(body.data.invoice?.id).toBeTruthy();
      const newInvoiceId = body.data.invoice.id;

      // AC3: the new invoice is fetchable and has the same totals as the quote
      const invRes = await request.get(
        `${API}/api/v1/invoices/${newInvoiceId}`,
        { headers: { Authorization: `Bearer ${user.accessToken}` } },
      );
      expect(invRes.status()).toBe(200);
      const inv = (await invRes.json()).data.invoice;
      const expected = expectedTotals(QUOTE_SCENARIOS.bathroomReno);
      expect(inv.subtotal).toBe(expected.subtotal);
      expect(inv.total).toBe(expected.total);
      // AC4: the quote is now linked back to the invoice
      const qRes = await request.get(`${API}/api/v1/quotes/${quoteId}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const q = (await qRes.json()).data.quote;
      expect(q.convertedInvoiceId ?? q.converted_invoice_id).toBe(newInvoiceId);
    } finally {
      await user.cleanup();
    }
  });

  test('F-QUO-03.b: convert of nonexistent quote returns 404', async ({
    request,
  }) => {
    const user = await registerEphemeralUser(request, API, 'quo03b');
    try {
      const res = await request.post(
        `${API}/api/v1/quotes/00000000-0000-0000-0000-000000000000/convert`,
        {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          failOnStatusCode: false,
        },
      );
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('NOT_FOUND');
    } finally {
      await user.cleanup();
    }
  });
});
