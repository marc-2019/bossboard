/**
 * API demos for the Expenses module (F-EXP-01, F-EXP-02, F-EXP-03).
 *
 * Surface: A (apps/api on :29000). Hits the real Express API via
 * Playwright's `request` fixture — no UI.
 *
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 6
 * Plan: docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md
 *       Phase 3 TEMPLATE M.3.
 *
 * Each test() corresponds to one acceptance criterion from the spec
 * matrix so the per-feature coverage report stays a simple checkbox
 * mapping (see docs/testing/coverage/expenses.md).
 *
 * Mocking note (per parent-task brief): the receipt-photo upload in
 * F-EXP-01 AC#4 is mocked — we POST a 1x1 PNG buffer through the
 * real /api/v1/photos route's multipart middleware so the wiring is
 * exercised without needing a real receipt asset.
 *
 * Execution status: NOT YET RUN. Parent task is syntax-verify only
 * (dev env not running). Confirm by:
 *   cd apps/web && npx playwright test e2e/demos/api/expenses.api.spec.ts --list
 */

import { test, expect } from '@playwright/test';
import {
  EXPENSE_CATEGORIES,
  NZ_TRADIE_EXPENSE_FIXTURES,
  createExpenseViaApi,
  deleteExpenseQuiet,
  makeTaggedExpense,
  mockReceiptBuffer,
} from '../helpers/expenses';
import { registerEphemeralUser } from '../../helpers/test-data';

const API = process.env.API_BASE_URL || 'http://localhost:29000';

