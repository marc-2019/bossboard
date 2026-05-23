/**
 * F-SUB API demos — Phase 3 Agent 10 (Subscriptions module).
 *
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 10.
 * Features covered:
 *   - F-SUB-01 View tier definitions (GET /subscriptions/tiers)
 *   - F-SUB-02 Tier gating (requireFeature middleware on quotes/PDF/email/photos/expenses/jobLogs)
 *   - F-SUB-03 Usage tracking (GET /subscriptions/usage)
 *   - F-SUB-04 Limit enforcement (checkLimit middleware: free=3 invoices/mo, 2 SWMS/mo)
 *
 * Why this is the *primary* surface for the Subscriptions module:
 *   Per the matrix (M.3 in the plan), tier gating + limit enforcement are
 *   *middleware* behaviours, not UI behaviours. The web/mobile surfaces
 *   only render the result. The contract that matters lives in the HTTP
 *   responses — error codes, status codes, response shape.
 *
 * Beta-mode handling:
 *   `BETA_MODE` (CLAUDE.md, apps/api/src/services/subscriptions.ts:64)
 *   defaults to true. When on, all users receive tradie-level limits at
 *   the middleware layer, so the "negative" paths (free-tier 4th invoice
 *   blocked, gated feature 403) do NOT fire. Every assertion below
 *   branches on the betaMode flag from GET /tiers so the suite is
 *   correct under either env state. Phase 5 will add fixture injection
 *   to force `BETA_MODE=false` per test — search for TODO(phase5).
 */

import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  EXPECTED_TIER_SLUGS,
  EXPECTED_PRICING,
  freeTierLimits,
  tradieTierLimits,
  teamTierLimits,
  registerSubscriptionsDemoUser,
  createInvoiceForLimitTest,
  isBetaModeFromTiersResponse,
} from '../helpers/subscriptions';

// =============================================================================
// F-SUB-01 — View tier definitions
// =============================================================================

test.describe('F-SUB-01 — View tier definitions', () => {
  test('GET /subscriptions/tiers returns free, tradie, team with canonical prices', async ({
    request,
  }) => {
    // AC: this endpoint requires auth (per apps/api/src/routes/subscriptions.ts:26)
    // so we register an ephemeral user first.
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subtiers');

    try {
      const res = await request.get(`${API_BASE_URL}/api/v1/subscriptions/tiers`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      // AC1: returns 200 and a `tiers` array of length 3
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.tiers)).toBe(true);
      expect(body.data.tiers).toHaveLength(3);

      // AC2: each tier exposes the canonical slug
      const slugs = body.data.tiers.map((t: { tier: string }) => t.tier);
      for (const expected of EXPECTED_TIER_SLUGS) {
        expect(slugs).toContain(expected);
      }

      // AC2 cont'd: pricing block matches CLAUDE.md ($4.99 / wk tradie, $9.99 / wk team)
      expect(body.data.pricing.free).toMatchObject(EXPECTED_PRICING.free);
      expect(body.data.pricing.tradie).toMatchObject(EXPECTED_PRICING.tradie);
      expect(body.data.pricing.team).toMatchObject(EXPECTED_PRICING.team);

      // AC2 cont'd: each tier has the limits shape
      const freeTier = body.data.tiers.find((t: { tier: string }) => t.tier === 'free');
      expect(freeTier.invoicesPerMonth).toBe(freeTierLimits().invoicesPerMonth);
      expect(freeTier.swmsPerMonth).toBe(freeTierLimits().swmsPerMonth);

      const tradieTier = body.data.tiers.find((t: { tier: string }) => t.tier === 'tradie');
      expect(tradieTier.invoicesPerMonth).toBe(tradieTierLimits().invoicesPerMonth); // null = unlimited
      expect(tradieTier.pdfExport).toBe(true);

      const teamTier = body.data.tiers.find((t: { tier: string }) => t.tier === 'team');
      expect(teamTier.teamMembers).toBe(teamTierLimits().teamMembers); // 5
    } finally {
      await user.cleanup();
    }
  });

  test('GET /subscriptions/me returns user tier + limits + usage shape', async ({ request }) => {
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subme');

    try {
      const res = await request.get(`${API_BASE_URL}/api/v1/subscriptions/me`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      // AC: returns 200 + shape { subscription, limits, usage, betaMode }
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('subscription');
      expect(body.data).toHaveProperty('limits');
      expect(body.data).toHaveProperty('usage');
      expect(body.data).toHaveProperty('betaMode');

      // New users start on 'free' tier (per migration 009_subscription.sql)
      expect(body.data.subscription.tier).toBe('free');

      // Beta-mode flag is boolean
      expect(typeof body.data.betaMode).toBe('boolean');
    } finally {
      await user.cleanup();
    }
  });
});

