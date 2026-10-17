'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { decideInviteFlow, decideInviteError } from '@/lib/invite-flow';
import { useAuth } from '@/providers/auth-provider';
import { ApiError, teamsClient } from '@/lib/api-client';

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { user, isLoading, logout } = useAuth();
  const [message, setMessage] = useState('Loading invitation…');
  const [wrongAccount, setWrongAccount] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('');
  const started = useRef(false);
  const [loginUrl, setLoginUrl] = useState('');

  useEffect(() => {
    if (isLoading) return;
    const initial = decideInviteFlow(code, user?.email ?? null);
    if (initial.action === 'redirect') { window.location.replace(initial.loginUrl); return; }
    if (started.current) return;
    started.current = true;
    async function accept() {
      try {
        const info = await teamsClient.inviteInfo(code);
        const decision = decideInviteFlow(code, user!.email, info);
        if (decision.action === 'mismatch') {
          setWrongAccount(true);
          setMessage(decision.message);
          setLoginUrl(decision.loginUrl);
          return;
        }
        if (decision.action !== 'accept') return;
        await teamsClient.acceptInvite(code);
        window.location.assign('/teams');
      } catch (err) {
        const decision = err instanceof ApiError ? decideInviteError(code, err.code) : null;
        if (decision) {
          setMessage(decision.message);
          setVerifyUrl(decision.verificationUrl);
          return;
        }
        setMessage(err instanceof Error ? err.message : 'Unable to accept invitation. Please try again.');
      }
    }
    void accept();
  }, [code, user, isLoading]);

  return <main className="max-w-lg mx-auto p-8 space-y-4">
    <h1 className="text-2xl font-bold">Team invitation</h1>
    <p role="status">{message}</p>
    {verifyUrl && <a className="text-blue-700 underline" href={verifyUrl}>Verify your email</a>}
    {wrongAccount && <button className="text-blue-700 underline" onClick={async () => {
      try { await logout(); window.location.assign(loginUrl); }
      catch { setMessage('Unable to log out. Please try again.'); }
    }}>Switch account</button>}
  </main>;
}