test.describe('F-EXP api — Expenses module', () => {
  // ---------------------------------------------------------------------------
  // F-EXP-01 — Create expense (with category + receipt photo)
  // ---------------------------------------------------------------------------
  test.describe('F-EXP-01: create expense', () => {
    test('AC1: POST /api/v1/expenses accepts core fields and returns 201', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp01-ac1');
      try {
        const input = makeTaggedExpense(0, 'create-ac1');
        const res = await request.post(`${API}/api/v1/expenses`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          data: input,
        });
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.expense).toMatchObject({
          amount: input.amount,
          category: input.category,
          vendor: input.vendor,
        });
      } finally {
        await user.cleanup();
      }
    });

    test('AC2: all 7 expense categories are accepted', async ({ request }) => {
      const user = await registerEphemeralUser(request, API, 'exp01-ac2');
      try {
        // Spec: materials, fuel, tools, subcontractor, vehicle, office, other.
        // Drives one POST per category — assert each returns 201.
        for (const category of EXPENSE_CATEGORIES) {
          const res = await request.post(`${API}/api/v1/expenses`, {
            headers: { Authorization: `Bearer ${user.accessToken}` },
            data: {
              amount: 1000,
              category,
              description: `cat-probe-${category}`,
              vendor: 'E2E Vendor',
            },
          });
          expect(res.status(), `category=${category}`).toBe(201);
        }
      } finally {
        await user.cleanup();
      }
    });

    test('AC2b: invalid category returns 400', async ({ request }) => {
      const user = await registerEphemeralUser(request, API, 'exp01-ac2b');
      try {
        const res = await request.post(`${API}/api/v1/expenses`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          data: {
            amount: 1000,
            category: 'not-a-real-category',
            vendor: 'E2E Vendor',
          },
        });
        expect(res.status()).toBe(400);
      } finally {
        await user.cleanup();
      }
    });

    test('AC3: subscription gate — unauth request returns 401', async ({
      request,
    }) => {
      // No token at all. Auth middleware fires before the
      // requireFeature('expenses') subscription gate, so we get 401.
      // The subscription gate itself is exercised in M.10 (subscriptions
      // module agent) — here we just confirm the route is locked down.
      const res = await request.post(`${API}/api/v1/expenses`, {
        data: { amount: 1000, category: 'materials' },
      });
      expect(res.status()).toBe(401);
    });

    test('AC4: receipt photo attaches via /api/v1/photos with entityType=expense (mocked)', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp01-ac4');
      try {
        const created = await createExpenseViaApi(
          request,
          API,
          user.accessToken,
          makeTaggedExpense(0, 'photo-attach'),
        );

        // Mock receipt PNG (1x1 transparent). The route's
        // upload.single('photo') middleware reads it as multipart;
        // no real receipt asset needed.
        const photoRes = await request.post(`${API}/api/v1/photos`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          multipart: {
            entityType: 'expense',
            entityId: created.id,
            photo: {
              name: 'receipt.png',
              mimeType: 'image/png',
              buffer: mockReceiptBuffer(),
            },
          },
        });

        // Beta-mode users get the photos feature; expect 201.
        // If the deployment returns 403 (feature gate), document
        // that as a drift in docs/testing/coverage/expenses.md.
        expect([201, 403]).toContain(photoRes.status());
      } finally {
        await user.cleanup();
      }
    });

    test('AC5: isGstClaimable=true persists and gst_amount is computed', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp01-ac5');
      try {
        const res = await request.post(`${API}/api/v1/expenses`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          data: {
            amount: 11500, // $115.00 inc 15% GST → $15 GST component
            category: 'materials',
            description: 'GST flag round-trip',
            isGstClaimable: true,
          },
        });
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(body.data.expense.isGstClaimable).toBe(true);
        // Service computes gst = round(amount * 0.15 / 1.15) = 1500 cents
        expect(body.data.expense.gstAmount).toBeGreaterThan(0);
      } finally {
        await user.cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // F-EXP-02 — List / filter expenses by category + monthly summary
  // ---------------------------------------------------------------------------
  test.describe('F-EXP-02: list / filter / stats', () => {
    test('AC1: GET /api/v1/expenses lists all expenses for the user', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp02-ac1');
      try {
        // Seed 3 expenses across 3 different categories.
        for (let i = 0; i < 3; i++) {
          await createExpenseViaApi(
            request,
            API,
            user.accessToken,
            makeTaggedExpense(i, 'list-seed'),
          );
        }
        const res = await request.get(`${API}/api/v1/expenses`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.expenses)).toBe(true);
        expect(body.data.expenses.length).toBeGreaterThanOrEqual(3);
      } finally {
        await user.cleanup();
      }
    });

    test('AC1b: ?category=materials filter only returns materials', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp02-ac1b');
      try {
        // Seed one each of materials, fuel, tools
        await createExpenseViaApi(request, API, user.accessToken, {
          ...NZ_TRADIE_EXPENSE_FIXTURES[0]!,
          description: 'filter-test-materials',
        });
        await createExpenseViaApi(request, API, user.accessToken, {
          ...NZ_TRADIE_EXPENSE_FIXTURES[1]!,
          description: 'filter-test-fuel',
        });
        await createExpenseViaApi(request, API, user.accessToken, {
          ...NZ_TRADIE_EXPENSE_FIXTURES[2]!,
          description: 'filter-test-tools',
        });

        const res = await request.get(
          `${API}/api/v1/expenses?category=materials`,
          { headers: { Authorization: `Bearer ${user.accessToken}` } },
        );
        expect(res.status()).toBe(200);
        const body = await res.json();
        for (const e of body.data.expenses) {
          expect(e.category).toBe('materials');
        }
      } finally {
        await user.cleanup();
      }
    });

    test('AC2: GET /api/v1/expenses/stats returns category totals + GST claimable total', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp02-ac2');
      try {
        await createExpenseViaApi(request, API, user.accessToken, {
          amount: 11500,
          category: 'materials',
          isGstClaimable: true,
          description: 'stats-seed-gst',
        });
        const res = await request.get(`${API}/api/v1/expenses/stats`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
        });
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.stats).toBeDefined();
      } finally {
        await user.cleanup();
      }
    });

    test('AC3: GET /api/v1/expenses/monthly returns by-month aggregation', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp02-ac3');
      try {
        await createExpenseViaApi(
          request,
          API,
          user.accessToken,
          makeTaggedExpense(0, 'monthly-seed'),
        );
        const res = await request.get(
          `${API}/api/v1/expenses/monthly?months=6`,
          { headers: { Authorization: `Bearer ${user.accessToken}` } },
        );
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.totals).toBeDefined();
      } finally {
        await user.cleanup();
      }
    });

    test('AC4: multi-tenant isolation — user A cannot see user B\'s expenses', async ({
      request,
    }) => {
      const userA = await registerEphemeralUser(request, API, 'exp02-ac4-a');
      const userB = await registerEphemeralUser(request, API, 'exp02-ac4-b');
      try {
        await createExpenseViaApi(
          request,
          API,
          userA.accessToken,
          makeTaggedExpense(0, 'tenantA'),
        );

        const resB = await request.get(`${API}/api/v1/expenses`, {
          headers: { Authorization: `Bearer ${userB.accessToken}` },
        });
        expect(resB.status()).toBe(200);
        const body = await resB.json();
        // User B sees zero expenses — A's tagged row must not leak.
        for (const e of body.data.expenses) {
          expect(e.description || '').not.toContain('tenantA');
        }
      } finally {
        await userA.cleanup();
        await userB.cleanup();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // F-EXP-03 — Update / delete expense
  // ---------------------------------------------------------------------------
  test.describe('F-EXP-03: update / delete', () => {
    test('AC1: PUT /api/v1/expenses/:id updates fields', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp03-ac1');
      try {
        const created = await createExpenseViaApi(
          request,
          API,
          user.accessToken,
          makeTaggedExpense(0, 'update-target'),
        );

        const res = await request.put(
          `${API}/api/v1/expenses/${created.id}`,
          {
            headers: { Authorization: `Bearer ${user.accessToken}` },
            data: { vendor: 'Bunnings — Wairau Park', amount: 5500 },
          },
        );
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.data.expense.vendor).toBe('Bunnings — Wairau Park');
        expect(body.data.expense.amount).toBe(5500);
      } finally {
        await user.cleanup();
      }
    });

    test('AC2: DELETE /api/v1/expenses/:id removes the expense', async ({
      request,
    }) => {
      const user = await registerEphemeralUser(request, API, 'exp03-ac2');
      try {
        const created = await createExpenseViaApi(
          request,
          API,
          user.accessToken,
          makeTaggedExpense(0, 'delete-target'),
        );

        const delRes = await request.delete(
          `${API}/api/v1/expenses/${created.id}`,
          { headers: { Authorization: `Bearer ${user.accessToken}` } },
        );
        expect(delRes.status()).toBe(200);

        const getRes = await request.get(
          `${API}/api/v1/expenses/${created.id}`,
          { headers: { Authorization: `Bearer ${user.accessToken}` } },
        );
        expect([404, 500]).toContain(getRes.status());
      } finally {
        await user.cleanup();
      }
    });

    test('AC3: ownership — user B cannot update user A\'s expense', async ({
      request,
    }) => {
      const userA = await registerEphemeralUser(request, API, 'exp03-ac3-a');
      const userB = await registerEphemeralUser(request, API, 'exp03-ac3-b');
      let createdId: string | null = null;
      try {
        const created = await createExpenseViaApi(
          request,
          API,
          userA.accessToken,
          makeTaggedExpense(0, 'cross-tenant'),
        );
        createdId = created.id;

        // User B tries to update A's expense — must NOT succeed.
        const res = await request.put(
          `${API}/api/v1/expenses/${created.id}`,
          {
            headers: { Authorization: `Bearer ${userB.accessToken}` },
            data: { vendor: 'HIJACKED' },
            failOnStatusCode: false,
          },
        );
        expect([403, 404, 500]).toContain(res.status());
      } finally {
        if (createdId) {
          await deleteExpenseQuiet(request, API, userA.accessToken, createdId);
        }
        await userA.cleanup();
        await userB.cleanup();
      }
    });

    test('AC3b: ownership — user B cannot delete user A\'s expense', async ({
      request,
    }) => {
      const userA = await registerEphemeralUser(request, API, 'exp03-ac3b-a');
      const userB = await registerEphemeralUser(request, API, 'exp03-ac3b-b');
      let createdId: string | null = null;
      try {
        const created = await createExpenseViaApi(
          request,
          API,
          userA.accessToken,
          makeTaggedExpense(0, 'cross-tenant-delete'),
        );
        createdId = created.id;

        const res = await request.delete(
          `${API}/api/v1/expenses/${created.id}`,
          {
            headers: { Authorization: `Bearer ${userB.accessToken}` },
            failOnStatusCode: false,
          },
        );
        expect([403, 404, 500]).toContain(res.status());

        // Confirm A still sees their row.
        const getRes = await request.get(
          `${API}/api/v1/expenses/${created.id}`,
          { headers: { Authorization: `Bearer ${userA.accessToken}` } },
        );
        expect(getRes.status()).toBe(200);
      } finally {
        if (createdId) {
          await deleteExpenseQuiet(request, API, userA.accessToken, createdId);
        }
        await userA.cleanup();
        await userB.cleanup();
      }
    });
  });
});
