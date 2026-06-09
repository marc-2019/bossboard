'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  expensesClient,
  ApiError,
  type UpdateExpenseInput,
  type ExpenseCategory,
} from '@/lib/api-client';
import {
  ArrowLeft,
  Hammer,
  Fuel,
  Wrench,
  Users,
  Car,
  Monitor,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

const CATEGORIES: { key: ExpenseCategory; label: string; icon: LucideIcon }[] = [
  { key: 'materials', label: 'Materials', icon: Hammer },
  { key: 'fuel', label: 'Fuel', icon: Fuel },
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'subcontractor', label: 'Subcontractor', icon: Users },
  { key: 'vehicle', label: 'Vehicle', icon: Car },
  { key: 'office', label: 'Office', icon: Monitor },
  { key: 'other', label: 'Other', icon: MoreHorizontal },
];

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

// Convert integer cents → an editable dollar string (no trailing-zero noise).
function centsToDollars(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  return (cents / 100).toString();
}

// Normalise an incoming date (ISO datetime or YYYY-MM-DD) to a date-input value.
function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });

export default function EditExpensePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amountDollars, setAmountDollars] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('materials');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [isGstClaimable, setIsGstClaimable] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    expensesClient
      .get(id)
      .then((data) => {
        if (cancelled) return;
        const e = data.expense;
        setAmountDollars(centsToDollars(Number(e.amount || 0)));
        setCategory(e.category);
        setDate(toDateInput(e.date));
        setDescription(e.description || '');
        setVendor(e.vendor || '');
        setIsGstClaimable(Boolean(e.isGstClaimable));
        setNotes(e.notes || '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Could not load expense.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const amountCents = dollarsToCents(amountDollars) ?? 0;
  const gstComponentCents =
    isGstClaimable && amountCents > 0 ? Math.round((amountCents * 0.15) / 1.15) : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cents = dollarsToCents(amountDollars);
    if (cents === null) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    const payload: UpdateExpenseInput = {
      amount: cents,
      category,
      date: date || undefined,
      description: description.trim() || undefined,
      vendor: vendor.trim() || undefined,
      isGstClaimable,
      notes: notes.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await expensesClient.update(id, payload);
      router.push('/expenses');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not update expense.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/expenses"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to expenses
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Edit expense</h1>

      {loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {loading && !loadError && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading expense…</p>
        </Card>
      )}

      {!loading && !loadError && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Card>
              <p className="text-sm text-danger">{error}</p>
            </Card>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Amount
            </h2>
            <div className="max-w-xs">
              <Input
                label="Amount (NZD)"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
            {isGstClaimable && gstComponentCents > 0 && (
              <p className="mt-2 text-sm text-emerald-600 font-medium">
                GST component: {nzd.format(gstComponentCents / 100)}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Category
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-accent bg-accent/5 text-accent'
                        : 'border-border bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={16} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Input
                label="Vendor / supplier (optional)"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. Bunnings, Repco"
                maxLength={255}
              />
              <div className="md:col-span-2">
                <Input
                  label="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this expense for?"
                  maxLength={500}
                />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isGstClaimable}
                onChange={(e) => setIsGstClaimable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/50"
              />
              GST claimable (amount includes 15% GST)
            </label>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notes (optional)
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes…"
              rows={3}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
            />
          </Card>

          <div className="flex gap-3">
            <Button type="submit" loading={submitting}>
              Save changes
            </Button>
            <Link
              href="/expenses"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
