'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customersClient, ApiError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [includeGst, setIncludeGst] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    customersClient
      .get(id)
      .then((data) => {
        if (cancelled) return;
        const c = data.customer;
        setName(c.name || '');
        setEmail(c.email || '');
        setPhone(c.phone || '');
        setAddress(c.address || '');
        setNotes(c.notes || '');
        setPaymentTerms(
          c.defaultPaymentTerms != null ? String(c.defaultPaymentTerms) : '',
        );
        setIncludeGst(c.defaultIncludeGst !== false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load client.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
      await customersClient.update(id, {
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
      setError(err instanceof ApiError ? err.message : 'Could not save client.');
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this client? They will leave your active list.')) return;
    setDeleting(true);
    setError(null);
    try {
      await customersClient.remove(id);
      router.push('/customers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not deactivate client.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-gray-500 py-8 text-center">Loading client…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={14} />
        Back to clients
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Edit client</h1>
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
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
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
            />
          </div>
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={submitting}>
            Save changes
          </Button>
          <Link
            href="/customers"
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </Link>
          <Button
            type="button"
            variant="ghost"
            loading={deleting}
            onClick={handleDeactivate}
            className="text-danger ml-auto"
          >
            Deactivate
          </Button>
        </div>
      </form>
    </div>
  );
}
