'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { productsClient, ApiError } from '@/lib/api-client';
import { ArrowLeft } from 'lucide-react';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [costDollars, setCostDollars] = useState('');
  const [costIsAnnual, setCostIsAnnual] = useState(false);
  const [marginPercent, setMarginPercent] = useState('');
  const [type, setType] = useState<'fixed' | 'variable'>('fixed');
  const [isGstApplicable, setIsGstApplicable] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCostOrMargin = (cost: string, margin: string, annual = costIsAnnual) => {
    setCostDollars(cost);
    setMarginPercent(margin);
    const c = Number(cost.trim());
    const m = Number(margin.trim());
    if (Number.isFinite(c) && c >= 0 && Number.isFinite(m) && m >= 0 && margin.trim()) {
      const attributed = annual ? c / 12 : c;
      setPriceDollars((Math.round(attributed * (1 + m / 100) * 100) / 100).toFixed(2));
    }
  };

  useEffect(() => {
    let cancelled = false;
    productsClient
      .get(id)
      .then((data) => {
        if (cancelled) return;
        const p = data.product as {
          name?: string;
          description?: string | null;
          unitPrice?: number;
          unitCost?: number | null;
          unitCostIsAnnual?: boolean;
          defaultMarginPercent?: number | null;
          type?: 'fixed' | 'variable';
          isGstApplicable?: boolean;
        };
        setName(p.name || '');
        setDescription(p.description || '');
        setPriceDollars((Number(p.unitPrice || 0) / 100).toFixed(2));
        setCostDollars(
          p.unitCost != null && Number(p.unitCost) >= 0
            ? (Number(p.unitCost) / 100).toFixed(2)
            : '',
        );
        setCostIsAnnual(Boolean(p.unitCostIsAnnual));
        setMarginPercent(
          p.defaultMarginPercent != null ? String(p.defaultMarginPercent) : '',
        );
        setType((p.type as 'fixed' | 'variable') || 'fixed');
        setIsGstApplicable(p.isGstApplicable !== false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load product.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
      const attributed = costIsAnnual ? Math.round(unitCost / 12) : unitCost;
      unitPrice = Math.round(attributed * (1 + defaultMarginPercent / 100));
    }

    setSubmitting(true);
    try {
      await productsClient.update(id, {
        name: name.trim(),
        description: description.trim() || undefined,
        unitPrice,
        unitCost,
        unitCostIsAnnual: costIsAnnual && unitCost != null,
        defaultMarginPercent,
        type,
        isGstApplicable,
      });
      router.push('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save product.');
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this product? It will leave your active catalog.')) return;
    setDeleting(true);
    setError(null);
    try {
      await productsClient.remove(id);
      router.push('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not deactivate product.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-gray-500 py-8 text-center">Loading product…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={14} />
        Back to products
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Edit product</h1>
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
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={costIsAnnual}
              onChange={(e) => {
                const next = e.target.checked;
                setCostIsAnnual(next);
                onCostOrMargin(costDollars, marginPercent, next);
              }}
              className="h-4 w-4 rounded border-gray-300 text-accent"
            />
            Cost is annual (e.g. web hosting paid yearly)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label={costIsAnnual ? 'Annual cost (NZD, internal)' : 'Cost (NZD, internal)'}
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
              label={costIsAnnual ? 'Sell price / month (NZD)' : 'Sell price (NZD)'}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            {costIsAnnual
              ? `Annual cost is spread over 12 months for profit${
                  costDollars.trim() && Number.isFinite(Number(costDollars))
                    ? ` (≈ $${(Number(costDollars) / 12).toFixed(2)}/mo)`
                    : ''
                }. Customers only see sell price.`
              : 'Cost + margin % calculate sell price. Customers only ever see sell price on invoices.'}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'fixed' | 'variable')}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="fixed">Fixed price</option>
              <option value="variable">Variable</option>
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
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={submitting}>
            Save changes
          </Button>
          <Link
            href="/products"
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </Link>
          <Button
            type="button"
            variant="ghost"
            loading={deleting}
            onClick={handleDeactivate}
            className="text-danger ml-auto"
          >
            Deactivate
          </Button>
        </div>
      </form>
    </div>
  );
}