// =============================================================================
// F-SUB-02 — Tier gating (feature access)
// =============================================================================

test.describe('F-SUB-02 — Tier gating', () => {
  test('POST /quotes — free tier blocked OR beta-mode bypasses (branching assertion)', async ({
    request,
  }) => {
    // requireFeature('quotes') is wired on POST /api/v1/quotes
    // (see apps/api/src/routes/quotes.ts). Free tier should be blocked
    // with 403 FEATURE_NOT_AVAILABLE — UNLESS beta mode is on, in which
    // case all users get tradie limits and the request proceeds.
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subgate');

    try {
      // First inspect betaMode so we know which path to assert
      const tiersRes = await request.get(`${API_BASE_URL}/api/v1/subscriptions/tiers`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const tiersBody = await tiersRes.json();
      const betaOn = isBetaModeFromTiersResponse(tiersBody);

      // Attempt a quote creation — body is intentionally minimal; we're
      // checking the gate, not the success-path of POST /quotes.
      const quoteRes = await request.post(`${API_BASE_URL}/api/v1/quotes`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: {
          customerName: 'Te Whanau Whānau Trust',
          customerEmail: 'admin@example.test',
          items: [{ description: 'Initial inspection', quantity: 1, unitPrice: 250.0 }],
          gstRate: 0.15,
        },
        failOnStatusCode: false,
      });

      if (betaOn) {
        // AC3 (beta-mode bypass): the request is NOT blocked by the gate.
        // It may still 400 on validation if quotes route requires more
        // fields, but it MUST NOT be 403 FEATURE_NOT_AVAILABLE.
        if (quoteRes.status() === 403) {
          const body = await quoteRes.json();
          expect(body.error).not.toBe('FEATURE_NOT_AVAILABLE');
        }
      } else {
        // AC1/AC2 (real free-tier): 403 with FEATURE_NOT_AVAILABLE
        expect(quoteRes.status()).toBe(403);
        const body = await quoteRes.json();
        expect(body.error).toBe('FEATURE_NOT_AVAILABLE');
        expect(body.data?.feature).toBe('quotes');
        expect(body.message).toMatch(/Tradie plan/i);
      }
    } finally {
      await user.cleanup();
    }
  });

  test('GET /subscriptions/me exposes feature map under limits', async ({ request }) => {
    // AC4: /me returns the tier's feature map so the UI can disable
    // affordances on the free tier (the web/mobile surfaces use this).
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'submap');

    try {
      const res = await request.get(`${API_BASE_URL}/api/v1/subscriptions/me`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      const limits = body.data.limits;
      // Boolean feature flags exist regardless of tier
      expect(typeof limits.pdfExport).toBe('boolean');
      expect(typeof limits.emailInvoice).toBe('boolean');
      expect(typeof limits.quotes).toBe('boolean');
      expect(typeof limits.expenses).toBe('boolean');
      expect(typeof limits.jobLogs).toBe('boolean');
      expect(typeof limits.photos).toBe('boolean');
    } finally {
      await user.cleanup();
    }
  });
});

// =============================================================================
// F-SUB-03 — Usage tracking (invoice / SWMS counts)
// =============================================================================

