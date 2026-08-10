'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { invoicesClient, recurringInvoicesClient, ApiError } from '@/lib/api-client';
import { PhotoUploader } from '@/components/ui/photo-uploader';
import type { Invoice } from '@bossboard/shared';
import {
  ArrowLeft,
  Share2,
  Check,
  Send,
  Mail,
  Download,
  CheckCircle2,
  Trash2,
  Pencil,
  Repeat,
} from 'lucide-react';

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

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Email-to-client inline form
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    invoicesClient
      .get(id)
      .then((data) => {
        if (!cancelled) {
          setInvoice(data.invoice);
          setRecipient(data.invoice.clientEmail || '');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Could not load invoice.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const runAction = async (
    name: string,
    fn: () => Promise<{ invoice: Invoice }>,
    successMsg: string,
  ) => {
    if (!id || actionBusy) return;
    setActionBusy(name);
    setActionMessage(null);
    setError(null);
    try {
      const data = await fn();
      setInvoice(data.invoice);
      setActionMessage(successMsg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${name}.`);
    } finally {
      setActionBusy(null);
    }
  };

  const onMarkSent = () =>
    runAction('mark as sent', () => invoicesClient.markSent(id!), 'Invoice marked as sent.');

  const onMarkPaid = () =>
    runAction('mark as paid', () => invoicesClient.markPaid(id!), 'Invoice marked as paid.');

  const onMakeRecurring = async () => {
    if (!id || actionBusy) return;
    if (
      !window.confirm(
        'Create a monthly recurring template from this invoice? Lines will be matched to Products (or auto-created if needed).',
      )
    ) {
      return;
    }
    setActionBusy('make recurring');
    setActionMessage(null);
    setError(null);
    try {
      const data = await recurringInvoicesClient.fromInvoice(id);
      const rec = data.recurring as { id?: string; name?: string } | undefined;
      setActionMessage(
        rec?.name
          ? `Recurring template “${rec.name}” created.`
          : 'Recurring template created.',
      );
      // Open the recurring list so they can review / generate next month
      if (rec?.id) {
        router.push('/recurring');
      } else {
        router.push('/recurring');
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not create recurring template. Invoice needs a linked client.',
      );
      setActionBusy(null);
    }
  };

  const onDownloadPdf = () => {
    if (!id) return;
    // Open in a new tab so the browser handles the PDF natively.
    window.open(invoicesClient.pdfUrl(id), '_blank', 'noopener,noreferrer');
  };

  const onEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || actionBusy) return;
    if (!recipient.trim()) {
      setError('Recipient email is required.');
      return;
    }
    setActionBusy('email');
    setActionMessage(null);
    setError(null);
    try {
      const data = await invoicesClient.email(id, {
        recipientEmail: recipient.trim(),
        customMessage: customMessage.trim() || undefined,
      });
      setInvoice(data.invoice);
      const bccNote =
        data.bccEmail && typeof data.bccEmail === 'string'
          ? ` A copy was BCC’d to ${data.bccEmail}.`
          : '';
      setActionMessage(`Invoice emailed to ${recipient.trim()}.${bccNote}`);
      setEmailFormOpen(false);
      setCustomMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not email invoice.');
    } finally {
      setActionBusy(null);
    }
  };

  const onDelete = async () => {
    if (!id || actionBusy) return;
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    setActionBusy('delete');
    setError(null);
    try {
      await invoicesClient.remove(id);
      router.push('/invoices');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete invoice.');
      setActionBusy(null);
    }
  };

  const onShare = async () => {
    if (!id || shareBusy) return;
    setShareBusy(true);
    try {
      const data = await invoicesClient.share(id);
      setShareUrl(data.shareUrl);
      try {
        await navigator.clipboard.writeText(data.shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard may be blocked (insecure origin / no permission).
        // The URL is still shown in the panel for manual copy.
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not generate share link.');
      }
    } finally {
      setShareBusy(false);
    }
  };

  if (error && !invoice) {
    return (
      <div>
        <BackLink />
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div>
        <BackLink />
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading invoice…</p>
        </Card>
      </div>
    );
  }

  const status = invoice.status;
  const isDraft = status === 'draft';
  const isSent = status === 'sent' || status === 'overdue';

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-gray-600">
              Issued {formatDate(invoice.createdAt)} · Due {formatDate(invoice.dueDate)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isDraft && (
            <Button
              onClick={onMarkSent}
              loading={actionBusy === 'mark as sent'}
              disabled={!!actionBusy}
              variant="primary"
              size="md"
            >
              <Send size={14} className="mr-2" />
              Mark as sent
            </Button>
          )}
          {isDraft && (
            <Link href={`/invoices/${invoice.id}/edit`}>
              <Button
                type="button"
                disabled={!!actionBusy}
                variant="secondary"
                size="md"
              >
                <Pencil size={14} className="mr-2" />
                Edit
              </Button>
            </Link>
          )}
          <Button
            onClick={() => {
              void onMakeRecurring();
            }}
            loading={actionBusy === 'make recurring'}
            disabled={!!actionBusy}
            variant="secondary"
            size="md"
            title={
              invoice.customerId
                ? 'Create a monthly template from this invoice'
                : 'Link a client on the invoice first'
            }
          >
            <Repeat size={14} className="mr-2" />
            Make recurring
          </Button>
          <Button
            onClick={() => setEmailFormOpen((v) => !v)}
            disabled={!!actionBusy}
            variant={isDraft ? 'secondary' : 'primary'}
            size="md"
          >
            <Mail size={14} className="mr-2" />
            {emailFormOpen ? 'Cancel email' : 'Email to client'}
          </Button>
          <Button
            onClick={onDownloadPdf}
            disabled={!!actionBusy}
            variant="ghost"
            size="md"
          >
            <Download size={14} className="mr-2" />
            Download PDF
          </Button>
          <Button
            onClick={onShare}
            loading={shareBusy}
            disabled={!!actionBusy}
            variant="ghost"
            size="md"
          >
            <Share2 size={14} className="mr-2" />
            Share link
          </Button>
          {isSent && (
            <Button
              onClick={onMarkPaid}
              loading={actionBusy === 'mark as paid'}
              disabled={!!actionBusy}
              variant="primary"
              size="md"
            >
              <CheckCircle2 size={14} className="mr-2" />
              Mark as paid
            </Button>
          )}
          {isDraft && (
            <Button
              onClick={onDelete}
              loading={actionBusy === 'delete'}
              disabled={!!actionBusy}
              variant="danger"
              size="md"
            >
              <Trash2 size={14} className="mr-2" />
              Delete
            </Button>
          )}
        </div>

        {actionMessage && (
          <div className="mt-3 p-3 rounded-lg bg-success-light text-success text-sm">
            {actionMessage}
          </div>
        )}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-danger-light text-danger text-sm">
            {error}
          </div>
        )}

        {emailFormOpen && (
          <form onSubmit={onEmail} className="mt-4 p-4 rounded-lg border border-border-light bg-gray-50 space-y-3">
            <Input
              label="Recipient email"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="client@example.com"
              required
              autoFocus
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message (optional)
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a short note to your client. Leave blank for the default message."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
              />
            </div>
            <p className="text-xs text-gray-500">
              A silent BCC copy is also sent to your business mailbox (Settings → Invoice BCC,
              or company email / account email if unset).
            </p>
            <div className="flex gap-2">
              <Button type="submit" loading={actionBusy === 'email'} variant="primary">
                <Send size={14} className="mr-2" />
                Send email
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEmailFormOpen(false)}
                disabled={actionBusy === 'email'}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {shareUrl && (
          <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-border-light">
            <div className="flex items-center gap-2 mb-1 text-sm text-gray-700">
              {copied ? (
                <>
                  <Check size={14} className="text-success" />
                  Link copied to clipboard
                </>
              ) : (
                <>Share link</>
              )}
            </div>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-accent break-all hover:underline"
            >
              {shareUrl}
            </a>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Client
          </h2>
          <p className="text-base text-gray-900 font-medium">{invoice.clientName}</p>
          {invoice.clientEmail && (
            <p className="text-sm text-gray-600 mt-1">{invoice.clientEmail}</p>
          )}
          {invoice.clientPhone && (
            <p className="text-sm text-gray-600">{invoice.clientPhone}</p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From
          </h2>
          <p className="text-base text-gray-900 font-medium">
            {invoice.companyName || '—'}
          </p>
          {invoice.companyAddress && (
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">
              {invoice.companyAddress}
            </p>
          )}
          {invoice.gstNumber && (
            <p className="text-xs text-gray-500 mt-2">GST #: {invoice.gstNumber}</p>
          )}
        </Card>
      </div>

      {invoice.jobDescription && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Job description
          </h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{invoice.jobDescription}</p>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Line items
          </h2>
        </div>
        <ul className="divide-y divide-border-light">
          {invoice.lineItems.length === 0 && (
            <li className="px-6 py-4 text-sm text-gray-500">No line items.</li>
          )}
          {invoice.lineItems.map((item) => {
            const hasCost = item.cost != null && Number(item.cost) >= 0;
            const margin$ =
              hasCost ? Number(item.amount) - Number(item.cost) : null;
            return (
              <li key={item.id} className="px-6 py-3 space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-gray-800">{item.description}</span>
                  <span className="text-sm font-medium text-gray-900 shrink-0">
                    {formatCents(item.amount)}
                  </span>
                </div>
                {hasCost && (
                  <p className="text-xs text-amber-800">
                    Internal: cost {formatCents(Number(item.cost))}
                    {item.marginPercent != null
                      ? ` · margin ${item.marginPercent}%`
                      : ''}
                    {margin$ != null ? ` · markup ${formatCents(margin$)}` : ''}
                    <span className="text-gray-400"> · not on PDF</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="px-6 py-4 border-t border-border-light bg-gray-50 space-y-1">
          <div className="flex justify-between text-sm text-gray-700">
            <span>Subtotal</span>
            <span>{formatCents(invoice.subtotal)}</span>
          </div>
          {invoice.discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-700">
              <span>
                {invoice.discountLabel || 'Discount'}
                {invoice.discountType === 'percent' && invoice.discountValue
                  ? ` (${invoice.discountValue}%)`
                  : ''}
              </span>
              <span>-{formatCents(invoice.discountAmount)}</span>
            </div>
          )}
          {invoice.includeGst && (
            <div className="flex justify-between text-sm text-gray-700">
              <span>GST (15%)</span>
              <span>{formatCents(invoice.gstAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-gray-900 pt-1">
            <span>Total</span>
            <span>{formatCents(invoice.total)}</span>
          </div>
          {(() => {
            const linesWithCost = invoice.lineItems.filter(
              (li) => li.cost != null && Number(li.cost) >= 0,
            );
            if (linesWithCost.length === 0) return null;
            const totalCost = linesWithCost.reduce(
              (s, li) => s + Number(li.cost),
              0,
            );
            const totalSell = invoice.lineItems.reduce(
              (s, li) => s + Number(li.amount || 0),
              0,
            );
            const markup = totalSell - totalCost;
            const pct =
              totalCost > 0
                ? Math.round((markup / totalCost) * 10000) / 100
                : null;
            return (
              <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-1 text-sm text-amber-950">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Internal profit (not on customer invoice)
                </p>
                <div className="flex justify-between">
                  <span>Total cost</span>
                  <span>{formatCents(totalCost)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Markup{pct != null ? ` (${pct}%)` : ''}</span>
                  <span>{formatCents(markup)}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </Card>

      {(invoice.bankAccountName || invoice.bankAccountNumber) && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Pay to
          </h2>
          {invoice.bankAccountName && (
            <p className="text-sm text-gray-800">{invoice.bankAccountName}</p>
          )}
          {invoice.bankAccountNumber && (
            <p className="text-sm font-mono text-gray-800">{invoice.bankAccountNumber}</p>
          )}
        </Card>
      )}

      {invoice.notes && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Notes
          </h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{invoice.notes}</p>
        </Card>
      )}

      <Card>
        <PhotoUploader entityType="invoice" entityId={id!} />
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/invoices"
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
    >
      <ArrowLeft size={14} />
      Back to invoices
    </Link>
  );
}
