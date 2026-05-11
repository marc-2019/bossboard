'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { teamsClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import type { Team, TeamMember, TeamInvite, TeamRole } from '@bossboard/shared';
import { Users, Mail, X, LogOut, UserMinus } from 'lucide-react';

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | Date | null) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

const roleLabel: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  worker: 'Worker',
};

type MutableRole = Exclude<TeamRole, 'owner'>;

/** Map an ApiError into a friendly message. Status-aware so 403/404 read
 *  differently from a generic network failure. */
function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return err.message || "You don't have permission for that.";
    if (err.status === 404) return err.message || 'That member is no longer on the team.';
    if (err.status === 400) return err.message || fallback;
    return err.message || fallback;
  }
  // Network / proxy error.
  return 'Network error. Check your connection and try again.';
}

export default function TeamsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [team, setTeam] = useState<Team | null>(null);
  const [role, setRole] = useState<TeamRole | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('worker');
  const [inviteBusy, setInviteBusy] = useState(false);

  // Per-member action busy flags, keyed by member user id.
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const isOwner = role === 'owner';
  const isAdminOrOwner = role === 'owner' || role === 'admin';

  const load = async () => {
    try {
      const data = await teamsClient.myTeam();
      setTeam(data.team);
      setRole(data.role);
      setMembers(data.members || []);
      if (data.team && (data.role === 'owner' || data.role === 'admin')) {
        try {
          const inv = await teamsClient.listInvites(data.team.id);
          setInvites(inv.invites || []);
        } catch {
          // Non-fatal: invites panel just shows empty.
          setInvites([]);
        }
      }
    } catch (err: unknown) {
      setError(describeError(err, 'Could not load team.'));
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Banners are transient — clear after 4s so they don't linger on screen.
  useEffect(() => {
    if (!statusOk) return;
    const t = setTimeout(() => setStatusOk(null), 4000);
    return () => clearTimeout(t);
  }, [statusOk]);

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!team || !inviteEmail || inviteBusy) return;
    setInviteBusy(true);
    setError(null);
    setStatusOk(null);
    try {
      await teamsClient.invite(team.id, { email: inviteEmail, role: inviteRole });
      setStatusOk(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      // Refresh the invites list.
      const inv = await teamsClient.listInvites(team.id);
      setInvites(inv.invites || []);
    } catch (err: unknown) {
      setError(describeError(err, 'Could not send invite.'));
    } finally {
      setInviteBusy(false);
    }
  };

  const onCancelInvite = async (inviteId: string) => {
    if (!team) return;
    if (!confirm('Cancel this invite? The link will stop working immediately.')) return;
    setError(null);
    setStatusOk(null);
    try {
      await teamsClient.cancelInvite(team.id, inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setStatusOk('Invite cancelled.');
    } catch (err: unknown) {
      setError(describeError(err, 'Could not cancel invite.'));
    }
  };

  const onRemoveMember = async (member: TeamMember) => {
    if (!team) return;
    const label = member.userName || member.userEmail || 'this member';
    if (!confirm(`Remove ${label} from ${team.name}? They will lose access immediately.`)) return;
    setError(null);
    setStatusOk(null);
    setRemovingId(member.userId);
    // Optimistic removal — re-insert on failure.
    const snapshot = members;
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    try {
      await teamsClient.removeMember(team.id, member.userId);
      setStatusOk(`${label} removed from the team.`);
    } catch (err: unknown) {
      setMembers(snapshot);
      setError(describeError(err, 'Could not remove member.'));
    } finally {
      setRemovingId(null);
    }
  };

  const onChangeRole = async (member: TeamMember, newRole: MutableRole) => {
    if (!team) return;
    if (newRole === member.role) return;
    setError(null);
    setStatusOk(null);
    setRoleSavingId(member.userId);
    const snapshot = members;
    // Optimistic role swap.
    setMembers((prev) =>
      prev.map((m) => (m.userId === member.userId ? { ...m, role: newRole } : m)),
    );
    try {
      await teamsClient.updateMemberRole(team.id, member.userId, newRole);
      const label = member.userName || member.userEmail || 'Member';
      setStatusOk(`${label} is now a ${roleLabel[newRole]}.`);
    } catch (err: unknown) {
      setMembers(snapshot);
      setError(describeError(err, 'Could not update role.'));
    } finally {
      setRoleSavingId(null);
    }
  };

  const onLeaveTeam = async () => {
    if (!team || leaveBusy) return;
    if (
      !confirm(
        `Leave ${team.name}? You will lose access to team data. The owner can invite you back later.`,
      )
    ) {
      return;
    }
    setError(null);
    setStatusOk(null);
    setLeaveBusy(true);
    try {
      await teamsClient.leaveTeam(team.id);
      // Stay signed in — just clear team state and bounce to dashboard.
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(describeError(err, 'Could not leave team.'));
      setLeaveBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Team</h1>
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading team…</p>
        </Card>
      </div>
    );
  }

  if (!team) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Team</h1>
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <Users size={20} className="text-gray-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">You're not on a team yet</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              Create a team or accept a team invite from the BossBoard mobile app. Once
              you're on a team, you can manage members and send invites from this screen.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            You're a <span className="font-medium">{role ? roleLabel[role] : '—'}</span> on this team.
          </p>
        </div>
        {!isOwner && role && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onLeaveTeam}
            loading={leaveBusy}
          >
            <LogOut size={16} className="mr-2" />
            Leave team
          </Button>
        )}
      </div>

      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {statusOk && (
        <Card>
          <p className="text-sm text-success">{statusOk}</p>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">No members on this team yet.</p>
        ) : (
          <ul className="divide-y divide-border-light -mx-2">
            {members.map((m) => {
              const isSelf = currentUserId !== null && m.userId === currentUserId;
              const isTargetOwner = m.role === 'owner';
              // Who can remove this member?
              //  - Owner can remove any non-owner (except themselves).
              //  - Admin can remove workers only (not other admins or the owner).
              const canRemove =
                !isSelf &&
                !isTargetOwner &&
                (isOwner || (role === 'admin' && m.role === 'worker'));
              // Only the owner can change roles. Owner row itself is fixed.
              const canChangeRole = isOwner && !isTargetOwner && !isSelf;
              const rowBusy = removingId === m.userId || roleSavingId === m.userId;
              return (
                <li key={m.id} className="px-2 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-accent">
                      {(m.userName || m.userEmail || '?').slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.userName || m.userEmail || 'Unknown'}
                      {isSelf && <span className="text-gray-500 font-normal"> (you)</span>}
                    </p>
                    {m.userEmail && m.userName && (
                      <p className="text-xs text-gray-500 truncate">{m.userEmail}</p>
                    )}
                  </div>
                  {canChangeRole ? (
                    <select
                      value={m.role}
                      onChange={(e) => onChangeRole(m, e.target.value as MutableRole)}
                      disabled={rowBusy}
                      aria-label={`Change role for ${m.userName || m.userEmail || 'member'}`}
                      className="rounded-md border border-border px-2 py-1 text-xs bg-white shrink-0"
                    >
                      <option value="worker">Worker</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded shrink-0">
                      {roleLabel[m.role]}
                    </span>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemoveMember(m)}
                      disabled={rowBusy}
                      aria-label={`Remove ${m.userName || m.userEmail || 'member'} from team`}
                      className="text-gray-400 hover:text-danger transition-colors p-1 disabled:opacity-50"
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!isAdminOrOwner && (
          <p className="text-xs text-gray-500 mt-4">
            Only owners and admins can invite or remove members.
          </p>
        )}
        {role === 'admin' && (
          <p className="text-xs text-gray-500 mt-4">
            Admins can remove workers. Promoting and demoting members is the owner's call.
          </p>
        )}
      </Card>

      {isAdminOrOwner && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Invite a member
          </h2>
          <form onSubmit={onInvite} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <Input
                type="email"
                required
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteBusy}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                disabled={inviteBusy}
                className="rounded-lg border border-border px-3 py-2 text-sm bg-white"
              >
                <option value="worker">Worker</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={inviteBusy} variant="primary" size="md">
                <Mail size={16} className="mr-2" />
                Send invite
              </Button>
            </div>
          </form>
          <p className="text-xs text-gray-500 mt-3">
            Invited members get an email with a link to join. Workers can log time and use
            assigned features; admins can also invite and manage other members.
          </p>
        </Card>
      )}

      {isAdminOrOwner && invites.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pending invites ({invites.length})
          </h2>
          <ul className="divide-y divide-border-light -mx-2">
            {invites.map((inv) => (
              <li key={inv.id} className="px-2 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <Mail size={16} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    {roleLabel[inv.role]} · invited {formatDate(inv.createdAt)} · expires{' '}
                    {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCancelInvite(inv.id)}
                  className="text-gray-400 hover:text-danger transition-colors p-1"
                  aria-label={`Cancel invite to ${inv.email}`}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isOwner && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Transferring ownership
          </h2>
          <p className="text-sm text-gray-600">
            Owners can't leave the team or hand the keys to someone else from the web yet.
            Transfer ownership from the BossBoard mobile app, then come back here to leave
            if you need to.
          </p>
        </Card>
      )}
    </div>
  );
}
