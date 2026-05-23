/**
 * Per-module helpers for F-AUTH demos (Phase 3 Agent 1).
 *
 * These helpers wrap the existing E2E test-data-lifecycle helpers in
 * `apps/web/e2e/helpers/test-data.ts` and add auth-specific affordances:
 *
 *   - `uniqueAuthEmail(purpose)` — RFC-6761-safe @example.test address
 *     with an `e2e-` prefix that the global teardown sweep can grep.
 *
 *   - `demoCustomerData()` — realistic NZ tradie demo data (names,
 *     business names, trade types) so headed demos look credible to
 *     stakeholders, not "test123@test.com" / "Lorem ipsum".
 *
 *   - `cleanupUserByEmail(request, apiUrl, email, accessToken?)` —
 *     best-effort DELETE /api/v1/auth/account; never throws so demos
 *     don't fail on cleanup. The global teardown is the safety net.
 *
 *   - `registerDemoUser(request, apiUrl, purpose)` — convenience wrapper
 *     around the existing `registerEphemeralUser()` with auth-flavoured
 *     realistic data.
 *
 * Phase 5 will inject mock fixtures (Resend stub, etc) — search for
 * `TODO(phase5)` markers in the demo specs.
 */

import type { APIRequestContext } from '@playwright/test';
import {
  testDataName,
  registerEphemeralUser,
  type EphemeralUser,
  type TestData,
} from '../../helpers/test-data';

/**
 * NZ tradie demo persona pool — used to keep headed demos credible.
 * Picked deterministically by purpose-hash so the same test always sees
 * the same persona (helps with screenshot review).
 */
const DEMO_PERSONAS = [
  {
    name: 'Mike Tane',
    businessName: "Mike's Plumbing Ltd",
    tradeType: 'plumber' as const,
    phone: '+64 21 555 0101',
  },
  {
    name: 'Sarah Whetu',
    businessName: 'Sarah Builds Ltd',
    tradeType: 'builder' as const,
    phone: '+64 21 555 0202',
  },
  {
    name: 'James Patel',
    businessName: 'Patel Electrical',
    tradeType: 'electrician' as const,
    phone: '+64 21 555 0303',
  },
  {
    name: 'Lena Cooper',
    businessName: 'Cooper Landscapes',
    tradeType: 'landscaper' as const,
    phone: '+64 21 555 0404',
  },
];

export interface DemoPersona {
  name: string;
  businessName: string;
  tradeType: 'plumber' | 'builder' | 'electrician' | 'landscaper' | 'painter' | 'other';
  phone: string;
}

/**
 * Pick a deterministic persona for a given test purpose. The hash is
 * purposely trivial so changes to persona content yield identical
 * picks across runs (stable screenshots).
 */
export function demoPersona(purpose: string): DemoPersona {
  let hash = 0;
  for (let i = 0; i < purpose.length; i += 1) {
    hash = (hash * 31 + purpose.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % DEMO_PERSONAS.length;
  return DEMO_PERSONAS[index];
}

/**
 * Generate an RFC-6761 @example.test email tagged for the global e2e
 * teardown sweep. Wraps `testDataName()` and exposes just the email.
 */
export function uniqueAuthEmail(purpose: string): string {
  return testDataName(purpose).email;
}

/**
 * Full TestData payload tagged for auth demos. Use this when you want
 * email + password + tag together (e.g. for register payloads).
 */
export function demoTestData(purpose: string): TestData {
  return testDataName(purpose);
}

/**
 * Best-effort DELETE of an e2e-tagged account. Never throws — designed
 * to be called from a test.afterEach in a try/finally.
 */
export async function cleanupUserByEmail(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string | undefined,
): Promise<void> {
  if (!accessToken) return;
  try {
    await request.delete(`${apiUrl}/api/v1/auth/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      failOnStatusCode: false,
    });
  } catch {
    // Best-effort. The global teardown sweep is the safety net.
  }
}

/**
 * Register a fresh user with auth-demo flavour — realistic name + trade
 * type so the headed demo screenshots look credible. Returns the
 * ephemeral-user handle (tokens + cleanup callback) plus the persona.
 */
export async function registerDemoUser(
  request: APIRequestContext,
  apiUrl: string,
  purpose: string,
): Promise<EphemeralUser & { persona: DemoPersona }> {
  const data = testDataName(purpose);
  const persona = demoPersona(purpose);

  const res = await request.post(`${apiUrl}/api/v1/auth/register`, {
    data: {
      email: data.email,
      password: data.password,
      name: persona.name,
      tradeType: persona.tradeType,
      businessName: persona.businessName,
      phone: persona.phone,
    },
    failOnStatusCode: false,
  });

  if (res.status() !== 200 && res.status() !== 201) {
    throw new Error(
      `registerDemoUser: register returned ${res.status()} for ${data.email}: ${await res.text()}`,
    );
  }

  const body = await res.json();
  const accessToken = body?.data?.tokens?.accessToken;
  const refreshToken = body?.data?.tokens?.refreshToken;
  if (!accessToken) {
    throw new Error(
      `registerDemoUser: no accessToken in register response for ${data.email}`,
    );
  }

  return {
    email: data.email,
    name: persona.name,
    password: data.password,
    accessToken,
    refreshToken,
    persona,
    cleanup: async () => cleanupUserByEmail(request, apiUrl, accessToken),
  };
}

/**
 * Re-export `registerEphemeralUser` so a demo that wants the plain
 * (non-personated) helper can import from one place.
 */
export { registerEphemeralUser };

/**
 * API base URL for demo tests. Mirrors the convention used by
 * `apps/web/e2e/api-routes.spec.ts` (Express on :29000).
 *
 * TODO(phase5): swap to a mocked baseURL when env-gated stubs land.
 */
export const API_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:29000';
