/**
 * E2E test-data lifecycle helper for BossBoard web.
 *
 * Implements cf_standing_directives.e2e-test-data-lifecycle (severity:
 * critical, applies_to: trademate-nz [legacy CF project_id slug — canonical
 * for BossBoard, do not rename without DB-coupled migration]). Every entity
 * created during an E2E test must be cleaned up.
 *
 * Pattern:
 *   const data = testDataName('nav-smoke');
 *   // -> { email: 'e2e-20260427-navsmoke-1761597030531-7a3b@example.test',
 *   //      name:  'E2E Nav-smoke 2026-04-27',
 *   //      tag:   'e2e-20260427-navsmoke-1761597030531-7a3b' }
 *
 *   // Use registerEphemeralUser() for the common "register, return
 *   // tokens, auto-delete after test" lifecycle:
 *   const user = await registerEphemeralUser(request, API_URL, 'nav-smoke');
 *   // ... test body ...
 *   await user.cleanup(); // deletes the account
 *
 * Why this matters:
 *   - @example.test is RFC 6761 reserved — guaranteed never deliverable
 *     (so we can't accidentally email a real human).
 *   - The "e2e-" prefix is greppable for a global teardown sweep.
 *   - YYYYMMDD groups same-day runs.
 *   - The Date.now() + random suffix guarantees uniqueness within a
 *     single test process.
 */

import type { APIRequestContext } from '@playwright/test';

const E2E_DOMAIN = 'example.test';
const E2E_PREFIX = 'e2e';

let counter = 0;

export interface TestData {
  email: string;
  name: string;
  password: string;
  tag: string;
}

export function testDataName(purpose: string): TestData {
  const safePurpose = purpose.toLowerCase().replace(/[^a-z0-9]/g, '');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const ts = Date.now();
  const rand = Math.random().toString(16).slice(2, 6);
  counter++;
  const tag = `${E2E_PREFIX}-${date}-${safePurpose}-${ts}-${counter}${rand}`;
  return {
    email: `${tag}@${E2E_DOMAIN}`,
    name: `E2E ${safePurpose} ${date}`,
    // Fixed password — these accounts have nothing in them and are
    // deleted at end of test. Format meets common 8-char-min validators.
    password: 'E2eTestPass123!',
    tag,
  };
}

export interface EphemeralUser {
  email: string;
  name: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  cleanup: () => Promise<void>;
}

/**
 * Register a fresh user against the target API. Returns tokens AND a
 * cleanup() callback that DELETEs the account when the test is done.
 *
 * Per the e2e-test-data-lifecycle directive, ALWAYS call cleanup() in
 * an afterEach or test.afterAll — preferably in a try/finally so it
 * runs even when assertions fail.
 */
export async function registerEphemeralUser(
  request: APIRequestContext,
  apiUrl: string,
  purpose: string,
): Promise<EphemeralUser> {
  const data = testDataName(purpose);
  const res = await request.post(`${apiUrl}/api/v1/auth/register`, {
    data: { email: data.email, password: data.password, name: data.name },
    failOnStatusCode: false,
  });
  if (res.status() !== 200 && res.status() !== 201) {
    throw new Error(
      `registerEphemeralUser: register returned ${res.status()} for ${data.email}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const accessToken = body?.data?.tokens?.accessToken;
  const refreshToken = body?.data?.tokens?.refreshToken;
  if (!accessToken) {
    throw new Error(
      `registerEphemeralUser: no accessToken in register response for ${data.email}`,
    );
  }
  return {
    email: data.email,
    name: data.name,
    password: data.password,
    accessToken,
    refreshToken,
    cleanup: async () => {
      try {
        await request.delete(`${apiUrl}/api/v1/auth/account`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          failOnStatusCode: false,
        });
      } catch {
        // Best-effort cleanup — do not fail tests on cleanup errors.
        // The global teardown sweep is the safety net.
      }
    },
  };
}

/**
 * Test if a string looks like an e2e-tagged identifier. Used by the
 * global teardown sweep to decide what to delete.
 */
export function isE2eTagged(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(`${E2E_PREFIX}-`) && value.endsWith(`@${E2E_DOMAIN}`);
}