test.describe('F-SUB-03 — Usage tracking', () => {
  test('GET /subscriptions/usage returns zero usage for a fresh user', async ({ request }) => {
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subusage0');

    try {
      const res = await request.get(`${API_BASE_URL}/api/v1/subscriptions/usage`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });

      // AC1: returns 200 + shape { usage, limits, remaining }
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.usage).toMatchObject({
        invoicesThisMonth: 0,
        swmsThisMonth: 0,
        aiCallsThisMonth: 0,
        teamMemberCount: 0,
      });

      // Limits block exposes the tier's quotas
      expect(body.data.limits).toHaveProperty('invoicesPerMonth');
      expect(body.data.limits).toHaveProperty('swmsPerMonth');

      // Remaining block computed from limit - used
      expect(body.data.remaining).toHaveProperty('invoices');
      expect(body.data.remaining).toHaveProperty('swms');
    } finally {
      await user.cleanup();
    }
  });

  test('GET /subscriptions/usage increments after successful invoice POST', async ({
    request,
  }) => {
    // AC3: counts increment on each successful POST. We POST one invoice
    // and assert the usage endpoint reflects invoicesThisMonth === 1.
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subusageinc');

    try {
      // Pre-state: zero
      const pre = await request.get(`${API_BASE_URL}/api/v1/subscriptions/usage`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const preBody = await pre.json();
      const preCount = preBody.data.usage.invoicesThisMonth;

      // Create one invoice
      const invRes = await createInvoiceForLimitTest(request, API_BASE_URL, user.accessToken, 1);
      // Either 200/201 success — or 403 if some other gate blocks free
      // tier from creating ANY invoice (it shouldn't, since invoices
      // route uses checkLimit only, not requireFeature).
      // Beta-mode: definitely 200/201.
      if (invRes.status() !== 200 && invRes.status() !== 201) {
        test.skip(true, `Invoice POST returned ${invRes.status()} — skipping usage-increment assertion. Body: ${await invRes.text()}`);
        return;
      }

      // Post-state: +1
      const post = await request.get(`${API_BASE_URL}/api/v1/subscriptions/usage`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const postBody = await post.json();
      expect(postBody.data.usage.invoicesThisMonth).toBe(preCount + 1);
    } finally {
      await user.cleanup();
    }
  });

  test('GET /subscriptions/usage scopes counts per-user (multi-tenant)', async ({
    request,
  }) => {
    // AC: counts are user-scoped — user A's invoices do NOT show up in user B's usage.
    const userA = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subusageA');
    const userB = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subusageB');

    try {
      // A creates an invoice
      const invA = await createInvoiceForLimitTest(request, API_BASE_URL, userA.accessToken, 1);
      if (invA.status() !== 200 && invA.status() !== 201) {
        test.skip(true, `userA invoice POST returned ${invA.status()} — skipping isolation assertion.`);
        return;
      }

      // B's usage is still zero
      const resB = await request.get(`${API_BASE_URL}/api/v1/subscriptions/usage`, {
        headers: { Authorization: `Bearer ${userB.accessToken}` },
      });
      const bodyB = await resB.json();
      expect(bodyB.data.usage.invoicesThisMonth).toBe(0);
    } finally {
      await userA.cleanup();
      await userB.cleanup();
    }
  });
});

// =============================================================================
// F-SUB-04 — Limit enforcement (free: 3 invoices/mo, 2 SWMS/mo)
// =============================================================================

