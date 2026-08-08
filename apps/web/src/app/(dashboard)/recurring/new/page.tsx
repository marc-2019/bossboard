'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  recurringInvoicesClient,
  customersClient,
  productsClient,
  ApiError,
} from '@/lib/api-client';
import type { Customer, ProductService } from '@bossboard/shared';
import { ArrowLeft } from 'lucide-react';

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' });

export default function NewRecurringPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductService[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [includeGst, setIncludeGst] = useState(true);
  const [paymentTerms, setPaymentTerms] = useState('20');
  const [notes, setNotes] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      customersClient.list({ limit: 200 }),
      productsClient.list({ limit: 200 }),
    ])
      .then(([c, p]) => {
        setCustomers(c.customers || []);
        setProducts(p.products || []);
      })
      .catch(() => undefined);
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId) {
      setError('Select a client.');
      return;
    }
    if (!productId || !selectedProduct) {
      setError('Select a product/service line.');
      return;
    }
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    const day = parseInt(dayOfMonth, 10);
    if (!Number.isFinite(day) || day < 1 || day > 28) {
      setError('Day of month must be 1–28.');
      return;
    }
    const terms = paymentTerms.trim() ? parseInt(paymentTerms, 10) : undefined;
    let unitPrice = Number(selectedProduct.unitPrice || 0);
    if (priceOverride.trim()) {
      const n = Number(priceOverride);
      if (!Number.isFinite(n) || n < 0) {
        setError('Override price must be a valid NZD amount.');
        return;
      }
      unitPrice = Math.round(n * 100);
    }

    setSubmitting(true);
    try {
      await recurringInvoicesClient.create({
        customerId,
        name: name.trim(),
        dayOfMonth: day,
        includeGst,
        paymentTerms: terms,
        notes: notes.trim() || undefined,
        lineItems: [
          {
            productServiceId: productId,
            description: selectedProduct.description || selectedProduct.name,
            unitPrice,
            quantity: 1,
            type: (selectedProduct.type as 'fixed' | 'variable') || 'fixed',
          },
        ],
      });
      router.push('/recurring');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create template.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        href="/recurring"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={14} />
        Back to recurring
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">New recurring template</h1>
      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}
      {(customers.length === 0 || products.length === 0) && (
        <Card>
          <p className="text-sm text-gray-700">
            You need at least one{' '}
            <Link href="/customers/new" className="text-accent underline">
              client
            </Link>{' '}
            and one{' '}
            <Link href="/products/new" className="text-accent underline">
              product
            </Link>{' '}
            before creating a recurring invoice.
          </p>
        </Card>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4">
          <Input
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Monthly retainer — Smith"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="">Select client…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product / service
            </label>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setPriceOverride('');
              }}
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {nzd.format(Number(p.unitPrice || 0) / 100)}
                </option>
              ))}
            </select>
          </div>
          {selectedProduct && (
            <Input
              label="Unit price override (NZD, optional)"
              type="number"
              step="0.01"
              min="0"
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              placeholder={(Number(selectedProduct.unitPrice || 0) / 100).toFixed(2)}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Day of month (1–28)"
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              required
            />
            <Input
              label="Payment terms (days)"
              type="number"
              min={1}
              max={365}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includeGst}
              onChange={(e) => setIncludeGst(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-accent"
            />
            Include 15% GST
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        </Card>
        <div className="flex gap-3">
          <Button type="submit" loading={submitting}>
            Save template
          </Button>
          <Link
            href="/recurring"
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
