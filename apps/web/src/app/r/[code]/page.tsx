'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'bb_referral_code';

/**
 * Public friend-link landing: /r/BBXXXXXX
 * Stores the code and sends the user to register (or dashboard if already signed in).
 */
export default function ReferralLandingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code || '').toUpperCase();

  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [offerCopy, setOfferCopy] = useState(
    'Give a mate a free month of BossBoard — when they pay, you both get a free month.',
  );

  useEffect(() => {
    if (!code) {
      setStatus('invalid');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/referrals/lookup/${encodeURIComponent(code)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setStatus('invalid');
          return;
        }
        try {
          localStorage.setItem(STORAGE_KEY, json.data.code);
        } catch {
          /* private mode */
        }
        setReferrerName(json.data.referrerName || null);
        if (json.data.offerCopy) setOfferCopy(json.data.offerCopy);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full space-y-4">
        <h1 className="text-xl font-bold text-gray-900">You&apos;ve been invited to BossBoard</h1>

        {status === 'loading' && (
          <p className="text-sm text-gray-600">Checking your invite…</p>
        )}

        {status === 'invalid' && (
          <>
            <p className="text-sm text-danger">
              This invite link isn&apos;t valid. Ask your mate for a fresh link from Settings →
              Invite a mate.
            </p>
            <Link href="/register">
              <Button type="button">Create an account anyway</Button>
            </Link>
          </>
        )}

        {status === 'ok' && (
          <>
            <p className="text-sm text-gray-700">
              {referrerName
                ? `${referrerName} shared BossBoard with you.`
                : 'A mate shared BossBoard with you.'}
            </p>
            <p className="text-sm text-gray-600">{offerCopy}</p>
            <p className="text-xs text-gray-500 font-mono">Code: {code}</p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                onClick={() => router.push(`/register?ref=${encodeURIComponent(code)}`)}
              >
                Create free account
              </Button>
              <Link
                href={`/login?ref=${encodeURIComponent(code)}`}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100"
              >
                I already have an account
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
