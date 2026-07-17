'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  invoicesClient,
  ApiError,
  type CreateInvoiceInput,
} from '@/lib/api-client';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

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

function centsToDollars(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  return (cents / 100).toString();
}

function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
function formatCents(cents: number): string {
  return nzd.format(cents / 100);
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notEditable, setNotEditable] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLine()]);
  const [includeGst, setIncludeGst] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setNotEditable(false);

    invoicesClient
      .get(id)
      .then((data) => {
        if (cancelled) return;
        const inv = data.invoice;
        setInvoiceNumber(inv.invoiceNumber || '');

        if (inv.status !== 'draft') {
          setNotEditable(true);
          return;
        }

        setClientName(inv.clientName || '');
        setClientEmail(inv.clientEmail || '');
        setClientPhone(inv.clientPhone || '');
        setJobDescription(inv.jobDescription || '');
        setIncludeGst(Boolean(inv.includeGst));
        setDueDate(toDateInput(inv.dueDate));
        setNotes(inv.notes || '');

        const lines = (inv.lineItems || []).map((li) => ({
          description: li.description || '',
          amountDollars: centsToDollars(Number(li.amount || 0)),
        }));
        setLineItems(lines.length > 0 ? lines : [emptyLine()]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Could not load invoice.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateLine = (idx: number, patch: Partial<LineItemRow>) => {
    setLineItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addLine = () => setLineItems((rows) => [...rows, emptyLine()]);
  const removeLine = (idx: number) =>
    setLineItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const subtotalCents = lineItems.reduce((sum, r) => {
    const cents = dollarsToCents(r.amountDollars);
    return sum + (cents ?? 0);
  }, 0);
  const gstCents = includeGst ? Math.round(subtotalCents * 0.15) : 0;
  const totalCents = subtotalCents + gstCents;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedClient = clientName.trim();
    if (!trimmedClient) {
      setError('Client name is required.');
      return;
    }

    const cleanedItems: CreateInvoiceInput['lineItems'] = [];
    for (const row of lineItems) {
      const desc = row.description.trim();
      const cents = dollarsToCents(row.amountDollars);
      if (!desc && cents === null) continue;
      if (!desc) {
        setError('Every line item needs a description.');
        return;
      }
      if (cents === null) {
        setError(`Line "${desc}" needs a valid amount.`);
        return;
      }
      cleanedItems.push({ description: desc, amount: cents });
    }
    if (cleanedItems.length === 0) {
      setError('Add at least one line item.');
      return;
    }

    // Always send optional keys so clearing a field persists (undefined is
    // dropped by JSON.stringify and the API only updates present fields).
    const payload: Partial<CreateInvoiceInput> = {
      clientName: trimmedClient,
      lineItems: cleanedItems,
      includeGst,
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      jobDescription: jobDescription.trim(),
      dueDate: dueDate || null,
      notes: notes.trim(),
    } as Partial<CreateInvoiceInput>;

    setSubmitting(true);
    try {
      await invoicesClient.update(id, payload);
      router.push(`/invoices/${id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not update invoice.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href={`/invoices/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to invoice
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">
        Edit invoice{invoiceNumber ? ` ${invoiceNumber}` : ''}
      </h1>

      {loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
          <div className="mt-3">
            <Link
              href="/invoices"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ArrowLeft size={14} />
              Back to invoices
            </Link>
          </div>
        </Card>
      )}

      {notEditable && !loadError && (
        <Card>
          <p className="text-sm text-gray-700">
            Only draft invoices can be edited. Sent or paid invoices are locked.
          </p>
          <div className="mt-3">
            <Link
              href={`/invoices/${id}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ArrowLeft size={14} />
              Back to invoice
            </Link>
          </div>
        </Card>
      )}

      {loading && !loadError && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading invoice…</p>
        </Card>
      )}

      {!loading && !loadError && !notEditable && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Card>
              <p className="text-sm text-danger">{error}</p>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Client
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Client name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Smith Construction Ltd"
                required
                autoFocus
              />
              <Input
                label="Client email (for emailing the invoice)"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@example.com"
              />
              <Input
                label="Client phone (optional)"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="021 123 4567"
              />
              <Input
                label="Due date (optional)"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Job description (optional)
            </h2>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
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
              <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                <Plus size={14} className="mr-1" />
                Add line
              </Button>
            </div>

            <ul className="space-y-3">
              {lineItems.map((row, idx) => (
                <li key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={idx === 0 ? 'Description' : undefined}
                      value={row.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
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
                      onChange={(e) => updateLine(idx, { amountDollars: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(idx)}
                    disabled={lineItems.length === 1}
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
                checked={includeGst}
                onChange={(e) => setIncludeGst(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/50"
              />
              Include 15% GST
            </label>

            <div className="mt-4 pt-4 border-t border-border-light space-y-1 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCents(subtotalCents)}</span>
              </div>
              {includeGst && (
                <div className="flex justify-between">
                  <span>GST (15%)</span>
                  <span>{formatCents(gstCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-1">
                <span>Total</span>
                <span>{formatCents(totalCents)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notes (optional)
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, thank-you message, anything else."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
          </Card>

          <div className="flex gap-3">
            <Button type="submit" loading={submitting}>
              Save changes
            </Button>
            <Link
              href={`/invoices/${id}`}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </Link>
          </div>

          <p className="text-xs text-gray-500">
            Only draft invoices can be edited. Bank details and company info still come from
            your business profile in Settings.
          </p>
        </form>
      )}
    </div>
  );
}
