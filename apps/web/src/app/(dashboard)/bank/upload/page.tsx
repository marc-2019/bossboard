'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { bankTransactionsClient, ApiError } from '@/lib/api-client';
import { ArrowLeft, Upload } from 'lucide-react';

type ColumnMap = { date: string; amount: string; description: string };

export default function BankUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [filePayload, setFilePayload] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    date: '',
    amount: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [matched, setMatched] = useState<number | null>(null);

  const mapped =
    columnMap.date && columnMap.amount && columnMap.description;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
    setMatched(null);
    setError(null);
    setHeaders([]);
    setColumnMap({ date: '', amount: '', description: '' });
    setFilePayload('');
    if (!f) return;
    setPreviewing(true);
    try {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      let payload: string;
      if (isZip) {
        let binary = '';
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        payload = btoa(binary);
      } else {
        payload = new TextDecoder('utf-8').decode(bytes);
      }
      setFilePayload(payload);
      const preview = await bankTransactionsClient.preview(payload, f.name);
      setHeaders(preview.headers || []);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not read this spreadsheet.');
    } finally {
      setPreviewing(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !filePayload) {
      setError('Choose a spreadsheet first.');
      return;
    }
    if (!mapped) {
      setError('Map Date, Amount, and Description.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await bankTransactionsClient.upload(filePayload, file.name, columnMap);
      setResult({
        imported: data.imported ?? 0,
        duplicates: data.duplicates ?? 0,
      });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Check the column map.');
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

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload spreadsheet</h1>
      <p className="text-sm text-gray-600 mb-2">
        Upload a CSV or Excel file, then map which columns are Date, Amount, and Description.
        Duplicates from previous uploads are skipped.
      </p>
      <p className="text-sm text-gray-500 mb-6">
        Example Westpac Business Online CSV headers include Date, Amount, Other Party Name.
        Map those columns yourself — this is not bank-brand detect.
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
              <span className="text-sm font-medium text-gray-700">Spreadsheet</span>
              <input
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFile}
                className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:text-sm file:font-medium hover:file:bg-accent/90"
              />
            </label>
            {file && (
              <p className="text-xs text-gray-500">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
            {previewing && <p className="text-sm text-gray-600">Reading columns…</p>}
            {headers.length > 0 && (
              <div className="space-y-3">
                {([
                  ['date', 'Date'],
                  ['amount', 'Amount'],
                  ['description', 'Description'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-sm font-medium text-gray-700">{label} column</span>
                    <select
                      value={columnMap[key]}
                      onChange={(ev) =>
                        setColumnMap((m) => ({ ...m, [key]: ev.target.value }))
                      }
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select a column</option>
                      {headers.map((h) => (
                        <option key={`${key}-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <Button type="submit" loading={submitting} disabled={!file || !mapped}>
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
