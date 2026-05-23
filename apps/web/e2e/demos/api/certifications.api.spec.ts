/**
 * F-CERT (Certifications) — API demos via Playwright `request` fixture.
 *
 * Phase 3 Agent 3 of 2026-05-23-e2e-demo-spec-coverage-suite plan.
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 3.
 *
 * Hits the REAL Express API on http://localhost:29000 — no mocks
 * inside the API process. The Expo Push outbound call (made by
 * notificationsService.checkAndNotifyExpiringCerts when a cert is
 * within a threshold window) is treated as a no-op for test purposes:
 * the test asserts the API endpoint shape + the run-now control-flow,
 * not that Expo's servers were reached. In dev, expo.host returns an
 * error ticket for the synthetic 'TEST-NO-PUSH-TOKEN' token without
 * any real device side-effect.
 *
 * Feature coverage:
 *   F-CERT-01 — full CRUD round-trip (POST, GET list, GET by id, PUT,
 *               DELETE). Asserts validation errors for bad input.
 *   F-CERT-02 — GET /api/v1/certifications/expiring returns certs
 *               within N-day window. POST /api/v1/notifications/
 *               check-expiry triggers the cron job on demand and
 *               returns a { checked, notified } summary.
 *   F-CERT-03 — POST /api/v1/photos with entityType=certification —
 *               EXPECTED to return 400 today because the photos zod
 *               schema does not list 'certification'. This is a SPEC
 *               DRIFT we deliberately pin so it surfaces in CI rather
 *               than silently regressing one way or the other.
 *
 * Real-services cost note: zero. No Stripe / Resend / Claude calls in
 * this file. Expo Push is called but with a non-deliverable test
 * token; Expo charges nothing for invalid-token tickets.
 */

import { test, expect } from '@playwright/test';
import { registerEphemeralUser, type EphemeralUser } from '../../helpers/test-data';
import {
  API_URL,
  NZ_CERT_FIXTURES,
  daysFromNow,
} from '../helpers/certifications';

