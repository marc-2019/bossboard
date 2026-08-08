'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { bankTransactionsClient, ApiError, type BankSummary } from '@/lib/api-client';
import type { BankTransaction } from '@bossboard/shared';
import { Landmark, Upload, RefreshCw, Check, X } from 'lucide-react';

const nzd = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
});

function formatCents(cents: number): string {
  return nzd.format(Math.abs(cents) / 100);
}

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

type FilterValue = 'all' | 'unreconciled' | 'reconciled';

export default function BankPage() {
  const [transactions, setTransactions] = useState<BankTransaction[] | null>(null);
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [autoMatching, setAutoMatching] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    const listParams =
      filter === 'reconciled'
        ? { isReconciled: true }
        : filter === 'unreconciled'
          ? { isReconciled: false }
          : undefined;

    Promise.all([
      bankTransactionsClient.list(listParams),
      bankTransactionsClient.summary(),
    ])
      .then(([list, sum]) => {
        setTransactions(list.transactions || []);
        setSummary(sum.summary || null);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not load bank transactions.');
        setTransactions([]);
      });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const runAutoMatch = async () => {
    setAutoMatching(true);
    setError(null);
    setBanner(null);
    try {
      const result = await bankTransactionsClient.autoMatch();
      const n = result.matched ?? 0;
      setBanner(
        n === 0
          ? 'Auto-match found no new invoice matches.'
          : `Auto-match suggested ${n} match${n === 1 ? '' : 'es'}. Confirm to mark invoices paid.`,
      );
      load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Auto-match failed.');
    } finally {
      setAutoMatching(false);
    }
  };

  const confirmMatch = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      await bankTransactionsClient.confirm(id);
      setBanner('Match confirmed — linked invoice marked paid.');
      load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not confirm match.');
    } finally {
      setActionId(null);
    }
  };

  const removeMatch = async (id: string) => {
    if (!window.confirm('Remove this invoice match?')) return;
    setActionId(id);
    setError(null);
    try {
      await bankTransactionsClient.unmatch(id);
      setBanner('Match removed.');
      load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not remove match.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Bank</h1>
        <div className="flex gap-2 flex-wrap">
          <Button type="button" variant="ghost" size="sm" onClick={load}>
            <RefreshCw size={14} className="mr-1" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={autoMatching}
            onClick={runAutoMatch}
          >
            Auto-match
          </Button>
          <Link
            href="/bank/upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90"
          >
            <Upload size={16} />
            Upload CSV
          </Link>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        Import bank CSV exports (e.g. Wise, ASB, ANZ), auto-match credits to unpaid invoices, then
        confirm to mark invoices paid. Field capture stays in the mobile app; desktop recon is for
        office mornings.
      </p>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}
      {banner && (
        <Card className="mb-4 border-green-200 bg-green-50">
          <p className="text-sm text-green-800">{banner}</p>
        </Card>
      )}

      {summary && (
        <Card className="mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{summary.reconciled}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Reconciled</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{summary.unreconciled}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Open</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-green-700">
                +{formatCents(summary.totalCredits || 0)}
              </p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Credits</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-red-600">
                −{formatCents(summary.totalDebits || 0)}
              </p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Debits</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          {(['all', 'unreconciled', 'reconciled'] as FilterValue[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
                filter === f
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      {transactions === null && !error && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading transactions…</p>
        </Card>
      )}

      {transactions !== null && transactions.length === 0 && !error && (
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <Landmark size={20} className="text-gray-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No bank transactions yet</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
              Upload a CSV export from your bank to import transactions and match them to invoices.
            </p>
            <Link
              href="/bank/upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90"
            >
              <Upload size={16} />
              Upload CSV
            </Link>
          </div>
        </Card>
      )}

      {transactions && transactions.length > 0 && (
        <div className="space-y-3">
          {transactions.map((txn) => {
            const amount = Number(txn.amount || 0);
            const isCredit = amount > 0;
            const matched = Boolean(txn.matchedInvoiceId);
            const busy = actionId === txn.id;
            return (
              <Card key={txn.id}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">{formatDate(txn.date)}</p>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {txn.description || txn.paymentReference || 'No description'}
                    </p>
                    {txn.paymentReference && txn.description && (
                      <p className="text-xs text-gray-500 mt-0.5">Ref: {txn.paymentReference}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {txn.isReconciled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          <Check size={12} />
                          Reconciled
                        </span>
                      ) : matched ? (
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 capitalize">
                          {(txn.matchConfidence || 'medium').replace('none', 'low')} match
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          Unmatched
                        </span>
                      )}
                      {matched && txn.matchedInvoiceId && (
                        <Link
                          href={`/invoices/${txn.matchedInvoiceId}`}
                          className="text-xs text-accent hover:underline"
                        >
                          View invoice
                        </Link>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-base font-semibold tabular-nums shrink-0 ${
                      isCredit ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {isCredit ? '+' : '−'}
                    {formatCents(amount)}
                  </p>
                </div>
                {matched && !txn.isReconciled && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button
                      type="button"
                      size="sm"
                      loading={busy}
                      onClick={() => confirmMatch(txn.id)}
                    >
                      <Check size={14} className="mr-1" />
                      Confirm paid
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => removeMatch(txn.id)}
                    >
                      <X size={14} className="mr-1" />
                      Remove match
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
