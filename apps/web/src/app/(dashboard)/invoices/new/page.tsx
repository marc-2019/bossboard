'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  invoicesClient,
  customersClient,
  productsClient,
  ApiError,
  type CreateInvoiceInput,
} from '@/lib/api-client';
import type { Customer, ProductService } from '@bossboard/shared';
import { ArrowLeft, Plus, Trash2, User, Package } from 'lucide-react';

interface LineItemRow {
  description: string;
  amountDollars: string;
}

const emptyLine = (): LineItemRow => ({ description: '', amountDollars: '' });

export default function NewInvoicePage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductService[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [customerId, setCustomerId] = useState('');

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLine()]);
  const [includeGst, setIncludeGst] = useState(true);
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percent'>('none');
  const [discountInput, setDiscountInput] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, p] = await Promise.all([
          customersClient.list({ limit: 200 }),
          productsClient.list({ limit: 200 }),
        ]);
        if (cancelled) return;
        setCustomers(c.customers || []);
        setProducts(p.products || []);
      } catch {
        /* catalog optional — free-text still works */
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    if (!id) return;
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setClientName(c.name || '');
    setClientEmail(c.email || '');
    setClientPhone(c.phone || '');
    if (c.defaultIncludeGst !== undefined) setIncludeGst(Boolean(c.defaultIncludeGst));
    if (c.defaultPaymentTerms && c.defaultPaymentTerms > 0) {
      const due = new Date();
      due.setDate(due.getDate() + c.defaultPaymentTerms);
      setDueDate(due.toISOString().split('T')[0]);
    }
  };

  const addProductLine = (productId: string) => {
    if (!productId) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const dollars = (Number(p.unitPrice || 0) / 100).toFixed(2);
    const desc = (p.description || p.name || '').trim();
    setLineItems((rows) => {
      const onlyEmpty =
        rows.length === 1 && !rows[0].description.trim() && !rows[0].amountDollars.trim();
      const next = { description: desc, amountDollars: dollars };
      return onlyEmpty ? [next] : [...rows, next];
    });
  };

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
  const discountCents = computeDiscountCents(discountType, discountInput, subtotalCents);
  const taxableCents = subtotalCents - discountCents;
  const gstCents = includeGst ? Math.round(taxableCents * 0.15) : 0;
  const totalCents = taxableCents + gstCents;

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

    const payload: CreateInvoiceInput = {
      clientName: trimmedClient,
      lineItems: cleanedItems,
      includeGst,
    };
    if (customerId) payload.customerId = customerId;
    if (clientEmail.trim()) payload.clientEmail = clientEmail.trim();
    if (clientPhone.trim()) payload.clientPhone = clientPhone.trim();
    if (jobDescription.trim()) payload.jobDescription = jobDescription.trim();
    if (dueDate) payload.dueDate = dueDate;
    if (notes.trim()) payload.notes = notes.trim();

    if (discountType !== 'none' && discountCents > 0) {
      payload.discountType = discountType;
      if (discountType === 'fixed') {
        const cents = dollarsToCents(discountInput);
        if (cents === null || cents <= 0) {
          setError('Enter a valid discount amount.');
          return;
        }
        payload.discountValue = cents;
      } else {
        const pct = Number(discountInput.trim());
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          setError('Discount percent must be between 1 and 100.');
          return;
        }
        payload.discountValue = Math.round(pct);
      }
      if (discountLabel.trim()) payload.discountLabel = discountLabel.trim();
    } else {
      payload.discountType = 'none';
      payload.discountValue = 0;
    }

    setSubmitting(true);
    try {
      const data = await invoicesClient.create(payload);
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not create invoice.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to invoices
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">New invoice</h1>

      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Client
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-flex items-center gap-1.5">
                <User size={14} />
                Select saved client
              </span>
            </label>
            <select
              value={customerId}
              onChange={(e) => selectCustomer(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/50"
              disabled={catalogLoading}
            >
              <option value="">
                {catalogLoading
                  ? 'Loading clients…'
                  : customers.length
                    ? '— Type below, or pick a client —'
                    : '— No saved clients yet (type details below) —'}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` · ${c.email}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Saved clients live in the mobile app for now. Picking one fills name/email/phone and
              default payment terms / GST. You can still edit the fields.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Client name"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                if (customerId) setCustomerId('');
              }}
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

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-flex items-center gap-1.5">
                <Package size={14} />
                Add product / service
              </span>
            </label>
            <select
              value=""
              onChange={(e) => {
                addProductLine(e.target.value);
                e.target.value = '';
              }}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/50"
              disabled={catalogLoading || products.length === 0}
            >
              <option value="">
                {catalogLoading
                  ? 'Loading products…'
                  : products.length
                    ? '— Pick a product to add a line (price editable) —'
                    : '— No products yet (enter lines manually) —'}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatCents(Number(p.unitPrice || 0))}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Default price fills in — change the amount on the line if this job is different.
            </p>
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

          <div className="mt-4 pt-4 border-t border-border-light space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Discount (optional)</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-36">
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => {
                      const next = e.target.value as 'none' | 'fixed' | 'percent';
                      setDiscountType(next);
                      if (next === 'none') setDiscountInput('');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    <option value="none">None</option>
                    <option value="fixed">Fixed $</option>
                    <option value="percent">Percent %</option>
                  </select>
                </div>
                {discountType !== 'none' && (
                  <>
                    <div className="w-28">
                      <Input
                        label={discountType === 'fixed' ? 'Amount (NZD)' : 'Percent'}
                        type="number"
                        inputMode="decimal"
                        step={discountType === 'fixed' ? '0.01' : '1'}
                        min="0"
                        max={discountType === 'percent' ? '100' : undefined}
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        placeholder={discountType === 'fixed' ? '0.00' : '10'}
                      />
                    </div>
                    <div className="flex-1 min-w-[10rem]">
                      <Input
                        label="Label (optional)"
                        value={discountLabel}
                        onChange={(e) => setDiscountLabel(e.target.value)}
                        placeholder="e.g. Early payment, Mate rate"
                      />
                    </div>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Applied before GST. Fixed amounts are capped at the subtotal.
              </p>
            </div>

            <div className="space-y-1 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCents(subtotalCents)}</span>
              </div>
              {discountCents > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>
                    {discountLabel.trim() || 'Discount'}
                    {discountType === 'percent' && discountInput.trim()
                      ? ` (${discountInput.trim()}%)`
                      : ''}
                  </span>
                  <span>-{formatCents(discountCents)}</span>
                </div>
              )}
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
            Save as draft
          </Button>
          <Link
            href="/invoices"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </Link>
        </div>

        <p className="text-xs text-gray-500">
          Bank details, GST number and company info come from your business profile in
          Settings — they&apos;ll be added to the invoice automatically.
        </p>
      </form>
    </div>
  );
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function computeDiscountCents(
  type: 'none' | 'fixed' | 'percent',
  input: string,
  subtotalCents: number
): number {
  if (type === 'none' || !input.trim() || subtotalCents <= 0) return 0;
  if (type === 'fixed') {
    const cents = dollarsToCents(input);
    if (cents === null || cents <= 0) return 0;
    return Math.min(cents, subtotalCents);
  }
  const pct = Number(input.trim());
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const clamped = Math.min(100, pct);
  return Math.min(Math.round((subtotalCents * clamped) / 100), subtotalCents);
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
function formatCents(cents: number): string {
  return nzd.format(cents / 100);
}
