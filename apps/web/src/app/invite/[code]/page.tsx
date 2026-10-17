'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { teamsClient } from '@/lib/api-client';

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [message, setMessage] = useState('Loading invitation…');
  const [invitedEmail, setInvitedEmail] = useState('');
  const started = useRef(false);
  const loginUrl = `/login?redirect=${encodeURIComponent(`/invite/${code}`)}`;

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace(loginUrl); return; }
    if (started.current) return;
    started.current = true;
    async function accept() {
      try {
        const info = await teamsClient.inviteInfo(code);
        if (info.email.toLowerCase() !== user!.email.toLowerCase()) {
          setInvitedEmail(info.email);
          setMessage(`This invitation to ${info.teamName} was sent to ${info.email}. You are signed in as ${user!.email}. Switch accounts to accept it.`);
          return;
        }
        if (info.status !== 'pending') {
          setMessage(info.status === 'expired' ? 'This invitation has expired. Ask the team administrator for a new invitation.' : 'This invitation has already been accepted.');
          return;
        }
        await teamsClient.acceptInvite(code);
        window.location.assign('/teams');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to accept invitation. Please try again.');
      }
    }
    void accept();
  }, [code, user, isLoading, router, loginUrl]);

  return <main className="max-w-lg mx-auto p-8 space-y-4">
    <h1 className="text-2xl font-bold">Team invitation</h1>
    <p role="status">{message}</p>
    {invitedEmail && <button className="text-blue-700 underline" onClick={async () => {
      try { await logout(); window.location.assign(loginUrl); }
      catch { setMessage('Unable to log out. Please try again.'); }
    }}>Log out and switch account</button>}
  </main>;
}
