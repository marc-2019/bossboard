/**
 * Per-module helpers for F-SUB demos (Phase 3 Agent 10 — Subscriptions).
 *
 * The Subscriptions module is overwhelmingly API-driven: tier definitions
 * (F-SUB-01), gating (F-SUB-02), usage tracking (F-SUB-03), and limit
 * enforcement (F-SUB-04) are all enforced in `apps/api/src/middleware/
 * subscription.ts` and observed via `/api/v1/subscriptions/*` endpoints.
 *
 * These helpers wrap the existing E2E test-data-lifecycle helpers in
 * `apps/web/e2e/helpers/test-data.ts` and add subscriptions-specific
 * affordances:
 *
 *   - `API_BASE_URL` — Express API base (Phase A: :29000).
 *   - `EXPECTED_TIERS` — canonical free/tradie/team shape from CLAUDE.md.
 *   - `freeTierLimits()` / `tradieTierLimits()` / `teamTierLimits()` —
 *     reference TierLimits objects matching `apps/api/src/services/
 *     subscriptions.ts:TIER_LIMITS`.
 *   - `registerSubscriptionsDemoUser()` — convenience wrapper that
 *     returns an ephemeral user plus a `subscriptionTier` snapshot.
 *   - `createInvoiceForLimitTest()` — POSTs a minimal invoice (used by
 *     F-SUB-04 to simulate the "3 already used this month" precondition).
 *   - `isBetaModeFromTiersResponse()` — extracts the betaMode flag from
 *     GET /tiers so tests can branch correctly when BETA_MODE=true.
 *
 * Beta-mode caveat (CLAUDE.md):
 *   When `BETA_MODE !== 'false'` (default), every user is granted
 *   tradie-level access for free. Tests for F-SUB-02 / F-SUB-04 negative
 *   paths MUST either (a) flip BETA_MODE off via the test runner, or
 *   (b) assert the bypassed-by-beta branch. Both code paths are exercised
 *   in the api.spec.ts so the suite is correct under either env state.
 *
 * Phase 5 will inject mock fixtures for forced-tier and forced-usage
 * preconditions — search for `TODO(phase5)` markers in the demo specs.
 */

import type { APIRequestContext } from '@playwright/test';
import {
  testDataName,
  registerEphemeralUser,
  type EphemeralUser,
  type TestData,
} from '../../helpers/test-data';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * API base URL for demo tests. Mirrors the convention used by
 * `apps/web/e2e/api-routes.spec.ts` (Express on :29000 per PORTS.md).
 *
 * TODO(phase5): swap to a mocked baseURL when env-gated stubs land.
 */
export const API_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:29000';

/**
 * Canonical tier shape from CLAUDE.md — free / tradie / team.
 * These are the *contract* assertions that GET /tiers must satisfy.
 */
export const EXPECTED_TIER_SLUGS = ['free', 'tradie', 'team'] as const;
export type TierSlug = (typeof EXPECTED_TIER_SLUGS)[number];

/**
 * Canonical pricing from CLAUDE.md + apps/api/src/routes/subscriptions.ts:42.
 * Used to assert GET /tiers response.
 */
export const EXPECTED_PRICING = {
  free: { price: 0, period: 'forever' },
  tradie: { price: 4.99, period: 'week', monthlyEquivalent: 19.99, currency: 'NZD' },
  team: { price: 9.99, period: 'week', monthlyEquivalent: 39.99, currency: 'NZD' },
} as const;

// ---------------------------------------------------------------------------
// Reference TierLimits — mirrored from apps/api/src/services/subscriptions.ts
// ---------------------------------------------------------------------------

export interface TierLimitsLike {
  tier: TierSlug;
  invoicesPerMonth: number | null;
  swmsPerMonth: number | null;
  aiCallsPerMonth: number | null;
  teamMembers: number | null;
  pdfExport: boolean;
  emailInvoice: boolean;
  quotes: boolean;
  expenses: boolean;
  jobLogs: boolean;
  photos: boolean;
}

export function freeTierLimits(): TierLimitsLike {
  return {
    tier: 'free',
    invoicesPerMonth: 3,
    swmsPerMonth: 2,
    aiCallsPerMonth: 5,
    teamMembers: null,
    pdfExport: false,
    emailInvoice: false,
    quotes: false,
    expenses: false,
    jobLogs: false,
    photos: false,
  };
}

export function tradieTierLimits(): TierLimitsLike {
  return {
    tier: 'tradie',
    invoicesPerMonth: null,
    swmsPerMonth: null,
    aiCallsPerMonth: 50,
    teamMembers: null,
    pdfExport: true,
    emailInvoice: true,
    quotes: true,
    expenses: true,
    jobLogs: true,
    photos: true,
  };
}

export function teamTierLimits(): TierLimitsLike {
  return {
    tier: 'team',
    invoicesPerMonth: null,
    swmsPerMonth: null,
    aiCallsPerMonth: 200,
    teamMembers: 5,
    pdfExport: true,
    emailInvoice: true,
    quotes: true,
    expenses: true,
    jobLogs: true,
    photos: true,
  };
}

// ---------------------------------------------------------------------------
// NZ tradie demo personas — keep headed demos visually credible
// ---------------------------------------------------------------------------

