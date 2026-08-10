'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import {
  sellAmountFromCostMargin,
  computeInvoiceProfit,
  attributedCostCents,
  looksLikeInternalInvoiceNotes,
  INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE,
} from '@bossboard/shared';
import { ArrowLeft, Plus, Trash2, User, Package } from 'lucide-react';

interface LineItemRow {
  description: string;
  amountDollars: string;
  /** Full cost as typed; annual total when costIsAnnual */
  costDollars: string;
  costIsAnnual: boolean;
  marginPercent: string;
}

const emptyLine = (): LineItemRow => ({
  description: '',
  amountDollars: '',
  costDollars: '',
  costIsAnnual: false,
  marginPercent: '',
});

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

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductService[]>([]);
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
  const [internalMemo, setInternalMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    customersClient
      .list({ limit: 200 })
      .then((c) => {
        if (!cancelled) setCustomers(c.customers || []);
      })
      .catch(() => undefined);
    productsClient
      .list({ limit: 200 })
      .then((p) => {
        if (!cancelled) setProducts(p.products || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (inv.customerId) setCustomerId(inv.customerId);

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
        setInternalMemo(inv.internalMemo || '');

        const dType = (inv.discountType || 'none') as 'none' | 'fixed' | 'percent';
        setDiscountType(dType === 'fixed' || dType === 'percent' ? dType : 'none');
        if (dType === 'fixed' && inv.discountValue) {
          setDiscountInput(centsToDollars(Number(inv.discountValue)));
        } else if (dType === 'percent' && inv.discountValue) {
          setDiscountInput(String(inv.discountValue));
        } else {
          setDiscountInput('');
        }
        setDiscountLabel(inv.discountLabel || '');

        const lines = (inv.lineItems || []).map((li) => {
          const isAnnual = Boolean(
            (li as { costIsAnnual?: boolean }).costIsAnnual,
          );
          const annual =
            (li as { annualCost?: number | null }).annualCost != null
              ? Number((li as { annualCost?: number | null }).annualCost)
              : null;
          const costDisplay =
            isAnnual && annual != null && annual >= 0
              ? annual
              : li.cost != null && Number(li.cost) >= 0
                ? Number(li.cost)
                : null;
          return {
            description: li.description || '',
            amountDollars: centsToDollars(Number(li.amount || 0)),
            costDollars: costDisplay != null ? centsToDollars(costDisplay) : '',
            costIsAnnual: isAnnual && annual != null,
            marginPercent:
              li.marginPercent != null ? String(li.marginPercent) : '',
          };
        });
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
    setLineItems((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, ...patch };
        const rawCost = dollarsToCents(next.costDollars);
        const attributed =
          rawCost != null
            ? attributedCostCents(rawCost, next.costIsAnnual)
            : null;
        const margin = next.marginPercent.trim()
          ? Number(next.marginPercent.trim())
          : NaN;
        if (
          attributed != null &&
          Number.isFinite(margin) &&
          margin >= 0 &&
          ('costDollars' in patch ||
            'marginPercent' in patch ||
            'costIsAnnual' in patch)
        ) {
          next.amountDollars = (
            sellAmountFromCostMargin(attributed, margin) / 100
          ).toFixed(2);
        }
        return next;
      }),
    );
  };
  const addLine = () => setLineItems((rows) => [...rows, emptyLine()]);
  const removeLine = (idx: number) =>
    setLineItems((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const selectCustomer = (cid: string) => {
    setCustomerId(cid);
    if (!cid) return;
    const c = customers.find((x) => x.id === cid);
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
    const rawCost = p.unitCost != null ? Number(p.unitCost) : null;
    const isAnnual = Boolean(
      (p as { unitCostIsAnnual?: boolean }).unitCostIsAnnual,
    );
    const margin =
      p.defaultMarginPercent != null ? Number(p.defaultMarginPercent) : null;
    const attributed =
      rawCost != null ? attributedCostCents(rawCost, isAnnual) : null;
    let sellCents = Number(p.unitPrice || 0);
    if (attributed != null && attributed >= 0 && margin != null) {
      sellCents = sellAmountFromCostMargin(attributed, margin);
    }
    const dollars = (sellCents / 100).toFixed(2);
    const desc = (p.description || p.name || '').trim();
    setLineItems((rows) => {
      const onlyEmpty =
        rows.length === 1 &&
        !rows[0].description.trim() &&
        !rows[0].amountDollars.trim() &&
        !rows[0].costDollars.trim();
      const next: LineItemRow = {
        description: desc,
        amountDollars: dollars,
        // Keep full annual in the cost field when product is annual
        costDollars: rawCost != null ? (rawCost / 100).toFixed(2) : '',
        costIsAnnual: isAnnual && rawCost != null,
        marginPercent: margin != null ? String(margin) : '',
      };
      return onlyEmpty ? [next] : [...rows, next];
    });
  };

  const subtotalCents = lineItems.reduce((sum, r) => {
    const cents = dollarsToCents(r.amountDollars);
    return sum + (cents ?? 0);
  }, 0);
  const profitPreview = computeInvoiceProfit(
    lineItems.map((r) => {
      const raw = dollarsToCents(r.costDollars);
      return {
        amount: dollarsToCents(r.amountDollars) ?? 0,
        cost: raw != null ? attributedCostCents(raw, r.costIsAnnual) : null,
        marginPercent: r.marginPercent.trim()
          ? Number(r.marginPercent.trim())
          : null,
      };
    }),
  );
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
      let cents = dollarsToCents(row.amountDollars);
      const rawCost = dollarsToCents(row.costDollars);
      const annualCost =
        row.costIsAnnual && rawCost != null ? rawCost : null;
      const cost =
        rawCost != null
          ? attributedCostCents(rawCost, row.costIsAnnual)
          : null;
      const marginRaw = row.marginPercent.trim();
      const margin = marginRaw ? Number(marginRaw) : null;
      if (cost != null && margin != null && Number.isFinite(margin)) {
        cents = sellAmountFromCostMargin(cost, margin);
      }
      if (!desc && cents === null && cost === null) continue;
      if (!desc) {
        setError('Every line item needs a description.');
        return;
      }
      if (cents === null) {
        setError(`Line "${desc}" needs a valid sell amount (or cost + margin %).`);
        return;
      }
      cleanedItems.push({
        description: desc,
        amount: cents,
        cost,
        marginPercent:
          margin != null && Number.isFinite(margin) ? margin : null,
        costIsAnnual: Boolean(row.costIsAnnual && annualCost != null),
        annualCost,
      });
    }
    if (cleanedItems.length === 0) {
      setError('Add at least one line item.');
      return;
    }

    if (looksLikeInternalInvoiceNotes(notes)) {
      setError(INVOICE_NOTES_INTERNAL_BLOCKED_MESSAGE);
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
      internalMemo: internalMemo.trim(),
      customerId: customerId || null,
    } as Partial<CreateInvoiceInput>;

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
      payload.discountLabel = discountLabel.trim() || null;
    } else {
      payload.discountType = 'none';
      payload.discountValue = 0;
      payload.discountLabel = null;
    }

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
              >
                <option value="">
                  {customers.length
                    ? '— Type below, or pick a client —'
                    : '— No saved clients yet —'}
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` · ${c.email}` : ''}
                  </option>
                ))}
              </select>
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
                disabled={products.length === 0}
              >
                <option value="">
                  {products.length
                    ? '— Pick a product to add a line (price editable) —'
                    : '— No products yet —'}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatCents(Number(p.unitPrice || 0))}
                  </option>
                ))}
              </select>
            </div>

            <ul className="space-y-3">
              {lineItems.map((row, idx) => (
                <li
                  key={idx}
                  className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-border-light bg-gray-50/50"
                >
                  <div className="flex-1 min-w-[12rem]">
                    <Input
                      label={idx === 0 ? 'Description' : undefined}
                      value={row.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      placeholder="What did you do?"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      label={
                        idx === 0
                          ? row.costIsAnnual
                            ? 'Annual cost'
                            : 'Cost (internal)'
                          : undefined
                      }
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={row.costDollars}
                      onChange={(e) => updateLine(idx, { costDollars: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      label={idx === 0 ? 'Margin %' : undefined}
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={row.marginPercent}
                      onChange={(e) => updateLine(idx, { marginPercent: e.target.value })}
                      placeholder="30"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      label={idx === 0 ? 'Sell (NZD)' : undefined}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={row.amountDollars}
                      onChange={(e) => updateLine(idx, { amountDollars: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <label
                    className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2"
                    title="Spread cost over 12 months for profit on this invoice"
                  >
                    <input
                      type="checkbox"
                      checked={row.costIsAnnual}
                      onChange={(e) =>
                        updateLine(idx, { costIsAnnual: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-accent"
                    />
                    Annual
                  </label>
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
                  {row.costIsAnnual &&
                    row.costDollars.trim() &&
                    Number.isFinite(Number(row.costDollars)) && (
                      <p className="w-full text-xs text-gray-500 -mt-1">
                        ≈ ${(Number(row.costDollars) / 12).toFixed(2)}/mo attributed
                        to this invoice for profit
                      </p>
                    )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              Cost and margin are internal only — PDF and email show sell amounts only.
            </p>
            {profitPreview.linesWithCost > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-950 space-y-1">
                <p className="font-medium text-xs uppercase tracking-wide text-amber-800">
                  Internal profit (not on invoice)
                </p>
                <div className="flex justify-between">
                  <span>Total cost</span>
                  <span>{formatCents(profitPreview.totalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total sell</span>
                  <span>{formatCents(profitPreview.totalSell)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>
                    Markup
                    {profitPreview.overallMarginPercent != null
                      ? ` (${profitPreview.overallMarginPercent}%)`
                      : ''}
                  </span>
                  <span>{formatCents(profitPreview.totalMargin)}</span>
                </div>
              </div>
            )}

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
              Customer notes (PDF &amp; email)
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Thank you for your business. Please pay by the due date."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              The customer sees this. Avoid internal/test wording (“system test”, “review before
              send”). Leave blank if you only need line items and bank details.
            </p>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide mb-2">
              Internal memo (private)
            </h2>
            <textarea
              value={internalMemo}
              onChange={(e) => setInternalMemo(e.target.value)}
              placeholder="Staff-only — never on PDF, email, or share."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/50 text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
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
