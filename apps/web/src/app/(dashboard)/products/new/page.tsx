'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { productsClient, ApiError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';

export default function NewProductPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [costDollars, setCostDollars] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  const [type, setType] = useState<'fixed' | 'variable'>('fixed');
  const [isGstApplicable, setIsGstApplicable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When cost + margin change, keep sell price in sync
  const onCostOrMargin = (cost: string, margin: string) => {
    setCostDollars(cost);
    setMarginPercent(margin);
    const c = Number(cost.trim());
    const m = Number(margin.trim());
    if (Number.isFinite(c) && c >= 0 && Number.isFinite(m) && m >= 0 && margin.trim()) {
      setPriceDollars((Math.round(c * (1 + m / 100) * 100) / 100).toFixed(2));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    const num = Number(priceDollars.trim());
    if (!Number.isFinite(num) || num < 0) {
      setError('Enter a valid unit price (0 or more).');
      return;
    }
    let unitPrice = Math.round(num * 100);
    let unitCost: number | null = null;
    let defaultMarginPercent: number | null = null;
    if (costDollars.trim()) {
      const c = Number(costDollars.trim());
      if (!Number.isFinite(c) || c < 0) {
        setError('Cost must be 0 or more.');
        return;
      }
      unitCost = Math.round(c * 100);
    }
    if (marginPercent.trim()) {
      const m = Number(marginPercent.trim());
      if (!Number.isFinite(m) || m < 0) {
        setError('Margin % must be 0 or more.');
        return;
      }
      defaultMarginPercent = m;
    }
    if (unitCost != null && defaultMarginPercent != null) {
      unitPrice = Math.round(unitCost * (1 + defaultMarginPercent / 100));
    }

    setSubmitting(true);
    try {
      await productsClient.create({
        name: name.trim(),
        description: description.trim() || undefined,
        unitPrice,
        unitCost,
        defaultMarginPercent,
        type,
        isGstApplicable,
      });
      router.push('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create product.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={14} />
        Back to products
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">New product / service</h1>
      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="e.g. Labour — hourly"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Shown on invoice line if set"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Cost (NZD, internal)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={costDollars}
              onChange={(e) => onCostOrMargin(e.target.value, marginPercent)}
              placeholder="0.00"
            />
            <Input
              label="Margin %"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={marginPercent}
              onChange={(e) => onCostOrMargin(costDollars, e.target.value)}
              placeholder="30"
            />
            <Input
              label="Sell price (NZD)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Cost + margin % calculate sell price. Customers only ever see sell price on invoices.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'fixed' | 'variable')}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="fixed">Fixed price</option>
              <option value="variable">Variable (default price, change per job)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isGstApplicable}
              onChange={(e) => setIsGstApplicable(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-accent"
            />
            GST applicable
          </label>
        </Card>
        <div className="flex gap-3">
          <Button type="submit" loading={submitting}>
            Save product
          </Button>
          <Link
            href="/products"
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