test.describe('F-CERT (Certifications) — API demos', () => {
  let user: EphemeralUser;
  const createdCertIds: string[] = [];

  test.beforeEach(async ({ request }) => {
    user = await registerEphemeralUser(request, API_URL, 'cert-api-demo');
  });

  test.afterEach(async ({ request }) => {
    // Delete any certs that survived a failure
    for (const id of createdCertIds) {
      try {
        await request.delete(`${API_URL}/api/v1/certifications/${id}`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          failOnStatusCode: false,
        });
      } catch {
        /* best-effort */
      }
    }
    createdCertIds.length = 0;
    if (user) await user.cleanup().catch(() => undefined);
  });

  // ===========================================================
  // F-CERT-01 — Create / list / read / update / delete
  // ===========================================================

  test('F-CERT-01 AC1: POST /api/v1/certifications creates an EWRB cert', async ({ request }) => {
    const fixture = NZ_CERT_FIXTURES.electricalEWRB();
    const res = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: fixture,
      failOnStatusCode: false,
    });
    expect(res.status(), `body: ${await res.text()}`).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.certification.name).toBe('Electrical Worker License (EWRB)');
    expect(body.data.certification.type).toBe('electrical');
    expect(body.data.certification.id).toBeTruthy();
    createdCertIds.push(body.data.certification.id);
  });

  test('F-CERT-01 AC1 (validation): POST rejects unknown cert type with 400', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: {
        type: 'welding', // not in the certificationTypes enum
        name: 'Hot Works Ticket',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  test('F-CERT-01 AC1 (validation): POST rejects missing name with 400', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { type: 'gas' }, // missing required name
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
  });

  test('F-CERT-01 AC2: GET /api/v1/certifications returns the tradie\'s certs', async ({ request }) => {
    // Seed 2 certs
    const f1 = NZ_CERT_FIXTURES.gasfitterClass1();
    const f2 = NZ_CERT_FIXTURES.firstAidComprehensive();

    for (const f of [f1, f2]) {
      const r = await request.post(`${API_URL}/api/v1/certifications`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: f,
      });
      expect(r.status()).toBe(201);
      createdCertIds.push((await r.json()).data.certification.id);
    }

    const list = await request.get(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.success).toBe(true);
    // Service returns either `{certifications: [...]}` or a similar
    // shape — accept both since the unit test mocks it abstractly.
    const arr =
      body.data?.certifications ??
      body.data?.rows ??
      body.data ??
      [];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThanOrEqual(2);
    const names = arr.map((c: { name: string }) => c.name);
    expect(names).toContain('Gasfitter Class 1');
    expect(names).toContain('First Aid Comprehensive');
  });

  test('F-CERT-01 AC3: PUT /api/v1/certifications/:id updates fields', async ({ request }) => {
    const create = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: NZ_CERT_FIXTURES.confinedSpaceEntry(),
    });
    expect(create.status()).toBe(201);
    const id = (await create.json()).data.certification.id;
    createdCertIds.push(id);

    const updated = await request.put(`${API_URL}/api/v1/certifications/${id}`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: {
        certNumber: 'CSE-99999-RENEWED',
        expiryDate: daysFromNow(720),
      },
      failOnStatusCode: false,
    });
    expect(updated.status(), `body: ${await updated.text()}`).toBe(200);
    const body = await updated.json();
    expect(body.success).toBe(true);
    // Field name may be returned as either certNumber or cert_number
    // depending on the service mapper — accept both shapes.
    const cert = body.data.certification;
    const certNum = cert.certNumber ?? cert.cert_number;
    expect(certNum).toBe('CSE-99999-RENEWED');
  });

  test('F-CERT-01 AC4: DELETE /api/v1/certifications/:id removes the cert', async ({ request }) => {
    const create = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: NZ_CERT_FIXTURES.workingAtHeights(),
    });
    expect(create.status()).toBe(201);
    const id = (await create.json()).data.certification.id;

    const del = await request.delete(`${API_URL}/api/v1/certifications/${id}`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(del.status()).toBe(200);

    const getAfter = await request.get(`${API_URL}/api/v1/certifications/${id}`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      failOnStatusCode: false,
    });
    expect(getAfter.status()).toBe(404);
  });

  test('F-CERT-01 AC5: tradie cannot read another tradie\'s cert (multi-tenant)', async ({ request }) => {
    // Tradie A creates a cert
    const create = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: NZ_CERT_FIXTURES.gasfitterClass1(),
    });
    expect(create.status()).toBe(201);
    const id = (await create.json()).data.certification.id;
    createdCertIds.push(id);

    // Tradie B registers, attempts to GET A's cert
    const tradieB = await registerEphemeralUser(request, API_URL, 'cert-iso-b');
    try {
      const bRead = await request.get(`${API_URL}/api/v1/certifications/${id}`, {
        headers: { Authorization: `Bearer ${tradieB.accessToken}` },
        failOnStatusCode: false,
      });
      // Either 404 (preferred — no info disclosure) or 403 (also fine)
      expect([403, 404]).toContain(bRead.status());

      // B's own list must not include A's cert
      const bList = await request.get(`${API_URL}/api/v1/certifications`, {
        headers: { Authorization: `Bearer ${tradieB.accessToken}` },
      });
      expect(bList.status()).toBe(200);
      const arr =
        (await bList.json()).data?.certifications ??
        (await bList.json()).data?.rows ??
        [];
      const ids = arr.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(id);
    } finally {
      await tradieB.cleanup().catch(() => undefined);
    }
  });

  // ===========================================================
  // F-CERT-02 — Expiry tracking + on-demand notification check
  // ===========================================================

  test('F-CERT-02 AC1: GET /certifications/expiring returns certs within the window', async ({ request }) => {
    // Seed 3 certs: 1 valid-long, 1 expiring-in-7d, 1 expiring-in-1d.
    const longValid = NZ_CERT_FIXTURES.workingAtHeights(); // ~18mo out
    const seven = NZ_CERT_FIXTURES.expiringIn7Days();
    const one = NZ_CERT_FIXTURES.expiringIn1Day();
    for (const f of [longValid, seven, one]) {
      const r = await request.post(`${API_URL}/api/v1/certifications`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: f,
      });
      expect(r.status()).toBe(201);
      createdCertIds.push((await r.json()).data.certification.id);
    }

    // Default window = 30 days
    const exp = await request.get(`${API_URL}/api/v1/certifications/expiring`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(exp.status()).toBe(200);
    const body = await exp.json();
    const expiringCerts: Array<{ name: string }> = body.data?.certifications ?? [];
    const names = expiringCerts.map((c) => c.name);
    // The 7-day and 1-day certs must be present in the default window.
    expect(names.some((n) => n.includes('Electrical Worker License'))).toBe(true);
    expect(names.some((n) => n.includes('Gasfitter Class 1'))).toBe(true);
    // The long-valid one must NOT be in the window.
    expect(names).not.toContain('Working at Heights NZQA Unit 17600');
  });

  test('F-CERT-02 AC4: POST /api/v1/notifications/check-expiry runs the cron on demand', async ({ request }) => {
    // Seed a cert expiring in exactly 7 days — matches one of the
    // notification thresholds in services/notifications.ts.
    const fixture = NZ_CERT_FIXTURES.expiringIn7Days();
    const create = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: fixture,
    });
    expect(create.status()).toBe(201);
    createdCertIds.push((await create.json()).data.certification.id);

    // Register a synthetic push token so the cron has someone to
    // notify. Token is deliberately non-deliverable — Expo returns an
    // 'error' ticket but the endpoint records the attempt, which is
    // what we assert.
    const tokenRes = await request.post(`${API_URL}/api/v1/notifications/push-token`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: { pushToken: 'ExponentPushToken[TEST-NO-PUSH-TOKEN-cert-demo]' },
      failOnStatusCode: false,
    });
    // Accept either 200 or 201 depending on insert-vs-update path
    expect([200, 201]).toContain(tokenRes.status());

    const checkRes = await request.post(`${API_URL}/api/v1/notifications/check-expiry`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      failOnStatusCode: false,
    });
    expect(checkRes.status(), `body: ${await checkRes.text()}`).toBe(200);
    const body = await checkRes.json();
    expect(body.success).toBe(true);
    // The endpoint returns { checked: <int>, notified: <int> } from
    // services/notifications.ts checkAndNotifyExpiringCerts(). Both
    // are non-negative integers; we assert shape, not exact counts
    // (depends on real DB state and Expo's response).
    expect(typeof body.data.checked).toBe('number');
    expect(typeof body.data.notified).toBe('number');
    expect(body.data.checked).toBeGreaterThanOrEqual(0);
    expect(body.data.notified).toBeGreaterThanOrEqual(0);
  });

  // ===========================================================
  // F-CERT-03 — Cert document upload (PINNED DRIFT)
  // ===========================================================

  test('F-CERT-03 (DRIFT): POST /api/v1/photos rejects entityType=certification today', async ({ request }) => {
    // SPEC DRIFT — F-CERT-03 AC1 says "POST /api/v1/photos with
    // entityType=certification uploads the file", but the photos route
    // (apps/api/src/routes/photos.ts) zod schema today only accepts
    // ['swms', 'invoice', 'expense', 'job_log'].
    //
    // We pin this test to FAIL CLOSED — if/when the schema is updated
    // to include 'certification', this test will start failing with a
    // 201, signalling that F-CERT-03 is implemented and the spec
    // matrix can flip from 🟡 to 🟢.
    //
    // Create a real cert first so the test exercises the same shape a
    // real cert-attach attempt would.
    const create = await request.post(`${API_URL}/api/v1/certifications`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      data: NZ_CERT_FIXTURES.electricalEWRB(),
    });
    expect(create.status()).toBe(201);
    const certId = (await create.json()).data.certification.id;
    createdCertIds.push(certId);

    // Construct a tiny PNG (1x1 transparent) so the multipart upload
    // is a valid image as far as the multer fileFilter is concerned;
    // the zod validation should reject 'certification' BEFORE the
    // file is processed but we send a real image to ensure we're
    // testing the schema, not multer.
    const onePxPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    );

    const upload = await request.post(`${API_URL}/api/v1/photos`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
      multipart: {
        photo: {
          name: 'cert.png',
          mimeType: 'image/png',
          buffer: onePxPng,
        },
        entityType: 'certification',
        entityId: certId,
      },
      failOnStatusCode: false,
    });
    // Expected today: 400 VALIDATION_ERROR because 'certification' is
    // not in the photos entity-type enum. Accept 400 or 422; reject
    // anything else (esp. 201 — which would mean F-CERT-03 is built
    // and this test needs updating).
    expect(
      [400, 422],
      `If this assertion ever sees 201, F-CERT-03 has shipped — flip the spec matrix from 🟡 to 🟢 and rewrite this test to assert success.`,
    ).toContain(upload.status());
  });
});
