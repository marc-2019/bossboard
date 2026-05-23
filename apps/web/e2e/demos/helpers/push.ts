/**
 * Per-module helpers for the Push Notifications demo suite (F-PUSH-01).
 *
 * Push notifications are an API + Mobile feature only (no web surface) —
 * these helpers are imported exclusively by the API demo at
 * `apps/web/e2e/demos/api/push.api.spec.ts`. The mobile Maestro flows
 * import nothing (YAML is self-contained).
 *
 * Responsibilities:
 *   - `fakeExpoPushToken(purpose)` — emit a deterministic, realistic
 *     Expo push token in the canonical `ExponentPushToken[...]` shape.
 *     Determinism keeps screenshot review stable and makes Expo Push API
 *     mocks predictable. The 22-char inner segment follows Expo's
 *     observed format (alphanumeric + `-_`).
 *
 *   - `EXPIRY_CERT_FIXTURE` / `expiringCertScenarios` — realistic NZ
 *     certification fixtures that exercise the 4 expiry thresholds the
 *     cron service handles (30 / 14 / 7 / 1 days). Anchored on real-world
 *     trade certifications (EWRB Electrical Worker License, Gasfitter
 *     PGDB, Site Safe). Used by API demos that drive the
 *     POST /api/v1/notifications/check-expiry endpoint.
 *
 *   - `expectedExpiryBody(certName, days)` — constructs the
 *     push-notification body the API service should produce for a given
 *     threshold. Mirrors `getExpiryBody()` in
 *     `apps/api/src/services/notifications.ts:258-264` so demos assert
 *     against the same copy the service emits.
 *
 *   - `expectedExpiryTitle(days)` — same idea for the title emoji+text.
 *     Mirrors `getExpiryTitle()` in the service.
 *
 *   - `parseExpoPushPayload(body)` — typed parser for the JSON body that
 *     `notificationsService.sendPushNotifications` POSTs to
 *     `https://exp.host/--/api/v2/push/send`. Used by mock-route
 *     assertions in the API demo to verify payload shape (to, title,
 *     body, data.type, data.daysUntilExpiry).
 *
 *   - `API_BASE_URL` — shared base URL convention, mirrors the auth /
 *     quotes demo helpers.
 *
 * Note: the brief specifies NO EXECUTION because the dev env is not
 * running. Helpers are shape-correct and TypeScript-checked but not
 * exercised at runtime in this PR; Phase 4 will run them with real
 * services up. The Expo Push API call is mocked at the route level (see
 * Playwright `request` fixture interception in the spec).
 *
 * Reference push-token format from existing test:
 *   apps/api/src/__tests__/routes/notifications.test.ts:69
 *   `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` (22 chars inside brackets)
 */

import type { APIRequestContext } from '@playwright/test';

/**
 * Expo Push API endpoint that `apps/api/src/services/notifications.ts`
 * POSTs to. Kept as a named constant so demos and mocks share a single
 * source of truth (and so a swap to the documented `https://exp.host/`
 * vs the legacy `https://exp.host/--/api/v2/push/send` is one-line).
 */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * API base URL for demo tests. Mirrors the convention used by
 * `apps/web/e2e/demos/helpers/auth.ts` and `helpers/quotes.ts`.
 */
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:29000';

/**
 * Expo push-token character set (alphanumeric + `-_` based on the
 * Expo SDK observed format). 22 chars matches the existing route-test
 * fixture in `notifications.test.ts:69`.
 */
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/**
 * Build a deterministic, realistic Expo push token for a given test
 * purpose. The 22-char inner segment is derived from a stable hash of
 * the purpose string, so the same test always sees the same token
 * (helps with screenshot review and mock-payload assertions).
 *
 * Format: `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`
 *
 * Why not random: the brief calls out "realistic Expo format" and a
 * deterministic value lets the Maestro flow's screenshot caption match
 * the value the API saw, without coordination overhead.
 */
export function fakeExpoPushToken(purpose: string): string {
  let hash = 0;
  for (let i = 0; i < purpose.length; i += 1) {
    hash = (hash * 31 + purpose.charCodeAt(i)) | 0;
  }
  let absHash = Math.abs(hash);
  let inner = '';
  for (let i = 0; i < 22; i += 1) {
    inner += TOKEN_CHARS[absHash % TOKEN_CHARS.length];
    absHash = Math.floor(absHash / TOKEN_CHARS.length) + (i + 1) * 17;
  }
  return `ExponentPushToken[${inner}]`;
}

/**
 * Expo-Push-API ticket shape returned by `https://exp.host/--/api/v2/push/send`.
 * Mirrors the type in `apps/api/src/services/notifications.ts:22-27`.
 */
export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Expo-Push-API outbound message shape that the notifications service
 * POSTs in batches of up to 100. Mirrors the type in the service file.
 */
export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

/**
 * Realistic NZ certification fixtures that exercise the 4 expiry
 * thresholds the cron service watches (30 / 14 / 7 / 1 days). The
 * `daysUntilExpiry` field is the test-harness input — the actual
 * certification row in the DB needs `expiry_date = CURRENT_DATE + N days`.
 *
 * Cert types are anchored to real-world NZ trade compliance:
 *   - electrical → EWRB Electrical Worker License (PrescElec, 24-mo cycle)
 *   - gas        → PGDB Gasfitter Practising Licence (12-mo cycle)
 *   - site_safe  → Site Safe Passport (24-mo cycle)
 *   - first_aid  → NZRC First Aid Certificate (24-mo cycle)
 */
