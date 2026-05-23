/**
 * F-TEAM (Teams module) web demos — Phase 3 Agent 9.
 *
 * Coverage cells:
 *   - F-TEAM-01 create team (owner)
 *   - F-TEAM-02 invite member (6-char invite code via email)
 *   - F-TEAM-03 accept/decline invite (2-user fixture)
 *   - F-TEAM-04 member role management (owner/admin/worker) + leave
 *
 * Strategy: each test sets up a fresh owner (and where relevant a fresh
 * invitee) via the API helpers in `helpers/teams.ts`, drives the
 * `/teams` web page in a headed browser to make the demo visually
 * credible, and asserts one expectation per acceptance criterion.
 *
 * Cleanup: every persona is registered as an e2e-tagged user
 * (`registerTeamUser`) and torn down in `afterEach` via the cleanup
 * callback — falling back to the global teardown sweep if a test
 * crashes mid-flight.
 *
 * Realism: team name "Mike's Plumbing & Drainage Ltd" (suffixed for
 * uniqueness), member personae Mike Tane / Hemi Hapuku / Sarah Walker.
 *
 * NO-EXECUTION caveat (2026-05-23): dev env not running while these
 * specs were authored. Verified via `npx playwright test --list` only;
 * assertion realism reviewed against `apps/web/src/app/(dashboard)/teams/page.tsx`.
 */
import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  TEAM_PERSONAS,
  uniqueTeamName,
  registerTeamUser,
  createTeamForOwner,
  inviteMemberByEmail,
  acceptInviteAs,
  declineInviteAs,
  getMyTeam,
} from './helpers/teams';
import type { EphemeralUser } from '../helpers/test-data';

// ---------------------------------------------------------------------------
// Per-test fixtures we track for cleanup
// ---------------------------------------------------------------------------

type TornDown = EphemeralUser[];

async function tearDownAll(users: TornDown): Promise<void> {
  await Promise.allSettled(users.map((u) => u.cleanup()));
}

// ---------------------------------------------------------------------------
// Web sign-in helper — populates localStorage tokens the same way the
// app's auth provider does after a successful login. Cheaper than
// driving the /login form for every test.
// ---------------------------------------------------------------------------
async function signInViaTokens(
  page: import('@playwright/test').Page,
  user: EphemeralUser,
): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ accessToken, refreshToken, email, name }) => {
      // The web app's auth provider reads these from localStorage at
      // mount. Keys mirror `apps/web/src/providers/auth-provider.tsx`.
      try {
        localStorage.setItem('bb_access_token', accessToken);
        localStorage.setItem('bb_refresh_token', refreshToken);
        localStorage.setItem(
          'bb_user',
          JSON.stringify({ email, name }),
        );
      } catch {
        // Storage may not be available on first nav — caller retries via reload.
      }
    },
    {
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      email: user.email,
      name: user.name,
    },
  );
}

