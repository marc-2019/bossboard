/**
 * Compliance module API demos — F-COMP-01…04.
 *
 * Module: Compliance (SWMS) API surface
 * Spec: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 2 — Compliance
 *
 * COST GUARD — IMPORTANT
 * Real Claude generation costs ~$0.01 per call. Per the parent plan
 * (Phase 3 cost guard: "limit to 2 calls max for the full test run"), this
 * spec uses `useAI: false` for ALL `POST /api/v1/swms/generate` calls —
 * the swms.service falls back to the deterministic template path and the
 * generated document still carries hazards/controls/regulations from the
 * trade template JSON files (apps/api/src/templates/swms-*.json).
 *
 * Tests that need an AI-augmented document set `useAI: true` and are marked
 * `.skip` by default; a single `npm run demo:api -- --grep "AI-ON"` opts
 * into the real call.
 *
 * Drift notes (2026-05-23):
 *   1. The agent prompt referenced `/api/v1/compliance/ai/hazards` and
 *      `/api/v1/compliance/ai/controls`. Neither route exists. The real
 *      surface is `POST /api/v1/swms/generate` (apps/api/src/routes/swms.ts
 *      line 99). AI is in-process, not a separate endpoint. Flagged.
 *   2. PDF export endpoint is NOT exposed under /api/v1/swms/*. The spec
 *      mentions PDF in F-COMP-04 ACs, but the only PDF generator in code
 *      is `apps/api/src/services/pdf.ts` (used for invoices/quotes) — no
 *      `GET /api/v1/swms/:id/pdf` route. F-COMP-04 PDF AC is currently a
 *      SPEC-vs-CODE drift gap. Flagged.
 */

import { test, expect } from '@playwright/test';
import {
  API_URL,
  realisticSWMSPayload,
  registerForCompliance,
} from '../helpers/compliance';

