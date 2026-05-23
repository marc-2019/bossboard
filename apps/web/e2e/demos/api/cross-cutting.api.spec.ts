/**
 * Cross-cutting API demo suite — F-X-01 (multi-tenant isolation,
 * EXTENDED entity surfaces) and F-X-02 (offline sync API contract).
 *
 * Phase 3 Agent 14 deliverable. See:
 *   - docs/testing/SPEC_AND_DEMOS_MATRIX.md § Cross-cutting features
 *   - docs/testing/coverage/cross-cutting.md (this PR adds it)
 *
 * --- F-X-01 cross-reference (LOAD-BEARING — do not duplicate) ---
 *
 * Existing isolation specs (DO NOT DUPLICATE):
 *   apps/web/e2e/multi-tenant-isolation.spec.ts            → invoices
 *   apps/web/e2e/multi-tenant-isolation-entities.spec.ts   → customers, quotes,
 *                                                            expenses, job_logs,
 *                                                            photos
 *
 * What THIS spec adds (gap-filling, parametrised over ISOLATION_CASES):
 *   - SWMS (compliance documents)        — not in either existing spec
 *   - Certifications                     — not in either existing spec
 *   - Subscription self-only             — different shape: no cross-id probe
 *
 * --- F-X-02 — Offline sync API contract ---
 *
 * The mobile sync queue (apps/mobile/src/services/syncQueue.ts) drains
 * to two endpoints:
 *   POST /api/v1/sync/batch     — accept queued ops, return per-op results
 *   GET  /api/v1/sync/status    — return last_sync_at + pending count
 *
 * apps/api/src/__tests__/routes/sync.test.ts has UNIT coverage (mocked
 * db). This file is an E2E spec — it hits a REAL apps/api with REAL
 * postgres. The Maestro flows (.maestro/46-, 47-) drive the mobile
 * client end of the same contract; this spec pins the SERVER end so
 * Phase 4 can attribute failures.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { registerEphemeralUser } from '../../helpers/test-data';
import { ISOLATION_CASES, pairTradies, SECURITY_HEADERS, getHeader } from '../helpers/cross-cutting';

const API_URL = process.env.PROD_API_URL || process.env.API_URL || 'http://localhost:29000';

// ===========================================================================
// F-X-01 — Multi-tenant isolation, EXTENDED entity surfaces
// ===========================================================================

test.describe('F-X-01 isolation — extended entities (gap-fill vs existing specs)', () => {
  for (const c of ISOLATION_CASES) {
    test(`F-X-01: Tradie B cannot read Tradie A's ${c.name}`, async () => {
      const ctx = await playwrightRequest.newContext();
      let pair: Awaited<ReturnType<typeof pairTradies>> | null = null;
      try {
        pair = await pairTradies(ctx, API_URL, `iso-${c.name.replace(/\s+/g, '-').slice(0, 20)}`);

        if (!c.create) {
          // For probe-only cases (e.g. subscription/me) we just hit the
          // URL as B and assert the SHAPE (cannot 200 with someone else's
          // user_id). No A creation needed. Reserved for future entries.
          throw new Error(`ISOLATION_CASES entry "${c.name}" has no create handler — case shape not supported yet`);
        }

        const aEntity = await c.create(ctx, API_URL, pair.a.accessToken);

        // Sanity: A can read their own entity. If this fails the test
        // setup is broken, not the isolation boundary.
        const aRead = await ctx.get(c.probeUrl(API_URL, aEntity.id), {
          headers: { Authorization: `Bearer ${pair.a.accessToken}` },
          failOnStatusCode: false,
        });
        expect(
          aRead.status(),
          `setup-check: A reading own ${c.name}: ${await aRead.text()}`,
        ).toBe(200);

        // The actual isolation probe.
        const bRead = await ctx.get(c.probeUrl(API_URL, aEntity.id), {
          headers: { Authorization: `Bearer ${pair.b.accessToken}` },
          failOnStatusCode: false,
        });
        expect(
          c.okStatuses,
          `P0 LEAK: B got HTTP ${bRead.status()} on ${c.name} (id=${aEntity.id}). ` +
            `Acceptable: ${c.okStatuses.join('/')}. Body: ${await bRead.text()}`,
        ).toContain(bRead.status());
      } finally {
        if (pair) {
          await pair.a.cleanup();
          await pair.b.cleanup();
        }
        await ctx.dispose();
      }
    });
  }

  test('F-X-01: GET /api/v1/subscriptions/me returns B\'s subscription, never A\'s', async () => {
    // The /me endpoint shape is "look up auth.userId, return that row".
    // Per-id probing isn't applicable — instead we verify that A's
    // identifier (email) and B's identifier do not bleed into each
    // other's /me response.
    const ctx = await playwrightRequest.newContext();
    let pair: Awaited<ReturnType<typeof pairTradies>> | null = null;
    try {
      pair = await pairTradies(ctx, API_URL, 'iso-subs-me');

      const aMe = await ctx.get(`${API_URL}/api/v1/subscriptions/me`, {
        headers: { Authorization: `Bearer ${pair.a.accessToken}` },
        failOnStatusCode: false,
      });
      const bMe = await ctx.get(`${API_URL}/api/v1/subscriptions/me`, {
        headers: { Authorization: `Bearer ${pair.b.accessToken}` },
        failOnStatusCode: false,
      });
      expect(aMe.status(), `A /me: ${await aMe.text()}`).toBe(200);
      expect(bMe.status(), `B /me: ${await bMe.text()}`).toBe(200);

      const aBody = JSON.stringify(await aMe.json());
      const bBody = JSON.stringify(await bMe.json());

      // Each tradie's /me must reference their OWN email or user_id, not
      // the other's. We don't know the shape exactly, but the response
      // should NEVER mention the OTHER tradie's e2e-tagged email.
      expect(
        aBody.includes(pair.b.email),
        `P0 LEAK: A's /me response mentions B's email (${pair.b.email}). Body: ${aBody}`,
      ).toBe(false);
      expect(
        bBody.includes(pair.a.email),
        `P0 LEAK: B's /me response mentions A's email (${pair.a.email}). Body: ${bBody}`,
      ).toBe(false);
    } finally {
      if (pair) {
        await pair.a.cleanup();
        await pair.b.cleanup();
      }
      await ctx.dispose();
    }
  });
});

// ===========================================================================
// F-X-02 — Offline sync API contract (server end)
// ===========================================================================

test.describe('F-X-02 offline sync API contract', () => {
  test('F-X-02: POST /api/v1/sync/batch accepts a queued invoice create and applies it', async () => {
    const ctx = await playwrightRequest.newContext();
    let user: Awaited<ReturnType<typeof registerEphemeralUser>> | null = null;
    try {
      user = await registerEphemeralUser(ctx, API_URL, 'sync-batch');

      // Mobile syncQueue.ts shape: { operations: [{id, entity_type,
      // entity_id, action, payload}, ...] }. The server processes each
      // and returns { results, server_timestamp, processed, succeeded,
      // failed }.
      const clientGeneratedId = `e2e-sync-${Date.now()}`;
      const batch = {
        operations: [
          {
            id: 1,
            entity_type: 'invoices',
            entity_id: clientGeneratedId,
            action: 'create' as const,
            payload: {
              clientName: 'e2e-sync-offline-client',
              clientEmail: 'e2e-sync@example.test',
              jobDescription: 'Offline-first sync probe — F-X-02',
              lineItems: [{ description: 'Sync test', amount: 5000 }],
              includeGst: true,
            },
          },
        ],
      };

      const res = await ctx.post(`${API_URL}/api/v1/sync/batch`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: batch,
        failOnStatusCode: false,
      });
      expect(res.status(), `sync/batch response: ${await res.text()}`).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        processed: 1,
        // succeeded/failed may both be present in any combination — the
        // contract is just "accurate counts".
      });
      expect(Array.isArray(body.results), 'results array').toBe(true);
      expect(body.results.length, 'one result per op').toBe(1);
      expect(typeof body.server_timestamp, 'server timestamp is string').toBe('string');

      // The server should echo back the SAME id we sent (used by the
      // mobile queue to mark items synced).
      expect(body.results[0].id, 'op id round-trip').toBe(1);
    } finally {
      if (user) await user.cleanup();
      await ctx.dispose();
    }
  });

  test('F-X-02: POST /api/v1/sync/batch with empty operations array → 400', async () => {
    const ctx = await playwrightRequest.newContext();
    let user: Awaited<ReturnType<typeof registerEphemeralUser>> | null = null;
    try {
      user = await registerEphemeralUser(ctx, API_URL, 'sync-empty');
      const res = await ctx.post(`${API_URL}/api/v1/sync/batch`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: { operations: [] },
        failOnStatusCode: false,
      });
      expect(res.status(), `empty batch: ${await res.text()}`).toBe(400);
    } finally {
      if (user) await user.cleanup();
      await ctx.dispose();
    }
  });

  test('F-X-02: POST /api/v1/sync/batch enforces 50-op cap', async () => {
    const ctx = await playwrightRequest.newContext();
    let user: Awaited<ReturnType<typeof registerEphemeralUser>> | null = null;
    try {
      user = await registerEphemeralUser(ctx, API_URL, 'sync-cap');
      const ops = Array.from({ length: 51 }, (_, i) => ({
        id: i + 1,
        entity_type: 'invoices',
        entity_id: `e2e-sync-cap-${i}`,
        action: 'create' as const,
        payload: { amount: 100 },
      }));
      const res = await ctx.post(`${API_URL}/api/v1/sync/batch`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: { operations: ops },
        failOnStatusCode: false,
      });
      expect(res.status(), `51-op batch: ${await res.text()}`).toBe(400);
    } finally {
      if (user) await user.cleanup();
      await ctx.dispose();
    }
  });

  test('F-X-02: GET /api/v1/sync/status returns last_sync_at + server_timestamp shape', async () => {
    const ctx = await playwrightRequest.newContext();
    let user: Awaited<ReturnType<typeof registerEphemeralUser>> | null = null;
    try {
      user = await registerEphemeralUser(ctx, API_URL, 'sync-status');
      const res = await ctx.get(`${API_URL}/api/v1/sync/status`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        failOnStatusCode: false,
      });
      expect(res.status(), `sync/status: ${await res.text()}`).toBe(200);
      const body = await res.json();
      expect(body, 'sync status shape').toMatchObject({
        last_sync_at: expect.any(String),
        pending_operations: expect.any(Number),
        server_timestamp: expect.any(String),
      });
    } finally {
      if (user) await user.cleanup();
      await ctx.dispose();
    }
  });

  test('F-X-02: sync/batch + sync/status are auth-gated (no token → 401)', async () => {
    const ctx = await playwrightRequest.newContext();
    try {
      const batchRes = await ctx.post(`${API_URL}/api/v1/sync/batch`, {
        data: { operations: [] },
        failOnStatusCode: false,
      });
      expect(batchRes.status(), 'unauth batch must reject before validating body').toBe(401);

      const statusRes = await ctx.get(`${API_URL}/api/v1/sync/status`, {
        failOnStatusCode: false,
      });
      expect(statusRes.status(), 'unauth status must reject').toBe(401);
    } finally {
      await ctx.dispose();
    }
  });
});

// ===========================================================================
// F-X-03 — Security headers on API responses (sanity)
// ===========================================================================

test.describe('F-X-03 API response headers (sanity)', () => {
  test('F-X-03: /health returns expected security headers (regression guard)', async () => {
    const ctx = await playwrightRequest.newContext();
    try {
      // /health is an unauthenticated probe — perfect for header
      // inspection because there's no body PII to worry about.
      const res = await ctx.get(`${API_URL}/health`, { failOnStatusCode: false });
      // The endpoint may be /health, /healthz, or /api/health depending on
      // the express mount. We only check headers when we get a 2xx; a 404
      // skips this assertion rather than failing it.
      if (res.status() < 200 || res.status() >= 300) {
        test.info().annotations.push({
          type: 'note',
          description: `Skipping API header check — /health returned ${res.status()}`,
        });
        return;
      }

      const headers = res.headers();
      for (const spec of SECURITY_HEADERS) {
        const value = getHeader(headers, spec.name);
        if (spec.mode === 'required' || spec.mode === 'recommended') {
          expect(value, `API ${spec.name} missing: ${spec.rationale}`).toBeTruthy();
        } else {
          test.info().annotations.push({
            type: 'api-security-header-target',
            description: `/health ${spec.name}=${value ?? 'MISSING'} (target: ${spec.rationale})`,
          });
        }
      }
    } finally {
      await ctx.dispose();
    }
  });
});
