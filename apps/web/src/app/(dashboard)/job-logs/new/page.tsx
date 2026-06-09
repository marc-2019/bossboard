'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jobLogsClient, ApiError, type CreateJobLogInput } from '@/lib/api-client';
import { ArrowLeft, Clock } from 'lucide-react';

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFmt = new Intl.DateTimeFormat('en-NZ', {
  hour: '2-digit',
  minute: '2-digit',
});

export default function NewJobLogPage() {
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError('Job description is required.');
      return;
    }

    const payload: CreateJobLogInput = {
      description: trimmedDescription,
    };
    if (siteAddress.trim()) payload.siteAddress = siteAddress.trim();
    if (notes.trim()) payload.notes = notes.trim();

    setSubmitting(true);
    try {
      await jobLogsClient.create(payload);
      router.push('/job-logs');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not clock in.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/job-logs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to job logs
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Clock in</h1>

      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="flex flex-col items-center text-center py-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-3">
              <Clock size={26} className="text-emerald-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">{timeFmt.format(now)}</p>
            <p className="text-sm text-gray-500 mt-1">{dateFmt.format(now)}</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <Input
              label="Job description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Bathroom renovation, Wiring install"
              maxLength={500}
              required
              autoFocus
            />
            <Input
              label="Site address (optional)"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="e.g. 42 Queen St, Auckland"
              maxLength={500}
            />
            <div className="space-y-1">
              <label
                htmlFor="job-log-notes"
                className="block text-sm font-medium text-gray-700"
              >
                Notes (optional)
              </label>
              <textarea
                id="job-log-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details about this job…"
                rows={3}
                maxLength={2000}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
              />
            </div>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={submitting}>
            <Clock size={16} className="mr-1.5" />
            Clock in
          </Button>
          <Link
            href="/job-logs"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </Link>
        </div>

        <p className="text-xs text-gray-500">
          Clocking in starts the timer now. You can clock out from the job logs list when
          you&apos;re done on site.
        </p>
      </form>
    </div>
  );
}
