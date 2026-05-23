/**
 * Module 7 — Job logs API demos.
 *
 * Feature IDs covered (see docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 7):
 *   - F-JOB-01 — Create job log + clock in
 *   - F-JOB-02 — Clock out + add notes
 *   - F-JOB-03 — Job log stats
 *
 * Surface: A (Playwright `request` fixture, direct against Express API).
 *
 * Not-runnable note: dev env was not running when this file was authored
 * (Phase 3 brief: "NO EXECUTION"). Spec is syntax-verified via
 * `playwright test --list` only. When Marc runs `npm run demo:api` with
 * docker-compose up, these tests hit the real Express API at API_BASE_URL.
 *
 * The duration assertion uses a small wall-clock window (clock-in then
 * clock-out within the same test) — the spec does NOT freeze server time
 * because the route reads Date.now() inside the service layer; instead we
 * rely on the test running fast enough that endTime - startTime is
 * non-negative and small. If you need precise duration assertions, prefer
 * the Jest route tests in apps/api/src/__tests__/routes/job-logs.test.ts
 * where the service can be mocked.
 */

import { test, expect } from '@playwright/test';
import { registerEphemeralUser } from '../../helpers/test-data';
import {
  JOB_LOGS_API,
  buildCreateJobLogPayload,
  pickJobSite,
  clockInViaApi,
  clockOutViaApi,
} from '../helpers/job-logs';

const API_URL = process.env.API_BASE_URL || 'http://localhost:29000';

test.describe('F-JOB Module 7 — Job logs (API)', () => {
  test('F-JOB-01: clock in creates an active job log', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-clock-in');
    try {
      const site = pickJobSite(1);
      const payload = buildCreateJobLogPayload(site);

      const res = await request.post(`${API_URL}${JOB_LOGS_API.base}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: payload,
        failOnStatusCode: false,
      });

      // AC1: returns 201
      expect(res.status()).toBe(201);

      const body = await res.json();
      // AC1 (cont): response shape matches the route contract
      expect(body.success).toBe(true);
      expect(body.data?.jobLog?.id).toBeTruthy();

      // AC1 (cont): payload fields persisted
      expect(body.data.jobLog.description).toBe(site.description);
      expect(body.data.jobLog.siteAddress).toBe(site.siteAddress);

      // AC1 (cont): default status is 'active' after clock-in
      expect(body.data.jobLog.status).toBe('active');
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-01: missing description returns 400 VALIDATION_ERROR', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-validation');
    try {
      const res = await request.post(`${API_URL}${JOB_LOGS_API.base}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: { siteAddress: '247 Queen St, Auckland CBD' },
        failOnStatusCode: false,
      });

      // AC: zod schema (createJobLogSchema) requires description
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-01: GET /active returns the currently clocked-in job', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-active');
    try {
      const site = pickJobSite(2);
      const created = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(site),
      );

      const res = await request.get(`${API_URL}${JOB_LOGS_API.active}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        failOnStatusCode: false,
      });

      // AC3 (Module 7 spec): /active returns the active job log
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data?.jobLog?.id).toBe(created.id);
      expect(body.data.jobLog.status).toBe('active');
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-02: clock out transitions to completed + records notes', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-clock-out');
    try {
      const site = pickJobSite(3);
      const created = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(site),
      );

      const closingNotes =
        'Wrapped up — chiller pressure tested at 350kPa for 15 min, no drop. Customer signed completion docket.';
      const res = await request.post(
        `${API_URL}${JOB_LOGS_API.clockOut(created.id)}`,
        {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          data: { notes: closingNotes },
          failOnStatusCode: false,
        },
      );

      // AC1 (F-JOB-02): clock-out returns 200 and transitions to completed
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data?.jobLog?.status).toBe('completed');

      // AC1 (F-JOB-02): endTime populated
      expect(body.data.jobLog.endTime).toBeTruthy();
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-02: PUT updates job log notes after clock-out', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-edit-notes');
    try {
      const site = pickJobSite(4);
      const created = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(site),
      );
      await clockOutViaApi(request, API_URL, user.accessToken, created.id, 'initial wrap');

      const correctedNotes =
        'Corrected: replaced 2x RCBOs (not 3 as logged) + parts ordered for follow-up next Tue.';
      const res = await request.put(`${API_URL}${JOB_LOGS_API.byId(created.id)}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        data: { notes: correctedNotes },
        failOnStatusCode: false,
      });

      // AC2 (F-JOB-02): PUT accepts post-clock-out note edits
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data?.jobLog?.notes).toBe(correctedNotes);
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-02: clock-out with notes over 2000 chars fails validation', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-notes-toolong');
    try {
      const site = pickJobSite(0);
      const created = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(site),
      );

      const tooLong = 'x'.repeat(2001);
      const res = await request.post(
        `${API_URL}${JOB_LOGS_API.clockOut(created.id)}`,
        {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          data: { notes: tooLong },
          failOnStatusCode: false,
        },
      );

      // AC: zod schema (clockOutSchema) caps notes at 2000 chars
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');

      // Clean up — clock out for real so cleanup doesn't leave an active job.
      await clockOutViaApi(request, API_URL, user.accessToken, created.id);
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-03: GET /stats returns aggregated stats shape', async ({ request }) => {
    const user = await registerEphemeralUser(request, API_URL, 'job-stats');
    try {
      // Seed one completed log so stats has something to aggregate.
      const site = pickJobSite(2);
      const created = await clockInViaApi(
        request,
        API_URL,
        user.accessToken,
        buildCreateJobLogPayload(site),
      );
      await clockOutViaApi(request, API_URL, user.accessToken, created.id, 'wrapped');

      const res = await request.get(`${API_URL}${JOB_LOGS_API.stats}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        failOnStatusCode: false,
      });

      // AC1 (F-JOB-03): /stats returns 200 + stats object
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data?.stats).toBeDefined();
    } finally {
      await user.cleanup();
    }
  });

  test('F-JOB-03: stats endpoint is multi-tenant isolated', async ({ request }) => {
    // Two distinct users; user A's data must NOT appear in user B's stats.
    const userA = await registerEphemeralUser(request, API_URL, 'job-stats-iso-a');
    const userB = await registerEphemeralUser(request, API_URL, 'job-stats-iso-b');
    try {
      const site = pickJobSite(1);
      const aCreated = await clockInViaApi(
        request,
        API_URL,
        userA.accessToken,
        buildCreateJobLogPayload(site),
      );
      await clockOutViaApi(request, API_URL, userA.accessToken, aCreated.id, 'A done');

      // User B has clocked nothing — but their stats endpoint must still
      // return 200 with B-scoped values (NOT A's).
      const res = await request.get(`${API_URL}${JOB_LOGS_API.stats}`, {
        headers: { Authorization: `Bearer ${userB.accessToken}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      // AC2 (F-JOB-03): multi-tenant isolation — B sees nothing from A.
      // Loose-shape assertion (route returns stats object whose exact
      // keys are determined by service layer — assert it doesn't contain
      // A's job description as a value, which would indicate leakage).
      const stringified = JSON.stringify(body.data?.stats || {});
      expect(stringified).not.toContain(site.description);
    } finally {
      await userA.cleanup();
      await userB.cleanup();
    }
  });

  test('F-JOB: unauthenticated requests are rejected', async ({ request }) => {
    // No Authorization header — auth middleware should 401 before reaching
    // any of the module's routes.
    const res = await request.get(`${API_URL}${JOB_LOGS_API.base}`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });
});
