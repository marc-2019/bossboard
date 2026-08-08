'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { customersClient, ApiError } from '@/lib/api-client';
import type { Customer } from '@bossboard/shared';
import { Plus, Users, Pencil, Search } from 'lucide-react';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      customersClient
        .list({ search: search.trim() || undefined, limit: 200 })
        .then((data) => {
          if (!cancelled) setCustomers(data.customers || []);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : 'Could not load customers.');
          setCustomers([]);
        });
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <Link
          href="/customers/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          New client
        </Link>
      </div>

      <Card className="mb-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
      </Card>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {customers === null && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading clients…</p>
        </Card>
      )}

      {customers && customers.length === 0 && (
        <Card>
          <div className="flex flex-col items-center py-10 text-center">
            <Users size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-800">No clients yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              Add clients so you can pick them on invoices without retyping details.
            </p>
            <Link
              href="/customers/new"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
            >
              <Plus size={16} />
              Add first client
            </Link>
          </div>
        </Card>
      )}

      {customers && customers.length > 0 && (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}/edit`}
                className="block rounded-xl border border-border-light bg-white px-4 py-3 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-accent/10 text-accent flex items-center justify-center font-semibold shrink-0">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}
                      </p>
                    </div>
                  </div>
                  <Pencil size={16} className="text-gray-400 shrink-0" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
