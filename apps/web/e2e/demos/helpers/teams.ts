/**
 * Per-module helpers for the Teams demo suite (F-TEAM-01..04).
 *
 * Provides:
 *   - `TEAM_PERSONAS` — Mike's Plumbing & Drainage Ltd owner/admin/worker
 *     trio so headed demos show recognisable NZ-tradie crew data.
 *   - `uniqueTeamName(purpose)` — deterministic-ish team name suffix so a
 *     fresh team gets created per test without collisions on the
 *     unique-name index.
 *   - `registerTeamOwner(request, apiUrl, purpose)` / `registerTeamMember(...)`
 *     — register an e2e-tagged ephemeral user, returning the auth tokens
 *     + a cleanup callback (relies on the existing
 *     `registerEphemeralUser` lifecycle in `helpers/test-data.ts`).
 *   - `createTeamForOwner(...)` — POST /api/v1/teams, returns the team id.
 *   - `inviteMember(...)` / `acceptInviteAs(...)` — wrap the invite
 *     accept/decline flow so demos can act as two distinct authed
 *     sessions without UI gymnastics. The 6-char invite code is captured
 *     from the API response (Resend email send is mocked at the service
 *     boundary; see `apps/api/src/services/teams.ts` — when Resend is
 *     enabled, the code in the response payload is the same one in the
 *     email body, so capturing from the response is faithful).
 *
 * Conventions match `helpers/auth.ts` and `helpers/quotes.ts` — the
 * `e2e-` tag in emails is greppable for the global teardown sweep.
 */
import type { APIRequestContext } from '@playwright/test';
import {
  testDataName,
  registerEphemeralUser,
  type EphemeralUser,
} from '../../helpers/test-data';

export const API_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:29000';

/**
 * NZ tradie crew personae used for the Teams demo. The names map onto
 * the v0.5.0 role schema (owner/admin/worker) and stay stable across
 * runs so screenshot review is deterministic.
 */
export const TEAM_PERSONAS = {
  owner: {
    name: 'Mike Tane',
    role: 'owner' as const,
    tradeType: 'plumber' as const,
    businessName: "Mike's Plumbing & Drainage Ltd",
    phone: '+64 21 555 0101',
  },
  admin: {
    name: 'Hemi Hapuku',
    role: 'admin' as const,
    tradeType: 'plumber' as const,
    businessName: "Mike's Plumbing & Drainage Ltd",
    phone: '+64 21 555 0202',
  },
  worker: {
    name: 'Sarah Walker',
    role: 'worker' as const,
    tradeType: 'plumber' as const,
    businessName: "Mike's Plumbing & Drainage Ltd",
    phone: '+64 21 555 0303',
  },
} as const;

export type TeamPersonaKey = keyof typeof TEAM_PERSONAS;

/**
 * Canonical team name for the demo. Suffixed with the test purpose hash
 * so two tests running in the same DB don't collide on uniqueness.
 *
 * The Teams service does NOT currently enforce unique team names, but
 * keeping them deterministic-per-purpose makes screenshots reproducible.
 */
