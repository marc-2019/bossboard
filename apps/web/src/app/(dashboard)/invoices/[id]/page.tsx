'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { invoicesClient, ApiError, type CreateInvoiceInput } from '@/lib/api-client';
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
  Plus,
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

interface LineItemRow {
  description: string;
  amountDollars: string;
}

const emptyLine = (): LineItemRow => ({ description: '', amountDollars: '' });

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
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

  // Inline edit form state (draft invoices only)
  const [isEditing, setIsEditing] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editJobDescription, setEditJobDescription] = useState('');
  const [editLineItems, setEditLineItems] = useState<LineItemRow[]>([]);
  const [editIncludeGst, setEditIncludeGst] = useState(true);
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      setActionMessage(`Invoice emailed to ${recipient.trim()}.`);
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

  // --- Edit handlers (only for draft invoices) ---
  const startEdit = () => {
    if (!invoice || invoice.status !== 'draft' || actionBusy || editSubmitting) return;
    setEditClientName(invoice.clientName || '');
    setEditClientEmail(invoice.clientEmail || '');
    setEditClientPhone(invoice.clientPhone || '');
    setEditJobDescription(invoice.jobDescription || '');
    setEditLineItems(
      invoice.lineItems.length > 0
        ? invoice.lineItems.map((li) => ({
            description: li.description,
            amountDollars: (li.amount / 100).toString(),
          }))
        : [emptyLine()],
    );
    setEditIncludeGst(!!invoice.includeGst);
    // normalise dueDate (may be ISO or YYYY-MM-DD)
    const dd = invoice.dueDate ? String(invoice.dueDate).split('T')[0] : '';
    setEditDueDate(dd);
    setEditNotes(invoice.notes || '');
    setEditError(null);
    setIsEditing(true);
    // close other transient UIs
    setEmailFormOpen(false);
    setShareUrl(null);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const updateEditLine = (idx: number, patch: Partial<LineItemRow>) => {
    setEditLineItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addEditLine = () => setEditLineItems((rows) => [...rows, emptyLine()]);
  const removeEditLine = (idx: number) =>
    setEditLineItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const editSubtotalCents = editLineItems.reduce((sum, r) => {
    const cents = dollarsToCents(r.amountDollars);
    return sum + (cents ?? 0);
  }, 0);
  const editGstCents = editIncludeGst ? Math.round(editSubtotalCents * 0.15) : 0;
  const editTotalCents = editSubtotalCents + editGstCents;

  const onSaveEdit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!id || !invoice || editSubmitting) return;
    setEditError(null);

    const trimmedClient = editClientName.trim();
    if (!trimmedClient) {
      setEditError('Client name is required.');
      return;
    }

    const cleanedItems: CreateInvoiceInput['lineItems'] = [];
    for (const row of editLineItems) {
      const desc = row.description.trim();
      const cents = dollarsToCents(row.amountDollars);
      if (!desc && cents === null) continue;
      if (!desc) {
        setEditError('Every line item needs a description.');
        return;
      }
      if (cents === null) {
        setEditError(`Line "${desc}" needs a valid amount.`);
        return;
      }
      cleanedItems.push({ description: desc, amount: cents });
    }
    if (cleanedItems.length === 0) {
      setEditError('Add at least one line item.');
      return;
    }

    const payload: Partial<CreateInvoiceInput> = {
      clientName: trimmedClient,
      lineItems: cleanedItems,
      includeGst: editIncludeGst,
      clientEmail: editClientEmail.trim() || '',
      clientPhone: editClientPhone.trim() || '',
      jobDescription: editJobDescription.trim() || '',
      notes: editNotes.trim() || '',
    };
    if (editDueDate) {
      payload.dueDate = editDueDate;
    } else {
      (payload as any).dueDate = null;
    }

    setEditSubmitting(true);
    try {
      const data = await invoicesClient.update(id, payload);
      setInvoice(data.invoice);
      setIsEditing(false);
      setActionMessage('Invoice updated.');
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not update invoice.');
    } finally {
      setEditSubmitting(false);
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
          {isEditing ? (
            <>
              <Button
                onClick={onSaveEdit}
                loading={editSubmitting}
                disabled={editSubmitting}
                variant="primary"
                size="md"
              >
                Save changes
              </Button>
              <Button
                onClick={cancelEdit}
                disabled={editSubmitting}
                variant="ghost"
                size="md"
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {isDraft && (
                <Button
                  onClick={startEdit}
                  disabled={!!actionBusy}
                  variant="secondary"
                  size="md"
                >
                  <Pencil size={14} className="mr-2" />
                  Edit
                </Button>
              )}
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
            </>
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

      {isEditing ? (
        <form onSubmit={onSaveEdit} className="space-y-6">
          {editError && (
            <Card>
              <p className="text-sm text-danger">{editError}</p>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Client
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Client name"
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                placeholder="e.g. Smith Construction Ltd"
                required
                autoFocus
              />
              <Input
                label="Client email (for emailing the invoice)"
                type="email"
                value={editClientEmail}
                onChange={(e) => setEditClientEmail(e.target.value)}
                placeholder="client@example.com"
              />
              <Input
                label="Client phone (optional)"
                value={editClientPhone}
                onChange={(e) => setEditClientPhone(e.target.value)}
                placeholder="021 123 4567"
              />
              <Input
                label="Due date (optional)"
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Job description (optional)
            </h2>
            <textarea
              value={editJobDescription}
              onChange={(e) => setEditJobDescription(e.target.value)}
              placeholder="Brief description of the work — appears at the top of the invoice."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Line items
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={addEditLine} disabled={editSubmitting}>
                <Plus size={14} className="mr-1" />
                Add line
              </Button>
            </div>

            <ul className="space-y-3">
              {editLineItems.map((row, idx) => (
                <li key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={idx === 0 ? 'Description' : undefined}
                      value={row.description}
                      onChange={(e) => updateEditLine(idx, { description: e.target.value })}
                      placeholder="What did you do?"
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      label={idx === 0 ? 'Amount (NZD)' : undefined}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={row.amountDollars}
                      onChange={(e) => updateEditLine(idx, { amountDollars: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEditLine(idx)}
                    disabled={editLineItems.length === 1 || editSubmitting}
                    aria-label="Remove line item"
                  >
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>

            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editIncludeGst}
                onChange={(e) => setEditIncludeGst(e.target.checked)}
                disabled={editSubmitting}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/50"
              />
              Include 15% GST
            </label>

            <div className="mt-4 pt-4 border-t border-border-light space-y-1 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCents(editSubtotalCents)}</span>
              </div>
              {editIncludeGst && (
                <div className="flex justify-between">
                  <span>GST (15%)</span>
                  <span>{formatCents(editGstCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-1">
                <span>Total</span>
                <span>{formatCents(editTotalCents)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notes (optional)
            </h2>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Payment terms, thank-you message, anything else."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
          </Card>

          <div className="flex gap-3">
            <Button type="submit" loading={editSubmitting} disabled={editSubmitting}>
              Save changes
            </Button>
            <Button type="button" variant="ghost" onClick={cancelEdit} disabled={editSubmitting}>
              Cancel
            </Button>
          </div>

          <p className="text-xs text-gray-500">
            Bank details, GST number and company info come from your business profile in
            Settings — they&apos;ll be added to the invoice automatically.
          </p>
        </form>
      ) : (
        <>
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
              {invoice.lineItems.map((item) => (
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
                <span>{formatCents(invoice.subtotal)}</span>
              </div>
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
        </>
      )}
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
