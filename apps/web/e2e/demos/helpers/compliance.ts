/**
 * Compliance (SWMS) demo helpers.
 *
 * Inputs to the BossBoard SWMS module:
 *   - tradeType: 'electrician' | 'plumber' | 'builder' | 'landscaper' | 'painter' | 'other'
 *   - jobDescription: realistic NZ tradie job (>= 10 chars)
 *   - siteAddress, clientName, expectedDuration: realistic NZ context
 *   - useAI: boolean — true hits Claude (or LM Studio); false uses template only
 *
 * Real Claude calls cost ~$0.01 per SWMS generation. Per the parent plan
 * (Phase 3 cost guard: "limit to 2 calls max for the full test run"), this
 * helper provides:
 *   1. `realisticSWMSPayload(tradeType)` — plausible payloads for demo/headed runs
 *   2. `mockClaudeRoute(page)` — Playwright page.route() interceptor that
 *      stubs the Claude-backed `/api/v1/swms/generate` response with a
 *      canned realistic body (plumber/electrician). Use this in WEB demos so
 *      headed-Playwright runs never actually invoke Claude.
 *
 * TODO(mock-server-fixture): Pull the canned SWMS bodies into a JSON
 * fixture under `apps/web/e2e/demos/fixtures/swms/` once we have ≥3 trade
 * variants. Inline-literal is fine for the first pass.
 *
 * Drift note (2026-05-23, author Phase 3 Agent 2):
 *   The agent prompt referenced mocking `/api/v1/compliance/ai/hazards` and
 *   `/api/v1/compliance/ai/controls`. Neither route exists in the codebase.
 *   The actual surface is `POST /api/v1/swms/generate` (see
 *   apps/api/src/routes/swms.ts:99). AI hazard/control generation happens
 *   inline inside swms.service via apps/api/src/services/claude.ts — there
 *   is no separate compliance/ai/* prefix. This helper mocks the real
 *   route. Flagged for Phase 4 EXECUTIVE_GAP_REPORT.md.
 */

import type { Page, APIRequestContext } from '@playwright/test';
import { testDataName, type TestData } from '../../helpers/test-data';

export const API_URL = process.env.API_URL || 'http://localhost:29000';

export type TradeType =
  | 'electrician'
  | 'plumber'
  | 'builder'
  | 'landscaper'
  | 'painter'
  | 'other';

export interface SWMSPayload {
  tradeType: TradeType;
  jobDescription: string;
  siteAddress?: string;
  clientName?: string;
  expectedDuration?: string;
  useAI?: boolean;
}

/**
 * Realistic NZ tradie SWMS payloads keyed by trade. Plumber/electrician/builder
 * are the three trades the API ships templates for; other trades fall back to
 * the generic SWMS builder.
 */
export function realisticSWMSPayload(trade: TradeType): SWMSPayload {
  switch (trade) {
    case 'plumber':
      return {
        tradeType: 'plumber',
        jobDescription:
          'Replace failed hot water cylinder in residential ceiling cavity. Drain existing unit, isolate mains, remove via roof access, install new 180L cylinder with new tempering valve and PRV. Confined space entry above ceiling joists.',
        siteAddress: '42 Williamson Ave, Grey Lynn, Auckland 1021',
        clientName: 'Smith Residence',
        expectedDuration: '1 day',
        useAI: true,
      };
    case 'electrician':
      return {
        tradeType: 'electrician',
        jobDescription:
          'Install 3-phase distribution board at commercial site. Existing 1-phase board to be replaced with new 100A 3-phase TPN main switchboard. Live electrical work near energised mains; working at heights >2m on platform ladder.',
        siteAddress: '12 Te Apunga Place, Mt Wellington, Auckland 1060',
        clientName: 'Auckland Council Workshops',
        expectedDuration: '3 days',
        useAI: true,
      };
    case 'builder':
      return {
        tradeType: 'builder',
        jobDescription:
          'Frame and clad a 30m2 single-storey rear extension. Working at heights up to 3.2m on the roof. Power tools (skilsaw, nail gun) operating near other trades. Site adjacent to neighbour boundary.',
        siteAddress: '8 Karaka Bay Rd, Glendowie, Auckland 1071',
        clientName: 'Te Whanau Whānau Trust',
        expectedDuration: '5 days',
        useAI: true,
      };
    default:
      return {
        tradeType: trade,
        jobDescription:
          'General trade work at residential site. Standard hazards include working with hand tools, manual handling, and site traffic management.',
        siteAddress: '15 Onepu Road, Lyall Bay, Wellington 6022',
        clientName: 'Mike from Mike\'s Plumbing',
        expectedDuration: '1 day',
        useAI: true,
      };
  }
}

/**
 * Canned SWMS response body for a plumber-trade generation. Mirrors what
 * the real `swmsService.generateSWMS()` returns (see apps/api/src/services/
 * swms.ts) after Claude has been called. Used by `mockClaudeRoute()` to
 * avoid real Claude API spend during web demos.
 *
 * Hazards intentionally include: working at heights, confined space, live
 * services — the canonical plumber risk set per NZ HSWA 2015.
 */
