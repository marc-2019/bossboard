'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { recurringInvoicesClient, ApiError } from '@/lib/api-client';
import type { RecurringInvoice } from '@bossboard/shared';
import { Plus, RefreshCw, Play } from 'lucide-react';

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });

export default function RecurringInvoicesPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecurringInvoice[] | null>(null);
  const [pending, setPending] = useState<{
    autoGenerate: RecurringInvoice[];
    needsInput: RecurringInvoice[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([recurringInvoicesClient.list(), recurringInvoicesClient.pending()])
      .then(([list, pend]) => {
        setItems((list.recurringInvoices || []) as RecurringInvoice[]);
        setPending({
          autoGenerate: (pend.autoGenerate || []) as RecurringInvoice[],
          needsInput: (pend.needsInput || []) as RecurringInvoice[],
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not load recurring invoices.');
        setItems([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (id: string) => {
    setGeneratingId(id);
    setError(null);
    try {
      const data = await recurringInvoicesClient.generate(id);
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not generate invoice.');
      setGeneratingId(null);
    }
  };

  const pendingCount =
    (pending?.autoGenerate?.length || 0) + (pending?.needsInput?.length || 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Recurring invoices</h1>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={load}>
            <RefreshCw size={14} className="mr-1" />
            Refresh
          </Button>
          <Link
            href="/recurring/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90"
          >
            <Plus size={16} />
            New template
          </Link>
        </div>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {pendingCount > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900 mb-2">
            {pendingCount} template{pendingCount === 1 ? '' : 's'} ready to generate this cycle
          </p>
          <ul className="space-y-2">
            {[...(pending?.autoGenerate || []), ...(pending?.needsInput || [])].map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 text-sm bg-white/80 rounded-lg px-3 py-2"
              >
                <span className="font-medium text-gray-900">{r.name}</span>
                <Button
                  type="button"
                  size="sm"
                  loading={generatingId === r.id}
                  onClick={() => generate(r.id)}
                >
                  <Play size={12} className="mr-1" />
                  Generate
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {items === null && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        </Card>
      )}

      {items && items.length === 0 && (
        <Card>
          <p className="text-sm text-gray-800 font-medium">No recurring templates yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Set up monthly invoices for retainers or standing clients. Needs a saved client and
            product.
          </p>
          <Link
            href="/recurring/new"
            className="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
          >
            <Plus size={16} />
            Create template
          </Link>
        </Card>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((r) => {
            const lines = (r as unknown as { lineItems?: { unitPrice?: number; quantity?: number }[] })
              .lineItems;
            const approx =
              lines?.reduce(
                (s, li) => s + Number(li.unitPrice || 0) * Number(li.quantity || 1),
                0,
              ) ?? 0;
            return (
              <li
                key={r.id}
                className="rounded-xl border border-border-light bg-white px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    Day {r.dayOfMonth} each month
                    {r.isActive === false ? ' · inactive' : ''}
                    {approx > 0 ? ` · ~${nzd.format(approx / 100)}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={generatingId === r.id}
                  onClick={() => generate(r.id)}
                >
                  <Play size={12} className="mr-1" />
                  Generate now
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
