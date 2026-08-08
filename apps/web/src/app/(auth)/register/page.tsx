'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const REF_STORAGE_KEY = 'bb_referral_code';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const fromQuery = qs.get('ref') || qs.get('referral');
      if (fromQuery) {
        setReferralCode(fromQuery.toUpperCase());
        localStorage.setItem(REF_STORAGE_KEY, fromQuery.toUpperCase());
        return;
      }
      const stored = localStorage.getItem(REF_STORAGE_KEY);
      if (stored) setReferralCode(stored.toUpperCase());
    } catch {
      /* ignore */
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register({
        email,
        password,
        name: name || undefined,
        referralCode: referralCode.trim() || undefined,
      });
      try {
        localStorage.removeItem(REF_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Create your account</h1>

      {referralCode && (
        <div className="mb-4 p-3 rounded-lg bg-accent/10 text-sm text-gray-800">
          Friend invite code <span className="font-mono font-semibold">{referralCode}</span> will
          apply — when you subscribe, you and your mate both get a free month.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger-light text-danger text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          required
          minLength={8}
        />
        <Input
          label="Friend code (optional)"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
          placeholder="e.g. BBABC123"
        />
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-4 text-sm text-center text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-accent font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
