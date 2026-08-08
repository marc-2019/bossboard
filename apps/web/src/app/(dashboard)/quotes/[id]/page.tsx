'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { quotesClient, ApiError } from '@/lib/api-client';
import type { Quote } from '@bossboard/shared';
import { ArrowLeft, FileCheck, Pencil, Download } from 'lucide-react';

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

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convertBusy, setConvertBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    quotesClient
      .get(id)
      .then((data) => {
        if (!cancelled) setQuote(data.quote);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Could not load quote.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onConvert = async () => {
    if (!id || convertBusy) return;
    if (!confirm('Convert this quote to an invoice? You can edit the invoice afterwards on web or mobile.')) return;
    setConvertBusy(true);
    try {
      const data = await quotesClient.convert(id);
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not convert quote to invoice.');
      }
      setConvertBusy(false);
    }
  };

  if (error && !quote) {
    return (
      <div>
        <BackLink />
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      </div>
    );
  }

  if (!quote) {
    return (
      <div>
        <BackLink />
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading quote…</p>
        </Card>
      </div>
    );
  }

  const alreadyConverted = !!quote.convertedInvoiceId;

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{quote.quoteNumber}</h1>
              <StatusBadge status={quote.status} />
            </div>
            <p className="text-sm text-gray-600">
              Issued {formatDate(quote.createdAt)} · Valid until {formatDate(quote.validUntil)}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() =>
                window.open(quotesClient.pdfUrl(quote.id), '_blank', 'noopener,noreferrer')
              }
            >
              <Download size={14} className="mr-1.5" />
              Download PDF
            </Button>
            {quote.status === 'draft' && !alreadyConverted && (
              <Link
                href={`/quotes/${quote.id}/edit`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg text-gray-700 border border-border hover:bg-gray-50 transition-colors"
              >
                <Pencil size={14} />
                Edit
              </Link>
            )}
            {alreadyConverted ? (
              <Link
                href={`/invoices/${quote.convertedInvoiceId}`}
                className="inline-flex items-center text-sm font-medium text-accent hover:underline"
              >
                View linked invoice →
              </Link>
            ) : (
              <Button
                onClick={onConvert}
                loading={convertBusy}
                variant="primary"
                size="md"
                disabled={quote.status === 'declined' || quote.status === 'expired'}
              >
                <FileCheck size={16} className="mr-2" />
                Convert to invoice
              </Button>
            )}
          </div>
        </div>

        {error && quote && (
          <p className="text-sm text-danger mt-3">{error}</p>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Client
          </h2>
          <p className="text-base text-gray-900 font-medium">{quote.clientName}</p>
          {quote.clientEmail && (
            <p className="text-sm text-gray-600 mt-1">{quote.clientEmail}</p>
          )}
          {quote.clientPhone && (
            <p className="text-sm text-gray-600">{quote.clientPhone}</p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From
          </h2>
          <p className="text-base text-gray-900 font-medium">
            {quote.companyName || '—'}
          </p>
          {quote.companyAddress && (
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">
              {quote.companyAddress}
            </p>
          )}
          {quote.gstNumber && (
            <p className="text-xs text-gray-500 mt-2">GST #: {quote.gstNumber}</p>
          )}
        </Card>
      </div>

      {quote.jobDescription && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Job description
          </h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{quote.jobDescription}</p>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Line items
          </h2>
        </div>
        <ul className="divide-y divide-border-light">
          {quote.lineItems.length === 0 && (
            <li className="px-6 py-4 text-sm text-gray-500">No line items.</li>
          )}
          {quote.lineItems.map((item) => (
            <li key={item.id} className="px-6 py-3 flex items-start justify-between gap-4">
              <span className="text-sm text-gray-800">{item.description}</span>
              <span className="text-sm font-medium text-gray-900 shrink-0">
                {formatCents(item.amount)}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-6 py-4 border-t border-border-light bg-gray-50 space-y-1">
          <div className="flex justify-between text-sm text-gray-700">
            <span>Subtotal</span>
            <span>{formatCents(quote.subtotal)}</span>
          </div>
          {quote.includeGst && (
            <div className="flex justify-between text-sm text-gray-700">
              <span>GST (15%)</span>
              <span>{formatCents(quote.gstAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-gray-900 pt-1">
            <span>Total</span>
            <span>{formatCents(quote.total)}</span>
          </div>
        </div>
      </Card>

      {quote.notes && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Notes
          </h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{quote.notes}</p>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/quotes"
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
    >
      <ArrowLeft size={14} />
      Back to quotes
    </Link>
  );
}