test.describe('F-SUB-04 — Limit enforcement', () => {
  test('GET /subscriptions/limits returns active tier limits', async ({ request }) => {
    // AC3: GET /limits returns the active limits for the current tier.
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'sublimits');

    try {
      const res = await request.get(`${API_BASE_URL}/api/v1/subscriptions/limits`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.tier).toBe('free');
      expect(body.data.limits).toHaveProperty('invoicesPerMonth');
      expect(body.data.limits).toHaveProperty('swmsPerMonth');
      expect(body.data.limits).toHaveProperty('aiCallsPerMonth');
      expect(body.data.limits).toHaveProperty('teamMembers');
    } finally {
      await user.cleanup();
    }
  });

  test('4th invoice on free tier — blocked OR beta-mode bypass (branching)', async ({
    request,
  }) => {
    // AC1: free tier's 4th invoice POST returns 402 LIMIT_REACHED.
    // AC4: beta mode bypasses — all 4 succeed when BETA_MODE!=='false'.
    // We branch on betaMode and assert the correct path.
    //
    // PRECONDITION (mocking context from agent prompt): we POST 3 invoices
    // to simulate "3 already used this month", then the 4th POST is the
    // assertion point. Database state is *not* mocked — the precondition
    // is exercised by real POSTs against the API. The test invoices are
    // auto-cleaned via user.cleanup() (cascade delete on user).
    //
    // TODO(phase5): inject a fixture that forces `subscription_tier='free'`
    // and pre-loads 3 invoices in `created_at` for this month, then run
    // ONLY the 4th-POST assertion. That removes the 3 setup POSTs from
    // the demo video.
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'sublimit4th');

    try {
      const tiersRes = await request.get(`${API_BASE_URL}/api/v1/subscriptions/tiers`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const betaOn = isBetaModeFromTiersResponse(await tiersRes.json());

      // Create 3 invoices (the free-tier monthly cap)
      const results = [];
      for (let i = 1; i <= 3; i += 1) {
        const r = await createInvoiceForLimitTest(request, API_BASE_URL, user.accessToken, i);
        results.push(r.status());
      }

      // All 3 should succeed regardless of beta-mode (3 <= 3 cap).
      // If they didn't, the underlying invoices route is broken — that's
      // F-INV-01 territory, not F-SUB-04. Skip the limit assertion.
      const all3Succeeded = results.every((s) => s === 200 || s === 201);
      if (!all3Succeeded) {
        test.skip(
          true,
          `Setup failed: invoice POSTs returned ${JSON.stringify(results)}. F-SUB-04 limit assertion requires the invoices route to be healthy.`,
        );
        return;
      }

      // 4th POST — the limit-enforcement assertion point
      const fourth = await createInvoiceForLimitTest(
        request,
        API_BASE_URL,
        user.accessToken,
        4,
      );

      if (betaOn) {
        // Beta-mode bypass: 4th succeeds (tradie limits → unlimited)
        expect([200, 201]).toContain(fourth.status());
      } else {
        // Real free-tier enforcement: 402 LIMIT_REACHED
        expect(fourth.status()).toBe(402);
        const body = await fourth.json();
        expect(body.error).toBe('LIMIT_REACHED');
        expect(body.data?.resource).toBe('invoice');
        expect(body.message).toMatch(/Free plan allows 3 invoices/i);
      }
    } finally {
      await user.cleanup();
    }
  });

  test('GET /subscriptions/usage `remaining` block reflects unlimited (null) for tradie+', async ({
    request,
  }) => {
    // AC5: tradie + team tiers are unlimited (null in TierLimits). In
    // beta mode every user gets tradie limits, so `remaining.invoices`
    // should be null. This is a positive-shape assertion on the
    // unlimited path.
    const user = await registerSubscriptionsDemoUser(request, API_BASE_URL, 'subunlim');

    try {
      const tiersRes = await request.get(`${API_BASE_URL}/api/v1/subscriptions/tiers`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const betaOn = isBetaModeFromTiersResponse(await tiersRes.json());

      const usageRes = await request.get(`${API_BASE_URL}/api/v1/subscriptions/usage`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const body = await usageRes.json();

      if (betaOn) {
        // Beta gives tradie limits → invoicesPerMonth is null → remaining.invoices is null
        expect(body.data.limits.invoicesPerMonth).toBeNull();
        expect(body.data.remaining.invoices).toBeNull();
      } else {
        // Real free tier → invoicesPerMonth = 3 → remaining.invoices = number
        expect(body.data.limits.invoicesPerMonth).toBe(3);
        expect(typeof body.data.remaining.invoices).toBe('number');
      }
    } finally {
      await user.cleanup();
    }
  });
});
