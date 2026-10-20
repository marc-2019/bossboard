'use client';

import { useState, type FormEvent } from 'react';
import { authClient, ApiError } from '@/lib/api-client';
import { decideAuthNavigation } from '@/lib/invite-flow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function VerifyEmailPage() {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('Enter the six-digit code sent to your email.');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      try { await authClient.verifyEmail(code); }
      catch (error) {
        if (!(error instanceof ApiError && error.code === 'ALREADY_VERIFIED')) throw error;
      }
      const destination = decideAuthNavigation('verified', new URLSearchParams(window.location.search).get('redirect'), window.location.origin);
      window.location.replace(destination.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to verify email.');
    } finally { setLoading(false); }
  }

  return <Card>
    <h1 className="text-xl font-bold mb-4">Verify your email</h1>
    <p role="status">{message}</p>
    <form onSubmit={submit} className="space-y-4 mt-4">
      <Input label="Verification code" value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      <Button type="submit" disabled={loading}>Verify email</Button>
    </form>
    <button type="button" className="mt-4 underline" disabled={loading} onClick={async () => {
      setLoading(true);
      try { await authClient.resendVerification(); setMessage('A new verification code has been sent.'); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to resend code.'); }
      finally { setLoading(false); }
    }}>Resend code</button>
  </Card>;
}
