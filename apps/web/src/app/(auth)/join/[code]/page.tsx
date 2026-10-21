'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type InvitePreview = {
  teamName: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired';
};

export default function JoinTeamPage() {
  const params = useParams<{ code: string }>();
  const code = params.code || '';
  const { user, isLoading } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/join/${encodeURIComponent(code)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.message || 'This invite link is not valid.');
          return;
        }
        setInvite(json.data.invite as InvitePreview);
      } catch {
        if (!cancelled) setError('Could not open this invite.');
      }
    }
    if (code) load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!invite || !user?.email || joined || joining) return;
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) return;
    if (invite.status === 'expired') return;
    void accept();
    // accept is stable enough for this page; it depends on code and invite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, user, joined, joining]);

  async function accept() {
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(code)}/accept`, { method: 'POST' });
      const json = await res.json();
      if (res.ok || json.error === 'INVITE_ALREADY_ACCEPTED') {
        setJoined(true);
        window.location.assign('/dashboard');
        return;
      }
      setError(json.message || 'Could not join the team.');
    } catch {
      setError('Could not join the team.');
    } finally {
      setJoining(false);
    }
  }

  const registerHref = invite
    ? `/register?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(code)}`
    : '/register';
  const loginHref = invite
    ? `/login?email=${encodeURIComponent(invite.email)}&redirect=${encodeURIComponent(`/join/${code}`)}`
    : `/login?redirect=${encodeURIComponent(`/join/${code}`)}`;
  const sameEmail = Boolean(
    user?.email && invite && user.email.toLowerCase() === invite.email.toLowerCase()
  );

  return (
    <Card>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Join a team</h1>
      {!invite && !error && <p className="text-sm text-gray-500">Opening your invite…</p>}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger-light text-danger text-sm">{error}</div>
      )}
      {invite && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            You are invited to <strong>{invite.teamName}</strong> as a {invite.role}.
          </p>
          {invite.status === 'expired' && (
            <p className="text-sm text-gray-700">This invite has expired. Ask the team owner to send a new one.</p>
          )}
          {invite.status === 'accepted' && (
            <p className="text-sm text-gray-700">This invite is already accepted. Sign in to open BossBoard.</p>
          )}
          {invite.status === 'pending' && (
            <p className="text-sm text-gray-700">
              Use <strong>{invite.email}</strong>. A different address will not join this team.
            </p>
          )}
          {!isLoading && !user && invite.status !== 'expired' && (
            <div className="space-y-3">
              <Link href={registerHref} className="block">
                <Button className="w-full">Create account</Button>
              </Link>
              <Link href={loginHref} className="block text-center text-sm text-accent font-medium">
                I already have an account
              </Link>
            </div>
          )}
          {!isLoading && user && !sameEmail && invite.status === 'pending' && (
            <p className="text-sm text-gray-700">
              You are signed in as {user.email}. Sign out and use {invite.email}.
            </p>
          )}
          {sameEmail && joining && <p className="text-sm text-gray-500">Adding you to the team…</p>}
        </div>
      )}
    </Card>
  );
}
