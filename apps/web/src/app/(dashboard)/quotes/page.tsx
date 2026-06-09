'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { quotesClient, ApiError } from '@/lib/api-client';
import type { Quote } from '@bossboard/shared';
import { ClipboardList, ChevronRight, Plus } from 'lucide-react';

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | Date | null) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

// Amounts are stored in cents on the API; divide before locale-formatting.
function formatCents(cents: number): string {
  return nzd.format(cents / 100);
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    quotesClient
      .list()
      .then((data) => {
        if (!cancelled) setQuotes(data.quotes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Could not load quotes.');
        }
        setQuotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          New quote
        </Link>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {quotes === null && !error && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading quotes…</p>
        </Card>
      )}

      {quotes !== null && quotes.length === 0 && !error && (
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <ClipboardList size={20} className="text-gray-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No quotes yet</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
              Create your first quote to price up a job. Once a client accepts, convert the
              quote into an invoice in one tap.
            </p>
            <Link
              href="/quotes/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <Plus size={16} />
              Create quote
            </Link>
          </div>
        </Card>
      )}

      {quotes && quotes.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/quotes/${q.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {q.quoteNumber}
                      </span>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="text-sm text-gray-600 truncate">{q.clientName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCents(q.total)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Valid until {formatDate(q.validUntil)}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
