'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customersClient, businessProfileClient, ApiError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';

type NotesSource = 'company' | 'blank' | 'custom';

export default function NewCustomerPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [companyTemplate, setCompanyTemplate] = useState('');
  const [notesSource, setNotesSource] = useState<NotesSource>('company');
  const [paymentTerms, setPaymentTerms] = useState('20');
  const [includeGst, setIncludeGst] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { profile } = await businessProfileClient.get();
        if (cancelled) return;
        const tpl = (profile?.defaultNotes || '').trim();
        setCompanyTemplate(tpl);
        // Prefer company template for new clients when one exists
        if (tpl) {
          setNotes(tpl);
          setNotesSource('company');
          if (profile?.defaultPaymentTerms && profile.defaultPaymentTerms > 0) {
            setPaymentTerms(String(profile.defaultPaymentTerms));
          }
        } else {
          setNotesSource('blank');
        }
      } catch {
        setNotesSource('blank');
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyNotesSource = (source: NotesSource) => {
    setNotesSource(source);
    if (source === 'company') {
      setNotes(companyTemplate);
    } else if (source === 'blank') {
      setNotes('');
    }
    // custom: keep current textarea text
  };

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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes for this client
            </label>
            <select
              value={notesSource}
              onChange={(e) => applyNotesSource(e.target.value as NotesSource)}
              disabled={templateLoading}
              className="mb-2 w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="company" disabled={!companyTemplate}>
                {companyTemplate
                  ? 'Company template (Instilligent default)'
                  : 'Company template (set in Settings first)'}
              </option>
              <option value="blank">Blank</option>
              <option value="custom">Custom (edit below)</option>
            </select>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesSource('custom');
              }}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Saved on this client — used when you invoice them (or pick company template above)."
            />
            <p className="mt-1.5 text-xs text-gray-500">
              <strong>Company template</strong> is shared (Settings → Company notes).{' '}
              <strong>This client&apos;s notes</strong> are saved only for them (like Joan). Do not put
              bank numbers only here if they should appear on every invoice — use Settings bank
              details + company template. Contact fields are encrypted at rest.
            </p>
            {!companyTemplate && !templateLoading && (
              <p className="mt-1 text-xs text-amber-700">
                No company template yet.{' '}
                <Link href="/settings" className="underline text-accent">
                  Add one in Settings
                </Link>{' '}
                (thank-you + payment message), then new clients can apply it in one click.
              </p>
            )}
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
