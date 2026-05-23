/**
 * Helpers for Module 7 — Job logs demos (F-JOB-01, F-JOB-02, F-JOB-03).
 *
 * These helpers exist so:
 *   - Web (Playwright) demos and API (Playwright `request`) demos can share
 *     the same realistic NZ-tradie payloads (no "test123" placeholders that
 *     ruin the demo framing when Marc watches headed).
 *   - Duration math (clock-in → clock-out → stats) is deterministic for
 *     assertions. Real-world clock-in uses `Date.now()` server-side; we
 *     can't freeze the server clock from a Playwright spec, but we CAN
 *     drive the math from explicit `startTime` + measured wall-clock
 *     elapse so assertions stay stable.
 *
 * Per `apps/web/e2e/helpers/test-data.ts` lifecycle directive: any user
 * created from these demos must be cleaned up. The exported helpers route
 * via `registerEphemeralUser` so the cleanup callback is wired in.
 */

import type { APIRequestContext } from '@playwright/test';

/**
 * Realistic NZ tradie job sites + descriptions. Hand-picked so the headed
 * demo reads as a credible tradie's day — no Lorem ipsum, no example.com.
 *
 * Durations are hint values (in hours) for the "scheduled" demo math —
 * actual server `endTime - startTime` comes from real wall-clock during
 * the clock-out call.
 */
export interface JobSite {
  description: string;
  siteAddress: string;
  notes: string;
  approxHours: number;
}

export const NZ_TRADIE_JOB_SITES: JobSite[] = [
  {
    description: 'Heat pump install — Mitsubishi 7.1kW',
    siteAddress: '247 Queen St, Auckland CBD',
    notes:
      'Hi-wall split, indoor on north-facing living room wall, outdoor unit on existing concrete pad. Confirmed electrical capacity with landlord.',
    approxHours: 4,
  },
  {
    description: 'Bathroom renovation — gib + waterproofing day',
    siteAddress: 'Smith Residence, 18 Hingaia Rd, Karaka',
    notes:
      'Stripped existing tile yesterday. Today: install aqualine, waterproof membrane + tile prep. Owners away until Friday.',
    approxHours: 8,
  },
  {
    description: 'Emergency leak — burst feed to chiller plant',
    siteAddress: 'Wellington Hospital, Riddiford St, Newtown',
    notes:
      'After-hours call. Isolated at riser, replaced 22mm copper section + fittings. Engineering signed off at completion.',
    approxHours: 3,
  },
  {
    description: 'Switchboard upgrade — 3-phase RCBO retrofit',
    siteAddress: 'Bakery Lane, 14 Tasman Pl, Christchurch',
    notes:
      'Replaced 1990s ceramic-fuse board with new MEN board, 12-way + 3 RCBOs. WorkSafe COC issued, photos attached.',
    approxHours: 6,
  },
  {
    description: 'Roof flashing repair — colorsteel ridge',
    siteAddress: '92 Tinakori Rd, Thorndon, Wellington',
    notes:
      'Lifted ridge cap, re-bedded with new butyl, screws renewed. Customer reported leak in last storm — pressure-tested before leaving.',
    approxHours: 2,
  },
];

/**
 * Pick a deterministic site for a given seed — same seed always returns
 * the same site, so re-running the demo produces stable assertions.
 */
export function pickJobSite(seed: number): JobSite {
  const idx = Math.abs(seed) % NZ_TRADIE_JOB_SITES.length;
  return NZ_TRADIE_JOB_SITES[idx]!;
}

/**
 * Convert hours to ms — convenience for `startTime` arithmetic.
 */
export function hoursAgoIso(hours: number, ref: Date = new Date()): string {
  return new Date(ref.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Build a create-job-log payload that the API will accept.
 * Maps to `createJobLogSchema` in apps/api/src/routes/job-logs.ts:18-24.
 */
export interface CreateJobLogPayload {
  description: string;
  siteAddress?: string;
  notes?: string;
  startTime?: string;
}

export function buildCreateJobLogPayload(
  site: JobSite,
  opts: { withStartTime?: boolean } = {},
): CreateJobLogPayload {
  const payload: CreateJobLogPayload = {
    description: site.description,
    siteAddress: site.siteAddress,
    notes: site.notes,
  };
  if (opts.withStartTime) {
    // Use a startTime ~1 minute in the past so the clock-out duration is
    // non-zero even on the fastest demo run.
    payload.startTime = hoursAgoIso(1 / 60);
  }
  return payload;
}

/**
 * API endpoint paths — single source of truth referenced from both Web
 * and API demos so a route rename only touches one place.
 *
 * Sourced from apps/api/src/routes/job-logs.ts.
 */
export const JOB_LOGS_API = {
  base: '/api/v1/job-logs',
  active: '/api/v1/job-logs/active',
  stats: '/api/v1/job-logs/stats',
  byId: (id: string) => `/api/v1/job-logs/${id}`,
  clockOut: (id: string) => `/api/v1/job-logs/${id}/clock-out`,
} as const;

/**
 * Clock-in helper — POSTs to the API and returns the created job log.
 * Caller is responsible for clock-out / cleanup.
 */
export async function clockInViaApi(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
  payload: CreateJobLogPayload,
): Promise<{ id: string; status: string; description: string }> {
  const res = await request.post(`${apiUrl}${JOB_LOGS_API.base}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: payload,
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(
      `clockInViaApi: expected 201, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body?.data?.jobLog;
}

/**
 * Clock-out helper — POSTs to /:id/clock-out and returns the updated log.
 */
export async function clockOutViaApi(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
  jobLogId: string,
  notes?: string,
): Promise<{ id: string; status: string; endTime?: string }> {
  const res = await request.post(`${apiUrl}${JOB_LOGS_API.clockOut(jobLogId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: notes ? { notes } : {},
    failOnStatusCode: false,
  });
  if (res.status() !== 200) {
    throw new Error(
      `clockOutViaApi: expected 200, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body?.data?.jobLog;
}
