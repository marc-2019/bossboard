'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { expensesClient, ApiError } from '@/lib/api-client';
import type { Expense, ExpenseCategory } from '@bossboard/shared';
import { Receipt, Plus, Pencil } from 'lucide-react';

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });

// Amounts are stored in integer cents on the API; divide before locale-formatting.
function formatCents(cents: number): string {
  return nzd.format(cents / 100);
}
const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

const categoryLabel: Record<ExpenseCategory, string> = {
  materials: 'Materials',
  fuel: 'Fuel',
  tools: 'Tools',
  subcontractor: 'Subcontractor',
  vehicle: 'Vehicle',
  office: 'Office',
  other: 'Other',
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    expensesClient
      .list()
      .then((data) => {
        if (!cancelled) setExpenses(data.expenses);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load expenses.');
        setExpenses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (expenses || []).filter((e) => filter === 'all' || e.category === filter);
  const total = filtered.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const gstClaimable = filtered
    .filter((e) => e.isGstClaimable)
    .reduce((sum, e) => sum + Number(e.gstAmount || 0), 0);

  const categories = Array.from(new Set((expenses || []).map((e) => e.category))) as ExpenseCategory[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <Link
          href="/expenses/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          New expense
        </Link>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {expenses === null && !error && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading expenses…</p>
        </Card>
      )}

      {expenses !== null && expenses.length === 0 && !error && (
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <Receipt size={20} className="text-gray-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No expenses recorded</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
              Track materials, fuel, tools and more with GST flags. Add one here, or capture
              expenses on site (with receipt photos) in the BossBoard mobile app.
            </p>
            <Link
              href="/expenses/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <Plus size={16} />
              Add expense
            </Link>
          </div>
        </Card>
      )}

      {expenses && expenses.length > 0 && (
        <>
          {categories.length > 1 && (
            <Card className="mb-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-accent text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All ({expenses.length})
                </button>
                {categories.map((cat) => {
                  const count = expenses.filter((e) => e.category === cat).length;
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filter === cat
                          ? 'bg-accent text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {categoryLabel[cat]} ({count})
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="mb-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500">{filter === 'all' ? 'Total' : categoryLabel[filter as ExpenseCategory]} ({filtered.length})</p>
                <p className="text-lg font-semibold text-gray-900 mt-0.5">{formatCents(total)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">GST claimable</p>
                <p className="text-lg font-semibold text-gray-900 mt-0.5">{formatCents(gstClaimable)}</p>
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 py-6 text-center">
                No expenses in this category.
              </p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <ul className="divide-y divide-border-light">
                {filtered.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {e.description || categoryLabel[e.category]}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {categoryLabel[e.category]}
                        </span>
                        {e.isGstClaimable && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                            GST
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {formatDate(e.date)}
                        {e.vendor ? ` · ${e.vendor}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCents(Number(e.amount || 0))}
                      </div>
                      {e.isGstClaimable && Number(e.gstAmount || 0) > 0 && (
                        <div className="text-xs text-gray-500">
                          incl. {formatCents(Number(e.gstAmount))} GST
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/expenses/${e.id}/edit`}
                      className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      aria-label="Edit expense"
                    >
                      <Pencil size={15} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
