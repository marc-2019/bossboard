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
  const [type, setType] = useState<'fixed' | 'variable'>('fixed');
  const [isGstApplicable, setIsGstApplicable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const unitPrice = Math.round(num * 100);

    setSubmitting(true);
    try {
      await productsClient.create({
        name: name.trim(),
        description: description.trim() || undefined,
        unitPrice,
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
          <Input
            label="Default unit price (NZD)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder="0.00"
            required
          />
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