const SUB_PERSONAS = [
  {
    name: 'Te Ariki Wallace',
    businessName: 'Wallace Roofing',
    tradeType: 'builder' as const,
  },
  {
    name: 'Hana Kingi',
    businessName: 'Kingi Plumbing & Gas',
    tradeType: 'plumber' as const,
  },
  {
    name: 'Joel Tipene',
    businessName: 'Tipene Sparkies',
    tradeType: 'electrician' as const,
  },
];

export interface SubPersona {
  name: string;
  businessName: string;
  tradeType: 'plumber' | 'builder' | 'electrician' | 'landscaper' | 'painter' | 'other';
}

export function subPersona(purpose: string): SubPersona {
  let hash = 0;
  for (let i = 0; i < purpose.length; i += 1) {
    hash = (hash * 31 + purpose.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % SUB_PERSONAS.length;
  return SUB_PERSONAS[index];
}

// ---------------------------------------------------------------------------
// Ephemeral user helpers
// ---------------------------------------------------------------------------

export function uniqueSubEmail(purpose: string): string {
  return testDataName(purpose).email;
}

export function subTestData(purpose: string): TestData {
  return testDataName(purpose);
}

/**
 * Register a fresh demo user for a subscriptions test. New users default
 * to `subscription_tier = 'free'` in the users table (per migration
 * 009_subscription.sql). Beta-mode still applies at the middleware layer,
 * so /me will report the stored tier ('free') but limits / features
 * will be tradie-equivalent during beta.
 */
export async function registerSubscriptionsDemoUser(
  request: APIRequestContext,
  apiUrl: string,
  purpose: string,
): Promise<EphemeralUser & { persona: SubPersona }> {
  const data = testDataName(purpose);
  const persona = subPersona(purpose);

  const res = await request.post(`${apiUrl}/api/v1/auth/register`, {
    data: {
      email: data.email,
      password: data.password,
      name: persona.name,
      tradeType: persona.tradeType,
      businessName: persona.businessName,
    },
    failOnStatusCode: false,
  });

  if (res.status() !== 200 && res.status() !== 201) {
    throw new Error(
      `registerSubscriptionsDemoUser: register returned ${res.status()} for ${data.email}: ${await res.text()}`,
    );
  }

  const body = await res.json();
  const accessToken = body?.data?.tokens?.accessToken;
  const refreshToken = body?.data?.tokens?.refreshToken;
  if (!accessToken) {
    throw new Error(
      `registerSubscriptionsDemoUser: no accessToken in register response for ${data.email}`,
    );
  }

  return {
    email: data.email,
    name: persona.name,
    password: data.password,
    accessToken,
    refreshToken,
    persona,
    cleanup: async () => {
      try {
        await request.delete(`${apiUrl}/api/v1/auth/account`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          failOnStatusCode: false,
        });
      } catch {
        // Best-effort. The global teardown sweep is the safety net.
      }
    },
  };
}

// ---------------------------------------------------------------------------
// F-SUB-04 (limit enforcement) helpers
// ---------------------------------------------------------------------------

/**
 * POST a minimal invoice as the given user. Used by F-SUB-04 to simulate
 * the "3 already used this month" precondition before asserting that the
 * 4th POST returns 402 LIMIT_REACHED on the free tier.
 *
 * NOTE(beta-mode): when BETA_MODE!=='false' the limit middleware uses
 * tradie limits (unlimited invoices) so the 4th POST will succeed. Tests
 * MUST branch on the betaMode flag returned from GET /tiers.
 *
 * The minimal invoice payload mirrors what `apps/api/src/routes/
 * invoices.ts` requires. Customer name + amount are realistic NZ values
 * so the demo screenshots remain credible.
 */
export async function createInvoiceForLimitTest(
  request: APIRequestContext,
  apiUrl: string,
  token: string,
  index: number,
) {
  return request.post(`${apiUrl}/api/v1/invoices`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      customerName: `Smith Residence #${index}`,
      customerEmail: `customer${index}@example.test`,
      customerAddress: `${100 + index} Kotare St, Hamilton 3210`,
      invoiceNumber: `INV-DEMO-${Date.now()}-${index}`,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      items: [
        {
          description: 'Bathroom tap install — labour',
          quantity: 1,
          unitPrice: 180.0,
        },
      ],
      gstRate: 0.15,
      notes: 'F-SUB-04 limit-test invoice — auto-cleanup via user.cleanup()',
    },
    failOnStatusCode: false,
  });
}

// ---------------------------------------------------------------------------
// Response-shape helpers
// ---------------------------------------------------------------------------

/**
 * Pull the betaMode flag out of the GET /tiers response. Tests use this
 * to branch the F-SUB-02 / F-SUB-04 assertions:
 *   - beta on  : assert gates / limits bypassed (per CLAUDE.md AC3 / AC4).
 *   - beta off : assert real free-tier enforcement.
 */
export function isBetaModeFromTiersResponse(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const data = (body as { data?: { betaMode?: unknown } }).data;
  return data?.betaMode === true;
}

/**
 * Re-export `registerEphemeralUser` so tests that don't need a persona
 * can import from a single place.
 */
export { registerEphemeralUser };