export interface ExpiringCertFixture {
  type: 'electrical' | 'gas' | 'plumbing' | 'lpg' | 'first_aid' | 'site_safe' | 'other';
  name: string;
  certNumber: string;
  issuingBody: string;
  daysUntilExpiry: number;
}

export const expiringCertScenarios: Record<string, ExpiringCertFixture> = {
  electrical30: {
    type: 'electrical',
    name: 'Electrical Worker License (EWRB)',
    certNumber: 'EWRB-PE-123456',
    issuingBody: 'Electrical Workers Registration Board',
    daysUntilExpiry: 30,
  },
  gas14: {
    type: 'gas',
    name: 'Gasfitter Practising Licence',
    certNumber: 'PGDB-GF-78910',
    issuingBody: 'Plumbers, Gasfitters and Drainlayers Board',
    daysUntilExpiry: 14,
  },
  siteSafe7: {
    type: 'site_safe',
    name: 'Site Safe Passport',
    certNumber: 'SSP-2026-11223',
    issuingBody: 'Site Safe New Zealand',
    daysUntilExpiry: 7,
  },
  firstAid1: {
    type: 'first_aid',
    name: 'NZRC First Aid Certificate',
    certNumber: 'NZRC-FA-44556',
    issuingBody: 'New Zealand Resuscitation Council',
    daysUntilExpiry: 1,
  },
};

/**
 * The canonical scenario for the F-PUSH-01 demo headline assertion:
 * a 7-day-out Electrical Worker License — matches the data-realism
 * line in the brief ("Your Electrical Worker License (EWRB) expires
 * in 7 days").
 */
export const EXPIRY_CERT_FIXTURE: ExpiringCertFixture = {
  type: 'electrical',
  name: 'Electrical Worker License (EWRB)',
  certNumber: 'EWRB-PE-998877',
  issuingBody: 'Electrical Workers Registration Board',
  daysUntilExpiry: 7,
};

/**
 * Replicates `getExpiryTitle()` in
 * `apps/api/src/services/notifications.ts:252-256`. Demos assert the
 * intercepted Expo Push payload uses this exact title for the threshold.
 */
export function expectedExpiryTitle(days: number): string {
  if (days === 1) return '🚨 Certification Expires Tomorrow!';
  if (days <= 7) return '⚠️ Certification Expiring Soon';
  return '📋 Certification Expiry Reminder';
}

/**
 * Replicates `getExpiryBody()` in
 * `apps/api/src/services/notifications.ts:258-264`. Demos assert the
 * intercepted Expo Push payload body matches.
 *
 * Note: the service prefers `certType` over `name` (see line 259) — for
 * fixtures we pass the human-readable `name` and accept that the
 * service may pass `certType` enum string instead, depending on which
 * column is populated. Demo assertions should use `expect.stringMatching`
 * against the days/weeks phrase rather than the cert label.
 */
export function expectedExpiryBody(certLabel: string, days: number): string {
  if (days === 1) return `Your ${certLabel} expires tomorrow. Renew now to avoid compliance issues.`;
  if (days === 7) return `Your ${certLabel} expires in 1 week. Time to start the renewal process.`;
  if (days === 14) return `Your ${certLabel} expires in 2 weeks. Plan your renewal.`;
  return `Your ${certLabel} expires in ${days} days. Consider starting your renewal.`;
}

/**
 * Type-narrowed parser for the Expo Push request body that the API
 * service POSTs. Demos call this on the captured `request.postDataJSON()`
 * inside a route interceptor to assert shape without hand-typing the
 * Array<ExpoPushMessage> union everywhere.
 */
export function parseExpoPushPayload(body: unknown): ExpoPushMessage[] {
  if (!Array.isArray(body)) {
    throw new Error(`parseExpoPushPayload: expected array, got ${typeof body}`);
  }
  return body as ExpoPushMessage[];
}

/**
 * Best-effort DELETE of any push token + certifications created in a
 * push demo. Always called from a try/finally — never throws.
 */
export async function cleanupPushDemo(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string | undefined,
  certIds: string[] = [],
): Promise<void> {
  if (!accessToken) return;
  try {
    // Remove the push token
    await request.delete(`${apiUrl}/api/v1/notifications/push-token`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      failOnStatusCode: false,
    });
    // Delete each cert we created
    for (const id of certIds) {
      await request.delete(`${apiUrl}/api/v1/certifications/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        failOnStatusCode: false,
      });
    }
  } catch {
    // Best-effort. The global teardown sweep is the safety net.
  }
}

/**
 * Compute an ISO YYYY-MM-DD date N days from today. Used to construct
 * the `expiryDate` field in certification create payloads so the cron
 * service's `expiry_date = CURRENT_DATE + INTERVAL 'N days'` query
 * matches the fixture.
 */
export function expiryDateNDaysFromNow(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}