export function cannedSWMSBody(trade: TradeType) {
  const hazardSets: Record<string, unknown[]> = {
    plumber: [
      {
        id: 'haz-1',
        hazard: 'Working at heights >2m (ceiling cavity / roof access)',
        risk_level: 'high',
        control_measures: [
          'Use a platform ladder with three points of contact',
          'Roof harness when traversing the roof',
          'Spotter at base of ladder',
        ],
      },
      {
        id: 'haz-2',
        hazard: 'Confined space entry above ceiling joists',
        risk_level: 'high',
        control_measures: [
          'Pre-entry atmospheric test for gas/dust',
          'Two-person work — no solo confined entry',
          'Maintain communication via radio',
        ],
      },
      {
        id: 'haz-3',
        hazard: 'Scalding risk from residual hot water',
        risk_level: 'medium',
        control_measures: [
          'Isolate at the mains and drain to safe temperature before removal',
          'Wear long-sleeved heat-resistant PPE',
        ],
      },
    ],
    electrician: [
      {
        id: 'haz-1',
        hazard: 'Live electrical work near energised mains',
        risk_level: 'high',
        control_measures: [
          'Lock-out tag-out before commencing work',
          'Test-for-dead with two-pole tester',
          'Class 0 insulated gloves',
        ],
      },
      {
        id: 'haz-2',
        hazard: 'Working at heights >2m on platform ladder',
        risk_level: 'medium',
        control_measures: [
          'Platform ladder rated for the load',
          'Three points of contact at all times',
          'Spotter at base of ladder',
        ],
      },
    ],
    builder: [
      {
        id: 'haz-1',
        hazard: 'Working at heights up to 3.2m on the roof',
        risk_level: 'high',
        control_measures: [
          'Edge protection rails installed before roof access',
          'Roof harness with anchor point',
        ],
      },
    ],
  };

  return {
    success: true,
    message: 'SWMS document generated successfully',
    data: {
      swmsId: `swms-${trade}-${Date.now()}`,
      document: {
        id: `swms-${trade}-${Date.now()}`,
        title: `${trade.charAt(0).toUpperCase() + trade.slice(1)} SWMS — Auto-generated`,
        templateType: trade,
        trade_type: trade,
        status: 'draft',
        hazards: hazardSets[trade] ?? hazardSets.plumber,
        controls: (hazardSets[trade] ?? hazardSets.plumber).flatMap(
          (h: any) => h.control_measures,
        ),
        regulations: [
          'Health and Safety at Work Act 2015 — Section 36 (Primary duty of care)',
          'Health and Safety at Work (General Risk and Workplace Management) Regulations 2016',
          'WorkSafe NZ — Working at Heights Best Practice Guidelines',
        ],
        ppe_required: ['Hard hat', 'Steel-cap boots', 'Hi-vis vest', 'Safety glasses'],
        emergency_plan:
          'Emergency contact: 111. Site lead first-aider Sarah (027 555 0142). Nearest hospital: Auckland City 2.4km.',
        isolation_procedure:
          'All services isolated and tagged before commencement. Tags signed off by site lead.',
        job_description: realisticSWMSPayload(trade).jobDescription,
        site_address: realisticSWMSPayload(trade).siteAddress,
        client_name: realisticSWMSPayload(trade).clientName,
        expected_duration: realisticSWMSPayload(trade).expectedDuration,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    },
  };
}

/**
 * Install Playwright route handlers that intercept calls to the Claude-backed
 * SWMS generation endpoint and the SWMS list/detail endpoints, returning
 * canned bodies. Use this in WEB demos to avoid real Claude spend.
 *
 * Call BEFORE `page.goto()`:
 *   await mockClaudeRoute(page, 'plumber');
 *   await page.goto('/swms');
 */
export async function mockClaudeRoute(page: Page, trade: TradeType = 'plumber') {
  const canned = cannedSWMSBody(trade);

  // Intercept the next.js-proxied path AND the direct API path so the mock
  // works whether the web app proxies or the test hits the API directly.
  const patterns = [
    /\/api\/v1\/swms\/generate/,
    /\/api\/swms\/generate/,
  ];
  for (const p of patterns) {
    await page.route(p, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(canned),
      });
    });
  }

  // List endpoint returns the canned doc as the only item so the
  // mobile-first /swms page in web has something to show.
  const listPatterns = [
    /\/api\/v1\/swms(\?|$)/,
    /\/api\/swms(\?|$)/,
  ];
  for (const p of listPatterns) {
    await page.route(p, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { documents: [canned.data.document], total: 1 },
        }),
      });
    });
  }
}

/**
 * Register an ephemeral user purely via API, return access token + cleanup.
 * Used by API-only demos that don't need a browser session.
 */
export async function registerForCompliance(
  request: APIRequestContext,
  purpose = 'compliance',
): Promise<{ data: TestData; accessToken: string; cleanup: () => Promise<void> }> {
  const data = testDataName(purpose);
  const res = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { email: data.email, password: data.password, name: data.name },
    failOnStatusCode: false,
  });
  if (res.status() !== 200 && res.status() !== 201) {
    throw new Error(
      `registerForCompliance: register returned ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const accessToken =
    body?.data?.tokens?.accessToken ?? body?.access_token ?? body?.accessToken;
  if (!accessToken) {
    throw new Error('registerForCompliance: no access token in response');
  }
  return {
    data,
    accessToken,
    cleanup: async () => {
      try {
        await request.delete(`${API_URL}/api/v1/auth/account`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          failOnStatusCode: false,
        });
      } catch {
        // best-effort
      }
    },
  };
}
