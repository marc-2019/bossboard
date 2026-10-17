'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { safeRedirect } from '@/lib/safe-redirect';
import { useAuth } from '@/providers/auth-provider';
import { teamsClient } from '@/lib/api-client';

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [message, setMessage] = useState('Loading invitation…');
  const [wrongAccount, setWrongAccount] = useState(false);
  const started = useRef(false);
  const loginUrl = `/login?redirect=${encodeURIComponent(safeRedirect(`/invite/${encodeURIComponent(code)}`))}`;

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace(loginUrl); return; }
    if (started.current) return;
    started.current = true;
    async function accept() {
      try {
        const info = await teamsClient.inviteInfo(code);
        if (!info.matchesEmail) {
          setWrongAccount(true);
          setMessage(`This invitation to ${info.teamName} is for another account. Switch accounts to accept it.`);
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
    {wrongAccount && <button className="text-blue-700 underline" onClick={async () => {
      try { await logout(); window.location.assign(loginUrl); }
      catch { setMessage('Unable to log out. Please try again.'); }
    }}>Log out and switch account</button>}
  </main>;
}
