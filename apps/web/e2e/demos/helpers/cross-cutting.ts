/**
 * Per-module helpers for the Cross-cutting demo suite
 * (F-X-01 multi-tenant isolation, F-X-03 security headers).
 *
 * Cross-cutting concerns are infrastructure-level — no realistic NZ-tradie
 * fixtures here (the entity fixtures live in the per-module helpers, e.g.
 * helpers/quotes.ts). What we DO need:
 *
 *   1. A list of "expected security headers" the web app should emit on
 *      every response, with the policy each one should match. Single
 *      source of truth so both the demo spec and the API spec can read
 *      the same list and diverge a single edit if Next.js config changes.
 *
 *   2. A list of "authenticated dashboard paths" + "public paths" the
 *      demo spec walks through with full-page screenshots, so a
 *      stakeholder can inspect the visual surface without running tests.
 *
 *   3. A list of "API endpoints that should NEVER 200 for another user"
 *      — used by the API spec to drive its parametrised isolation table.
 *      Mirrors but does NOT duplicate apps/web/e2e/multi-tenant-isolation*
 *      .spec.ts (which is the load-bearing P0 pin); see
 *      docs/testing/coverage/cross-cutting.md for the cross-reference
 *      narrative.
 *
 * All entities used by the API spec use the e2e- prefix from
 * helpers/test-data.ts (one level up) so the cleanup sweep collects them.
 */

import type { APIRequestContext } from '@playwright/test';
import { registerEphemeralUser, testDataName, EphemeralUser } from '../../helpers/test-data';

// ---------------------------------------------------------------------------
// F-X-03 — Security headers expectations
// ---------------------------------------------------------------------------

/**
 * Headers BossBoard should emit on customer-facing responses.
 *
 * Status note (2026-05-23): Next.js middleware in
 * apps/web/src/middleware.ts and apps/web/next.config.ts currently set
 * NONE of these. The demo + tests are written in a REGRESSION-GUARD
 * style: each header has a `mode`:
 *   - 'required'      → assert header present + (optionally) matches policy regex
 *   - 'recommended'   → assert header present (any value) — fail loud if missing
 *   - 'aspirational'  → record current value, do NOT fail if missing; this is
 *                       a target-state assertion that becomes 'required' once
 *                       Next config ships the header (see F-X-03 ACs).
 *
 * The 'aspirational' mode lets these tests land green TODAY without falsely
 * claiming we have CSP, while pinning the EXPECTATION so the next time
 * someone touches Next config they get a green nudge to add headers.
 */
export interface SecurityHeaderExpectation {
  name: string;          // canonical case used by browsers; we compare lowercase
  mode: 'required' | 'recommended' | 'aspirational';
  policy?: RegExp;       // when present, asserted against the header value
  rationale: string;     // shown in failure messages so the next dev knows WHY
}

export const SECURITY_HEADERS: SecurityHeaderExpectation[] = [
  {
    name: 'Content-Security-Policy',
    mode: 'aspirational',
    rationale:
      'Mitigates XSS by restricting script sources. Not yet shipped in next.config.ts — promote to required once headers() function is added.',
  },
  {
    name: 'X-Frame-Options',
    mode: 'aspirational',
    policy: /^(DENY|SAMEORIGIN)$/i,
    rationale:
      'Prevents clickjacking by forbidding embedding in <iframe>. Should be DENY for an authed dashboard. Not yet shipped.',
  },
  {
    name: 'Strict-Transport-Security',
    mode: 'aspirational',
    policy: /max-age=\d+/,
    rationale:
      'Forces HTTPS on subsequent visits. Production-only when behind a real TLS terminator (Railway, Vercel). Not asserted on localhost.',
  },
  {
    name: 'X-Content-Type-Options',
    mode: 'aspirational',
    policy: /^nosniff$/i,
    rationale:
      'Prevents MIME-sniffing attacks. Easy win; should be on every response.',
  },
  {
    name: 'Referrer-Policy',
    mode: 'aspirational',
    policy: /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i,
    rationale:
      'Limits leaking the dashboard URL to third parties via Referer. strict-origin-when-cross-origin is the recommended modern default.',
  },
];

/**
 * Public web pages that should be reachable without auth and whose
 * headers we assert against SECURITY_HEADERS.
 */
export const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
];

/**
 * Authenticated dashboard pages — auth cookie must be present.
 * Subset of routes covered by middleware.spec.ts; we re-exercise them
 * for HEADER coverage (the existing middleware spec only asserts the
 * 302 redirect to /login, not response headers).
 */
export const AUTHED_PAGES = [
  '/dashboard',
  '/swms',
  '/certifications',
  '/invoices',
  '/settings',
];

// ---------------------------------------------------------------------------
// F-X-01 — Multi-tenant isolation API endpoint table
// ---------------------------------------------------------------------------