test.describe('F-TEAM (Teams module)', () => {
  const teardown: TornDown = [];

  test.afterEach(async () => {
    await tearDownAll(teardown);
    teardown.length = 0;
  });

  test('F-TEAM-01: owner creates team via API, web shows team header (W + A)', async ({
    page,
    request,
  }) => {
    // AC1: POST /api/v1/teams creates a team owned by caller.
    const owner = await registerTeamUser(
      request,
      API_BASE_URL,
      'team01-create',
      'owner',
    );
    teardown.push(owner);

    const name = uniqueTeamName('team01-create');
    const team = await createTeamForOwner(
      request,
      API_BASE_URL,
      owner.accessToken,
      name,
    );
    expect(team.id).toMatch(/.+/);
    expect(team.name).toBe(name);

    // AC3: GET /my-team returns the user's team + owner role.
    const myTeam = await getMyTeam(request, API_BASE_URL, owner.accessToken);
    expect(myTeam.team?.id).toBe(team.id);
    expect(myTeam.role).toBe('owner');

    // Web surface: sign in and view /teams. Should render the team
    // name as the page heading and "You're an Owner on this team."
    await signInViaTokens(page, owner);
    await page.goto('/teams');
    await expect(page.getByRole('heading', { name })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/You're a\s+Owner on this team/i)).toBeVisible();
  });

  test('F-TEAM-02: owner invites worker — 6-char invite code in API response, pending invite visible on web (W + A)', async ({
    page,
    request,
  }) => {
    const owner = await registerTeamUser(
      request,
      API_BASE_URL,
      'team02-invite',
      'owner',
    );
    teardown.push(owner);
    // Pre-create the invitee account so the invite has a target inbox
    // shape — but we do NOT auto-link them; the join happens via accept.
    const worker = await registerTeamUser(
      request,
      API_BASE_URL,
      'team02-invite',
      'worker',
    );
    teardown.push(worker);

    const name = uniqueTeamName('team02-invite');
    const team = await createTeamForOwner(
      request,
      API_BASE_URL,
      owner.accessToken,
      name,
    );

    // AC1 + AC3: invite returns a 6-char invite code; email dispatch is
    // mocked at the Resend boundary (see services/teams.ts). We capture
    // the code from the response body — same value the email contains.
    const invite = await inviteMemberByEmail(
      request,
      API_BASE_URL,
      owner.accessToken,
      team.id,
      worker.email,
      'worker',
    );
    expect(invite.email).toBe(worker.email);
    expect(invite.role).toBe('worker');
    expect(invite.inviteCode).toMatch(/^[A-Z0-9]{6}$/i);

    // AC4: GET /:teamId/invites lists the pending invite.
    const listRes = await request.get(
      `${API_BASE_URL}/api/v1/teams/${team.id}/invites`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.invites).toHaveLength(1);
    expect(listBody.data.invites[0].email).toBe(worker.email);

    // Web surface: owner sees the "Pending invites" panel with the email.
    await signInViaTokens(page, owner);
    await page.goto('/teams');
    await expect(page.getByText(/Pending invites/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(worker.email)).toBeVisible();
  });

  test('F-TEAM-03: invitee accepts via API, owner sees them in members list (W + A, 2-user fixture)', async ({
    page,
    request,
  }) => {
    const owner = await registerTeamUser(
      request,
      API_BASE_URL,
      'team03-accept',
      'owner',
    );
    teardown.push(owner);
    const worker = await registerTeamUser(
      request,
      API_BASE_URL,
      'team03-accept',
      'worker',
    );
    teardown.push(worker);

    const name = uniqueTeamName('team03-accept');
    const team = await createTeamForOwner(
      request,
      API_BASE_URL,
      owner.accessToken,
      name,
    );
    const invite = await inviteMemberByEmail(
      request,
      API_BASE_URL,
      owner.accessToken,
      team.id,
      worker.email,
      'worker',
    );

    // AC1: invitee can list their pending invites.
    const pendingRes = await request.get(
      `${API_BASE_URL}/api/v1/teams/invites/pending`,
      { headers: { Authorization: `Bearer ${worker.accessToken}` } },
    );
    expect(pendingRes.status()).toBe(200);
    const pendingBody = await pendingRes.json();
    expect(pendingBody.data.invites.some((i: { inviteCode: string }) => i.inviteCode === invite.inviteCode)).toBe(true);

    // AC2 + AC4: accept transitions the user to a member of the team.
    const accepted = await acceptInviteAs(
      request,
      API_BASE_URL,
      worker.accessToken,
      invite.inviteCode,
    );
    expect(accepted.team?.id).toBe(team.id);
    expect(accepted.role).toBe('worker');

    // Owner-side: my-team now shows two members.
    const ownerView = await getMyTeam(
      request,
      API_BASE_URL,
      owner.accessToken,
    );
    expect(ownerView.members).toHaveLength(2);
    const ownerSeesWorker = ownerView.members.some(
      (m) => m.userName === TEAM_PERSONAS.worker.name && m.role === 'worker',
    );
    expect(ownerSeesWorker).toBe(true);

    // Web surface: owner views /teams and sees Sarah Walker in members.
    await signInViaTokens(page, owner);
    await page.goto('/teams');
    await expect(
      page.getByText(TEAM_PERSONAS.worker.name),
    ).toBeVisible({ timeout: 10000 });
  });

  test('F-TEAM-03b: invitee declines via API — invite disappears from owner pending list (A)', async ({
    request,
  }) => {
    const owner = await registerTeamUser(
      request,
      API_BASE_URL,
      'team03b-decline',
      'owner',
    );
    teardown.push(owner);
    const worker = await registerTeamUser(
      request,
      API_BASE_URL,
      'team03b-decline',
      'worker',
    );
    teardown.push(worker);

    const name = uniqueTeamName('team03b-decline');
    const team = await createTeamForOwner(
      request,
      API_BASE_URL,
      owner.accessToken,
      name,
    );
    const invite = await inviteMemberByEmail(
      request,
      API_BASE_URL,
      owner.accessToken,
      team.id,
      worker.email,
      'worker',
    );

    // AC3: decline succeeds.
    await declineInviteAs(
      request,
      API_BASE_URL,
      worker.accessToken,
      invite.inviteCode,
    );

    // Owner pending invites list should no longer contain this email
    // with a status of "pending" (declined moves it out of pending).
    const listRes = await request.get(
      `${API_BASE_URL}/api/v1/teams/${team.id}/invites`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const stillPending = (listBody.data.invites || []).some(
      (i: { email: string; inviteCode: string }) =>
        i.email === worker.email && i.inviteCode === invite.inviteCode,
    );
    expect(stillPending).toBe(false);
  });

  test('F-TEAM-04: owner promotes worker to admin, then admin worker leaves (W + A)', async ({
    page,
    request,
  }) => {
    const owner = await registerTeamUser(
      request,
      API_BASE_URL,
      'team04-roles',
      'owner',
    );
    teardown.push(owner);
    const worker = await registerTeamUser(
      request,
      API_BASE_URL,
      'team04-roles',
      'worker',
    );
    teardown.push(worker);

    const name = uniqueTeamName('team04-roles');
    const team = await createTeamForOwner(
      request,
      API_BASE_URL,
      owner.accessToken,
      name,
    );
    const invite = await inviteMemberByEmail(
      request,
      API_BASE_URL,
      owner.accessToken,
      team.id,
      worker.email,
      'worker',
    );
    await acceptInviteAs(
      request,
      API_BASE_URL,
      worker.accessToken,
      invite.inviteCode,
    );

    // AC1: GET members lists both with their roles.
    const membersRes = await request.get(
      `${API_BASE_URL}/api/v1/teams/${team.id}/members`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(membersRes.status()).toBe(200);
    const membersBody = await membersRes.json();
    expect(membersBody.data.members).toHaveLength(2);

    // Find the worker member's id for the role update.
    const workerMember = membersBody.data.members.find(
      (m: { role: string }) => m.role === 'worker',
    );
    expect(workerMember).toBeDefined();

    // AC2: owner promotes worker → admin.
    const promoteRes = await request.put(
      `${API_BASE_URL}/api/v1/teams/${team.id}/members/${workerMember.userId}/role`,
      {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
        data: { role: 'admin' },
      },
    );
    expect(promoteRes.status()).toBe(200);
    const promoteBody = await promoteRes.json();
    expect(promoteBody.data.member.role).toBe('admin');

    // AC4: non-owner can leave the team.
    const leaveRes = await request.post(
      `${API_BASE_URL}/api/v1/teams/${team.id}/leave`,
      { headers: { Authorization: `Bearer ${worker.accessToken}` } },
    );
    expect(leaveRes.status()).toBe(200);

    // After leave, the worker no longer has a team.
    const postLeave = await getMyTeam(
      request,
      API_BASE_URL,
      worker.accessToken,
    );
    expect(postLeave.team).toBeNull();

    // Web surface: owner sees only themselves remaining.
    await signInViaTokens(page, owner);
    await page.goto('/teams');
    await expect(page.getByText(/Members \(1\)/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('F-TEAM-04b: invalid role value is rejected with VALIDATION_ERROR (A)', async ({
    request,
  }) => {
    const owner = await registerTeamUser(
      request,
      API_BASE_URL,
      'team04b-invalid-role',
      'owner',
    );
    teardown.push(owner);
    const worker = await registerTeamUser(
      request,
      API_BASE_URL,
      'team04b-invalid-role',
      'worker',
    );
    teardown.push(worker);

    const team = await createTeamForOwner(
      request,
      API_BASE_URL,
      owner.accessToken,
      uniqueTeamName('team04b-invalid-role'),
    );
    const invite = await inviteMemberByEmail(
      request,
      API_BASE_URL,
      owner.accessToken,
      team.id,
      worker.email,
      'worker',
    );
    await acceptInviteAs(
      request,
      API_BASE_URL,
      worker.accessToken,
      invite.inviteCode,
    );

    const membersRes = await request.get(
      `${API_BASE_URL}/api/v1/teams/${team.id}/members`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    const workerMember = (await membersRes.json()).data.members.find(
      (m: { role: string }) => m.role === 'worker',
    );

    const badRoleRes = await request.put(
      `${API_BASE_URL}/api/v1/teams/${team.id}/members/${workerMember.userId}/role`,
      {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
        data: { role: 'superadmin' },
      },
    );
    expect(badRoleRes.status()).toBe(400);
    const badBody = await badRoleRes.json();
    expect(badBody.error).toBe('VALIDATION_ERROR');
  });
});