export function uniqueTeamName(purpose: string): string {
  const safe = purpose.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Short hash suffix — enough to avoid collisions in a single test run,
  // not so long that it dominates the visible team name in screenshots.
  let hash = 0;
  for (let i = 0; i < purpose.length; i += 1) {
    hash = (hash * 31 + purpose.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36).slice(0, 4);
  return `Mike's Plumbing & Drainage Ltd (${safe}-${suffix})`;
}

/**
 * Register an e2e-tagged user and patch in the team-owner persona name.
 * Returns the ephemeral-user handle from `helpers/test-data.ts` so the
 * cleanup callback still works.
 *
 * NOTE: the underlying `registerEphemeralUser` posts the persona name
 * via the body's `name` field. We override the generated `E2E <purpose>
 * <date>` name with the real persona so headed demos read naturally.
 */
export async function registerTeamUser(
  request: APIRequestContext,
  apiUrl: string,
  purpose: string,
  personaKey: TeamPersonaKey,
): Promise<EphemeralUser & { personaKey: TeamPersonaKey }> {
  const persona = TEAM_PERSONAS[personaKey];
  const data = testDataName(`${purpose}-${personaKey}`);

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
      `registerTeamUser(${personaKey}): register returned ${res.status()} for ${data.email}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const accessToken = body?.data?.tokens?.accessToken;
  const refreshToken = body?.data?.tokens?.refreshToken;
  if (!accessToken) {
    throw new Error(
      `registerTeamUser(${personaKey}): no accessToken in register response`,
    );
  }

  return {
    email: data.email,
    name: persona.name,
    password: data.password,
    accessToken,
    refreshToken,
    personaKey,
    cleanup: async () => {
      try {
        await request.delete(`${apiUrl}/api/v1/auth/account`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          failOnStatusCode: false,
        });
      } catch {
        // Best-effort. Global teardown sweeps remaining e2e tags.
      }
    },
  };
}

/** Convenience wrapper — most tests want the owner. */
export async function registerTeamOwner(
  request: APIRequestContext,
  apiUrl: string,
  purpose: string,
) {
  return registerTeamUser(request, apiUrl, purpose, 'owner');
}

/**
 * POST /api/v1/teams as the given owner. Returns the team id + raw
 * response body for assertion chains.
 */
export async function createTeamForOwner(
  request: APIRequestContext,
  apiUrl: string,
  ownerToken: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await request.post(`${apiUrl}/api/v1/teams`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { name },
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(
      `createTeamForOwner: expected 201, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const team = body?.data?.team;
  if (!team?.id) {
    throw new Error(`createTeamForOwner: no team.id in response: ${JSON.stringify(body)}`);
  }
  return { id: team.id, name: team.name };
}

/**
 * POST /api/v1/teams/:teamId/invites as the owner/admin. Returns the
 * invite payload including the 6-char `inviteCode` — capture this from
 * the response (the Resend email contains the same code).
 */
export async function inviteMemberByEmail(
  request: APIRequestContext,
  apiUrl: string,
  ownerToken: string,
  teamId: string,
  inviteeEmail: string,
  role: 'admin' | 'worker' = 'worker',
): Promise<{ id: string; inviteCode: string; email: string; role: string }> {
  const res = await request.post(`${apiUrl}/api/v1/teams/${teamId}/invites`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { email: inviteeEmail, role },
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(
      `inviteMemberByEmail: expected 201, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const invite = body?.data?.invite;
  if (!invite?.inviteCode) {
    throw new Error(
      `inviteMemberByEmail: no invite.inviteCode in response: ${JSON.stringify(body)}`,
    );
  }
  return invite;
}

/**
 * POST /api/v1/teams/invites/:inviteCode/accept as the invitee.
 * Returns the resulting team membership payload.
 */
export async function acceptInviteAs(
  request: APIRequestContext,
  apiUrl: string,
  inviteeToken: string,
  inviteCode: string,
): Promise<{ team?: { id: string }; role?: string }> {
  const res = await request.post(
    `${apiUrl}/api/v1/teams/invites/${inviteCode}/accept`,
    {
      headers: { Authorization: `Bearer ${inviteeToken}` },
      failOnStatusCode: false,
    },
  );
  if (res.status() !== 200) {
    throw new Error(
      `acceptInviteAs: expected 200, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body?.data ?? {};
}

/** POST /api/v1/teams/invites/:inviteCode/decline. */
export async function declineInviteAs(
  request: APIRequestContext,
  apiUrl: string,
  inviteeToken: string,
  inviteCode: string,
): Promise<void> {
  const res = await request.post(
    `${apiUrl}/api/v1/teams/invites/${inviteCode}/decline`,
    {
      headers: { Authorization: `Bearer ${inviteeToken}` },
      failOnStatusCode: false,
    },
  );
  if (res.status() !== 200) {
    throw new Error(
      `declineInviteAs: expected 200, got ${res.status()}: ${await res.text()}`,
    );
  }
}

/** GET /api/v1/teams/my-team — convenience reader. */
export async function getMyTeam(
  request: APIRequestContext,
  apiUrl: string,
  token: string,
): Promise<{
  team: { id: string; name: string } | null;
  role: 'owner' | 'admin' | 'worker' | null;
  members: Array<{ userId: string; role: string; userName: string | null }>;
}> {
  const res = await request.get(`${apiUrl}/api/v1/teams/my-team`, {
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });
  if (res.status() !== 200) {
    throw new Error(
      `getMyTeam: expected 200, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body?.data ?? { team: null, role: null, members: [] };
}