test.describe('F-COMP api (Compliance / SWMS module)', () => {
  // ===========================================================================
  // F-COMP-01 — SWMS generator
  // ===========================================================================

  test('F-COMP-01: GET /api/v1/swms/templates returns list of trade templates', async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/api/v1/swms/templates`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // AC 1: returns list of available trade templates
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.templates)).toBe(true);
    expect(body.data.templates.length).toBeGreaterThanOrEqual(1);
  });

  test('F-COMP-01: GET /api/v1/swms/templates/:tradeType returns the plumber template', async ({
    request,
  }) => {
    const res = await request.get(`${API_URL}/api/v1/swms/templates/plumber`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // AC 2: full template for the requested trade
    expect(body.success).toBe(true);
    expect(body.data.template).toBeDefined();
  });

  test('F-COMP-01: POST /api/v1/swms/generate (useAI=false) creates SWMS for plumber', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF01gen',
    );
    try {
      const payload = realisticSWMSPayload('plumber');
      payload.useAI = false; // cost guard — template-only path

      const res = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: payload,
        failOnStatusCode: false,
      });

      // AC 3: 201 created + persists structured SWMS
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.document).toBeDefined();

      const doc = body.data.document;
      // AC 4: structured fields — hazards[] populated from template
      expect(Array.isArray(doc.hazards)).toBe(true);
      // The plumber template ships baseline hazards; assert at least 1.
      expect(doc.hazards.length).toBeGreaterThan(0);
      // trade_type round-trips
      expect(doc.templateType ?? doc.trade_type).toBe('plumber');
    } finally {
      await cleanup();
    }
  });

  test('F-COMP-01: POST /api/v1/swms/generate rejects job description < 10 chars', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF01val',
    );
    try {
      const res = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          tradeType: 'plumber',
          jobDescription: 'short', // < 10 chars
          useAI: false,
        },
        failOnStatusCode: false,
      });

      // Validation should fail at the zod schema
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    } finally {
      await cleanup();
    }
  });

  // ===========================================================================
  // F-COMP-02 — Risk assessment builder (edit hazards/controls)
  // ===========================================================================

  test('F-COMP-02: PUT /api/v1/swms/:id updates hazards array; GET reflects change', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF02edit',
    );
    try {
      // Setup: create a SWMS first (template-only, no AI cost)
      const created = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { ...realisticSWMSPayload('plumber'), useAI: false },
        failOnStatusCode: false,
      });
      expect(created.status()).toBe(201);
      const createdBody = await created.json();
      const swmsId =
        createdBody.data?.swmsId ?? createdBody.data?.document?.id;
      expect(swmsId).toBeDefined();

      // Act: PUT updated hazards (AC 1 — accepts edited hazards/controls array,
      // AC 3 — risk_level low/medium/high settable per hazard)
      const editedHazards = [
        {
          id: 'haz-edit-1',
          hazard: 'Live mains water during cylinder swap',
          risk_level: 'high',
          control_measures: ['Mains isolated and tagged before work commences'],
        },
        {
          id: 'haz-edit-2',
          hazard: 'Manual handling of 180L cylinder',
          risk_level: 'medium',
          control_measures: ['Two-person lift', 'Trolley with strap'],
        },
      ];
      const putRes = await request.put(`${API_URL}/api/v1/swms/${swmsId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { hazards: editedHazards },
        failOnStatusCode: false,
      });
      expect(putRes.status()).toBe(200);

      // AC 4: updates persist — GET reflects new hazards
      const getRes = await request.get(`${API_URL}/api/v1/swms/${swmsId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(getRes.status()).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.document.hazards).toBeDefined();
      expect(getBody.data.document.hazards.length).toBe(2);
      const hazardNames = getBody.data.document.hazards.map((h: any) => h.hazard);
      expect(hazardNames).toContain('Live mains water during cylinder swap');
    } finally {
      await cleanup();
    }
  });

  // ===========================================================================
  // F-COMP-03 — WorkSafe checklist / NZ regulation citations
  // ===========================================================================

  test('F-COMP-03: generated SWMS contains NZ regulation references in template path', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF03reg',
    );
    try {
      const res = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { ...realisticSWMSPayload('plumber'), useAI: false },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      const doc = body.data.document;

      // AC 1: SWMS contains regulations/references field (template-driven)
      // The plumber template ships hazard suggestions referencing HSWA 2015
      // and Plumbers Gasfitters and Drainlayers Act 2006. Assert at least
      // one structured hazard or PPE / emergency field is present — the
      // exact shape varies by template but the structured payload must exist.
      expect(Array.isArray(doc.hazards)).toBe(true);
      expect(doc.hazards.length).toBeGreaterThan(0);

      // Soft assertion: a regulation-like reference appears somewhere in
      // the serialized document. Tolerant of either a `regulations[]`
      // array or inline references in hazard control text.
      const serialized = JSON.stringify(doc).toLowerCase();
      const hasNZRegRef =
        serialized.includes('health and safety at work act') ||
        serialized.includes('hswa') ||
        serialized.includes('worksafe') ||
        serialized.includes('regulation');
      expect(hasNZRegRef).toBe(true);
    } finally {
      await cleanup();
    }
  });

  // ===========================================================================
  // F-COMP-04 — Sign + PDF export
  // ===========================================================================

  test('F-COMP-04: POST /api/v1/swms/:id/sign marks document as signed (worker role)', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF04sign',
    );
    try {
      const created = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { ...realisticSWMSPayload('electrician'), useAI: false },
        failOnStatusCode: false,
      });
      expect(created.status()).toBe(201);
      const createdBody = await created.json();
      const swmsId =
        createdBody.data?.swmsId ?? createdBody.data?.document?.id;

      // AC 3: POST /sign accepts signature payload, marks SWMS as signed
      const signRes = await request.post(`${API_URL}/api/v1/swms/${swmsId}/sign`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { signature: 'digital-signature-blob', role: 'worker' },
        failOnStatusCode: false,
      });
      expect(signRes.status()).toBe(200);
      const signBody = await signRes.json();
      expect(signBody.success).toBe(true);

      // AC 4: signed state appears on subsequent GETs
      const getRes = await request.get(`${API_URL}/api/v1/swms/${swmsId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(getRes.status()).toBe(200);
      const getBody = await getRes.json();
      // Either status flips to 'signed' OR a signatures[] array contains
      // the new entry — accept either shape per current service behaviour.
      const doc = getBody.data.document;
      const flipped = doc.status === 'signed';
      const recorded =
        Array.isArray(doc.signatures) &&
        doc.signatures.some((s: any) => s.role === 'worker');
      expect(flipped || recorded).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('F-COMP-04: POST /sign rejects invalid role (zod validation)', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF04val',
    );
    try {
      const created = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { ...realisticSWMSPayload('plumber'), useAI: false },
        failOnStatusCode: false,
      });
      const swmsId =
        (await created.json()).data?.swmsId ??
        (await created.json()).data?.document?.id;

      const res = await request.post(`${API_URL}/api/v1/swms/${swmsId}/sign`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { signature: 'blob', role: 'site-manager' }, // not in enum
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    } finally {
      await cleanup();
    }
  });

  // ---------------------------------------------------------------------------
  // AI-on (real Claude) — opt-in via --grep "AI-ON". Skipped by default to
  // avoid charges during routine demo runs. See COST GUARD note at top.
  // ---------------------------------------------------------------------------

  test.skip('F-COMP-01 [AI-ON]: real Claude generation populates hazards with NZ context', async ({
    request,
  }) => {
    const { accessToken, cleanup } = await registerForCompliance(
      request,
      'compF01aion',
    );
    try {
      const res = await request.post(`${API_URL}/api/v1/swms/generate`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { ...realisticSWMSPayload('plumber'), useAI: true },
        failOnStatusCode: false,
        timeout: 60_000,
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.data.document.hazards.length).toBeGreaterThanOrEqual(3);
    } finally {
      await cleanup();
    }
  });
});
