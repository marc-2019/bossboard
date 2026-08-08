'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { bankTransactionsClient, ApiError } from '@/lib/api-client';
import { ArrowLeft, Upload } from 'lucide-react';

export default function BankUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [matched, setMatched] = useState<number | null>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
    setMatched(null);
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const text = await file.text();
      if (!text.trim() || !text.includes(',')) {
        setError('File does not look like a CSV (expected commas and rows).');
        setSubmitting(false);
        return;
      }
      const data = await bankTransactionsClient.upload(text, file.name);
      setResult({
        imported: data.imported ?? 0,
        duplicates: data.duplicates ?? 0,
      });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Check the file format.');
    } finally {
      setSubmitting(false);
    }
  };

  const runAutoMatch = async () => {
    setAutoMatching(true);
    setError(null);
    try {
      const data = await bankTransactionsClient.autoMatch();
      setMatched(data.matched ?? 0);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Auto-match failed.');
    } finally {
      setAutoMatching(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Link
        href="/bank"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={14} />
        Back to bank
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload bank CSV</h1>
      <p className="text-sm text-gray-600 mb-6">
        Export a CSV from your bank (Wise, ASB, ANZ, and similar formats with Date, Amount, and
        Description columns). Duplicates from previous uploads are skipped.
      </p>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {!result && (
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv,text/comma-separated-values,application/csv"
                onChange={onFile}
                className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:text-sm file:font-medium hover:file:bg-accent/90"
              />
            </label>
            {file && (
              <p className="text-xs text-gray-500">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
            <Button type="submit" loading={submitting} disabled={!file}>
              <Upload size={16} className="mr-1" />
              Import transactions
            </Button>
          </form>
        </Card>
      )}

      {result && (
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Import complete</h2>
            <p className="text-sm text-gray-600 mt-1">
              Imported <strong>{result.imported}</strong> transaction
              {result.imported === 1 ? '' : 's'}
              {result.duplicates > 0
                ? ` (${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped)`
                : ''}
              .
            </p>
          </div>
          {matched === null ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" loading={autoMatching} onClick={runAutoMatch}>
                Auto-match to invoices
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push('/bank')}>
                View transactions
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-green-800 mb-3">
                Auto-match suggested {matched} match{matched === 1 ? '' : 'es'}. Confirm them on the
                bank list to mark invoices paid.
              </p>
              <Button type="button" onClick={() => router.push('/bank')}>
                Review matches
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