/**
 * Endpoints where Tradie B asking for Tradie A's resource MUST NOT
 * return 200 with A's body.
 *
 * Existing coverage (load-bearing — DO NOT duplicate the assertions
 * themselves; this list extends the surface area):
 *   - multi-tenant-isolation.spec.ts        pins invoices (GET-by-id + list)
 *   - multi-tenant-isolation-entities.spec.ts pins
 *       customers, quotes, expenses, job_logs, photos
 *
 * Surfaces this matrix adds (NOT yet covered by the existing specs):
 *   - swms              (GET /api/v1/compliance/swms/:id)
 *   - certifications    (GET /api/v1/certifications/:id)
 *   - teams (members)   (GET /api/v1/teams/:teamId/members)
 *   - subscription      (GET /api/v1/subscriptions/me) — should be SELF-only,
 *                       cannot be cross-read by user_id manipulation
 *
 * Each entry contains:
 *   - name:     for test naming
 *   - create:   how to materialise A's entity (or `null` if read-only)
 *   - probeUrl: URL B hits to attempt to read A's data
 *   - okStatuses: acceptable B response codes (must include 403 OR 404; MUST NOT contain 200)
 */
export interface IsolationCase {
  name: string;
  create: ((ctx: APIRequestContext, apiUrl: string, token: string) => Promise<{ id: string; tag: string }>) | null;
  probeUrl: (apiUrl: string, aId: string) => string;
  okStatuses: number[];
  notes?: string;
}

/**
 * SWMS create — minimal payload that the compliance route accepts.
 * The Claude API is REAL in production but for an isolation probe we
 * don't need realistic content; the user_id scope is what's under test.
 */
async function createSwms(
  ctx: APIRequestContext,
  apiUrl: string,
  token: string,
): Promise<{ id: string; tag: string }> {
  const tag = testDataName('swms-iso').tag;
  const res = await ctx.post(`${apiUrl}/api/v1/compliance/swms`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: tag,
      tradeType: 'plumber',
      jobDescription: 'P0 isolation probe — Tradie A only',
      siteAddress: '1 Isolation St, Auckland',
      // Keep AI off: many implementations short-circuit when hazards are
      // provided. If the route insists on calling Claude, this is the
      // ONE place we'll pay for a generation (~$0.01) per full run.
      hazards: [{ description: 'Test hazard', controls: ['Test control'] }],
    },
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(`createSwms: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const id = body?.data?.swms?.id ?? body?.data?.document?.id ?? body?.id;
  if (!id) throw new Error(`createSwms: no id in response: ${JSON.stringify(body)}`);
  return { id, tag };
}

async function createCertification(
  ctx: APIRequestContext,
  apiUrl: string,
  token: string,
): Promise<{ id: string; tag: string }> {
  const tag = testDataName('cert-iso').tag;
  const futureIso = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await ctx.post(`${apiUrl}/api/v1/certifications`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: tag,
      type: 'plumbing-licence',
      number: `ISO-${Date.now()}`,
      expiresAt: futureIso,
    },
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(`createCertification: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const id = body?.data?.certification?.id ?? body?.id;
  if (!id) throw new Error(`createCertification: no id in response: ${JSON.stringify(body)}`);
  return { id, tag };
}

export const ISOLATION_CASES: IsolationCase[] = [
  {
    name: 'swms (compliance documents)',
    create: createSwms,
    probeUrl: (api, id) => `${api}/api/v1/compliance/swms/${id}`,
    okStatuses: [403, 404],
    notes:
      'Extends multi-tenant-isolation-entities.spec.ts which does not cover SWMS. Real Claude calls cost ~$0.01/run if the route insists on AI hazard suggestions.',
  },
  {
    name: 'certifications',
    create: createCertification,
    probeUrl: (api, id) => `${api}/api/v1/certifications/${id}`,
    okStatuses: [403, 404],
    notes:
      'Extends multi-tenant-isolation-entities.spec.ts which lists customers/quotes/expenses/job_logs/photos but not certifications.',
  },
];

// ---------------------------------------------------------------------------
// Reusable: register a pair of unrelated tradies in two different "teams"
// ---------------------------------------------------------------------------

/**
 * Helper for cross-cutting tests that need a pair of unrelated tradies.
 * The test owns the cleanup() lifecycle — call both .cleanup() in a
 * try/finally.
 *
 * "Two different teams" is satisfied by each register call creating a
 * brand-new owner-only team-of-one (the default register flow). For
 * F-X-01 ACs 1+2 we don't need cross-team invites; we just need two
 * independent users.
 */
export async function pairTradies(
  ctx: APIRequestContext,
  apiUrl: string,
  purpose: string,
): Promise<{ a: EphemeralUser; b: EphemeralUser }> {
  const a = await registerEphemeralUser(ctx, apiUrl, `${purpose}-a`);
  const b = await registerEphemeralUser(ctx, apiUrl, `${purpose}-b`);
  return { a, b };
}

/**
 * Lowercase a header map and look up by canonical name (case-insensitive).
 * Playwright's `response.headers()` returns keys in their server-emitted
 * case; comparing canonical-cased SECURITY_HEADERS names directly would
 * miss `content-security-policy` vs `Content-Security-Policy`.
 */
export function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}
