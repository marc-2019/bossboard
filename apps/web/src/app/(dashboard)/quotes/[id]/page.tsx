'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { quotesClient, ApiError } from '@/lib/api-client';
import type { Quote } from '@bossboard/shared';
import { ArrowLeft, FileCheck, Pencil, Download, Send, Mail } from 'lucide-react';

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
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [convertBusy, setConvertBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<'send' | 'email' | null>(null);
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    quotesClient
      .get(id)
      .then((data) => {
        if (!cancelled) {
          setQuote(data.quote);
          if (data.quote.clientEmail) setRecipient(data.quote.clientEmail);
        }
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

  const onMarkAsSent = async () => {
    if (!id || actionBusy) return;
    setActionBusy('send');
    setError(null);
    setActionMessage(null);
    try {
      const data = await quotesClient.markAsSent(id);
      setQuote(data.quote);
      setActionMessage('Quote marked as sent. Share the PDF with your client if you have not already.');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not mark quote as sent.');
    } finally {
      setActionBusy(null);
    }
  };

  const onEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || actionBusy) return;
    if (!recipient.trim()) {
      setError('Recipient email is required.');
      return;
    }
    setActionBusy('email');
    setError(null);
    setActionMessage(null);
    try {
      const data = await quotesClient.email(id, {
        recipientEmail: recipient.trim(),
        customMessage: customMessage.trim() || undefined,
      });
      setQuote(data.quote);
      const bccNote =
        data.bccEmail && typeof data.bccEmail === 'string'
          ? ` A copy was BCC’d to ${data.bccEmail}.`
          : '';
      setActionMessage(`Quote emailed to ${recipient.trim()}.${bccNote}`);
      setEmailFormOpen(false);
      setCustomMessage('');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not email quote.');
    } finally {
      setActionBusy(null);
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
  const canSend = quote.status === 'draft' && !alreadyConverted;
  const canEmail =
    !alreadyConverted &&
    (quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted');

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
            {canSend && (
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={actionBusy === 'send'}
                onClick={onMarkAsSent}
              >
                <Send size={14} className="mr-1.5" />
                Mark as sent
              </Button>
            )}
            {canEmail && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  setEmailFormOpen((o) => !o);
                  setError(null);
                  if (quote.clientEmail) setRecipient(quote.clientEmail);
                }}
              >
                <Mail size={14} className="mr-1.5" />
                Email quote
              </Button>
            )}
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
        {actionMessage && (
          <p className="text-sm text-green-700 mt-3 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            {actionMessage}
          </p>
        )}

        {emailFormOpen && (
          <form onSubmit={onEmail} className="mt-4 p-4 border border-border rounded-lg bg-gray-50 space-y-3">
            <p className="text-sm text-gray-700 font-medium">
              Email the quote PDF to your client. Drafts are marked as sent automatically.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="quote-recipient">
                Recipient email
              </label>
              <input
                id="quote-recipient"
                type="email"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="client@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="quote-msg">
                Optional message
              </label>
              <textarea
                id="quote-msg"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={2}
                className="w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
                placeholder="Thanks for the opportunity — quote attached."
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="md" loading={actionBusy === 'email'}>
                <Send size={14} className="mr-1.5" />
                Send email
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setEmailFormOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
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

      <Card>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Line items
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-border">
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(quote.lineItems || []).map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-gray-900">{item.description}</td>
                  <td className="py-2 text-right text-gray-900 tabular-nums">
                    {formatCents(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-1 text-sm text-right">
          <p className="text-gray-600">Subtotal: {formatCents(quote.subtotal)}</p>
          {quote.includeGst && (
            <p className="text-gray-600">GST: {formatCents(quote.gstAmount)}</p>
          )}
          <p className="text-lg font-semibold text-gray-900">Total: {formatCents(quote.total)}</p>
        </div>
      </Card>

      {quote.notes && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Customer notes (on PDF)
          </h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{quote.notes}</p>
        </Card>
      )}

      {quote.internalMemo && (
        <Card className="border-amber-200 bg-amber-50/40">
          <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide mb-2">
            Internal memo (private — not on PDF)
          </h2>
          <p className="text-sm text-amber-950 whitespace-pre-line">{quote.internalMemo}</p>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/quotes"
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-2"
    >
      <ArrowLeft size={16} />
      Quotes
    </Link>
  );
}
