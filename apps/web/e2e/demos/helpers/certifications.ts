/**
 * Certifications module — demo + spec coverage helpers.
 *
 * Phase 3 Agent 3 of the 2026-05-23 e2e-demo-spec-coverage-suite plan.
 * Produces realistic NZ-tradie certification fixtures for headed
 * Playwright demos + API e2e tests, so when Marc watches the run he
 * sees "Electrical Worker License (EWRB)" rather than "test cert 1".
 *
 * Inputs:
 *   - API_URL: defaults to http://localhost:29000 (apps/api dev server)
 *   - testDataName / registerEphemeralUser from ../../helpers/test-data
 *
 * Outputs:
 *   - CertFixture: realistic NZ cert payloads with predictable expiry
 *     dates so F-CERT-02 (notification thresholds) can be tested
 *     deterministically.
 *   - createCertViaApi: posts to /api/v1/certifications using a
 *     Tradie's bearer token, returns the created row.
 *   - deleteCertViaApi: best-effort cleanup.
 *
 * Per ~/.claude/CLAUDE.md and apps/web/e2e/helpers/test-data.ts:
 * every created entity must be cleaned up. Helpers return a cleanup()
 * function which callers must invoke in afterEach / finally.
 */

import type { APIRequestContext } from '@playwright/test';
import { testDataName } from '../../helpers/test-data';

export const API_URL =
  process.env.PROD_API_URL || process.env.API_URL || 'http://localhost:29000';

// Schema-valid cert type from apps/api/src/routes/certifications.ts:
//   'electrical' | 'gas' | 'plumbing' | 'lpg' | 'first_aid' | 'site_safe' | 'other'
export type CertType =
  | 'electrical'
  | 'gas'
  | 'plumbing'
  | 'lpg'
  | 'first_aid'
  | 'site_safe'
  | 'other';

export interface CertFixture {
  type: CertType;
  name: string;
  certNumber: string;
  issuingBody: string;
  issueDate: string; // ISO yyyy-mm-dd
  expiryDate: string; // ISO yyyy-mm-dd
}

/**
 * Return today + N days as YYYY-MM-DD. Used to drive F-CERT-02
 * notification-threshold paths (30/14/7/1 days).
 */
export function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Curated NZ-tradie cert fixtures — real licensing bodies + realistic
 * cert-number formats. Demo viewers see plausible data, not lorem
 * ipsum.
 */
export const NZ_CERT_FIXTURES = {
  electricalEWRB: (): CertFixture => ({
    type: 'electrical',
    name: 'Electrical Worker License (EWRB)',
    certNumber: `EW-${Math.floor(100000 + Math.random() * 900000)}`,
    issuingBody: 'Electrical Workers Registration Board',
    issueDate: daysFromNow(-365),
    expiryDate: daysFromNow(365), // valid, 1y out
  }),
  gasfitterClass1: (): CertFixture => ({
    type: 'gas',
    name: 'Gasfitter Class 1',
    certNumber: `GF1-${Math.floor(10000 + Math.random() * 90000)}`,
    issuingBody: 'Plumbers, Gasfitters and Drainlayers Board',
    issueDate: daysFromNow(-400),
    expiryDate: daysFromNow(180),
  }),
  confinedSpaceEntry: (): CertFixture => ({
    type: 'site_safe',
    name: 'Confined Space Entry',
    certNumber: `CSE-${Math.floor(1000 + Math.random() * 9000)}`,
    issuingBody: 'Site Safe NZ',
    issueDate: daysFromNow(-300),
    expiryDate: daysFromNow(60),
  }),
  workingAtHeights: (): CertFixture => ({
    type: 'site_safe',
    name: 'Working at Heights NZQA Unit 17600',
    certNumber: `WAH-${Math.floor(10000 + Math.random() * 90000)}`,
    issuingBody: 'Site Safe NZ',
    issueDate: daysFromNow(-180),
    expiryDate: daysFromNow(545), // ~18 months out
  }),
  firstAidComprehensive: (): CertFixture => ({
    type: 'first_aid',
    name: 'First Aid Comprehensive',
    certNumber: `FA-${Math.floor(10000 + Math.random() * 90000)}`,
    issuingBody: 'St John',
    issueDate: daysFromNow(-540),
    expiryDate: daysFromNow(180), // 2-year cert, halfway through
  }),
  /**
   * Cert deliberately expiring in 7 days — used to exercise the
   * F-CERT-02 7-day notification threshold via
   * POST /api/v1/notifications/check-expiry.
   */
  expiringIn7Days: (): CertFixture => ({
    type: 'electrical',
    name: 'Electrical Worker License (EWRB)',
    certNumber: `EW-${Math.floor(100000 + Math.random() * 900000)}`,
    issuingBody: 'Electrical Workers Registration Board',
    issueDate: daysFromNow(-720),
    expiryDate: daysFromNow(7),
  }),
  /**
   * Cert deliberately expiring tomorrow — exercises the 1-day
   * threshold and 'Expiring soon' UI badge state.
   */
  expiringIn1Day: (): CertFixture => ({
    type: 'gas',
    name: 'Gasfitter Class 1',
    certNumber: `GF1-${Math.floor(10000 + Math.random() * 90000)}`,
    issuingBody: 'Plumbers, Gasfitters and Drainlayers Board',
    issueDate: daysFromNow(-730),
    expiryDate: daysFromNow(1),
  }),
};

export interface CreatedCert {
  id: string;
  fixture: CertFixture;
  cleanup: () => Promise<void>;
}

/**
 * Create a cert via the API using the given bearer token.
 * Returns the created row plus a cleanup() closure that DELETEs it.
 *
 * Caller MUST invoke cleanup() in afterEach/afterAll or a finally
 * block — per the e2e-test-data-lifecycle directive.
 */
export async function createCertViaApi(
  request: APIRequestContext,
  accessToken: string,
  fixture: CertFixture,
): Promise<CreatedCert> {
  const res = await request.post(`${API_URL}/api/v1/certifications`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: fixture,
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(
      `createCertViaApi: expected 201, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const id =
    body?.data?.certification?.id || body?.certification?.id || body?.data?.id;
  if (!id) {
    throw new Error(
      `createCertViaApi: no id in response body: ${JSON.stringify(body)}`,
    );
  }
  return {
    id,
    fixture,
    cleanup: async () => {
      try {
        await request.delete(`${API_URL}/api/v1/certifications/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          failOnStatusCode: false,
        });
      } catch {
        // Best-effort cleanup — global teardown sweep is the safety net.
      }
    },
  };
}

/**
 * Tag generator for cert names so global teardown can find/sweep them
 * if the per-test cleanup misses one. Pattern matches the e2e-prefix
 * used by registerEphemeralUser / testDataName.
 */
export function taggedCertName(baseName: string, purpose: string): string {
  const tag = testDataName(purpose).tag;
  return `${baseName} (${tag})`;
}
