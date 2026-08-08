'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customersClient, ApiError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';

export default function NewCustomerPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('20');
  const [includeGst, setIncludeGst] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Client name is required.');
      return;
    }
    const terms = paymentTerms.trim() ? parseInt(paymentTerms, 10) : undefined;
    if (terms !== undefined && (!Number.isFinite(terms) || terms < 1 || terms > 365)) {
      setError('Payment terms must be between 1 and 365 days.');
      return;
    }

    setSubmitting(true);
    try {
      await customersClient.create({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        defaultPaymentTerms: terms,
        defaultIncludeGst: includeGst,
      });
      router.push('/customers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create client.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={14} />
        Back to clients
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">New client</h1>
      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="Smith Construction Ltd"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="accounts@example.com"
          />
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="021 123 4567"
          />
          <Input
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Optional"
          />
          <Input
            label="Default payment terms (days)"
            type="number"
            min={1}
            max={365}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeGst}
              onChange={(e) => setIncludeGst(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-accent"
            />
            Default: include 15% GST on invoices
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Optional"
            />
          </div>
        </Card>
        <div className="flex gap-3">
          <Button type="submit" loading={submitting}>
            Save client
          </Button>
          <Link
            href="/customers"
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
