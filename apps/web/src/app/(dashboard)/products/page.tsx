'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { productsClient, ApiError } from '@/lib/api-client';
import type { ProductService } from '@bossboard/shared';
import { Plus, Package, Pencil, Search } from 'lucide-react';

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });
function formatCents(cents: number): string {
  return nzd.format((cents || 0) / 100);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'fixed' | 'variable'>('all');

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      productsClient
        .list({
          search: search.trim() || undefined,
          type: typeFilter === 'all' ? undefined : typeFilter,
          limit: 200,
        })
        .then((data) => {
          if (!cancelled) setProducts(data.products || []);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : 'Could not load products.');
          setProducts([]);
        });
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, typeFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Products &amp; services</h1>
        <Link
          href="/products/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          New product
        </Link>
      </div>

      <Card className="mb-4 space-y-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'fixed', 'variable'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t === 'all' ? 'All' : t === 'fixed' ? 'Fixed price' : 'Variable'}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {products === null && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading products…</p>
        </Card>
      )}

      {products && products.length === 0 && (
        <Card>
          <div className="flex flex-col items-center py-10 text-center">
            <Package size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-800">No products yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              Register services with default prices so you can add them to invoices in one tap.
            </p>
            <Link
              href="/products/new"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
            >
              <Plus size={16} />
              Add first product
            </Link>
          </div>
        </Card>
      )}

      {products && products.length > 0 && (
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products/${p.id}/edit`}
                className="block rounded-xl border border-border-light bg-white px-4 py-3 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                          p.type === 'fixed'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {p.type}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCents(Number(p.unitPrice || 0))}
                    </span>
                    <Pencil size={16} className="text-gray-400" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
