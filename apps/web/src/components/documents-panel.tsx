'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const DOCUMENT_DISCLAIMER =
  'Documents are uploaded and controlled by you (the business). BossBoard does not draft, review, or take responsibility for contracts, terms and conditions, or other legal content. You are solely responsible for what you attach and send to clients.';

export type DocScope = 'company' | 'customer' | 'invoice';
export type DocKind = 'terms' | 'contract' | 'other';

export interface BusinessDocument {
  id: string;
  title: string;
  docKind: DocKind;
  originalFilename?: string | null;
  mimeType: string;
  fileSize?: number | null;
  includeOnInvoices: boolean;
  scope: DocScope;
  url?: string;
}

interface Props {
  scope: DocScope;
  customerId?: string;
  invoiceId?: string;
  title?: string;
}

export function DocumentsPanel({
  scope,
  customerId,
  invoiceId,
  title = 'Contracts & terms',
}: Props) {
  const [docs, setDocs] = useState<BusinessDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docKind, setDocKind] = useState<DocKind>('terms');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ scope });
      if (customerId) qs.set('customerId', customerId);
      if (invoiceId) qs.set('invoiceId', invoiceId);
      const res = await fetch(`/api/documents?${qs}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load documents');
      }
      const list = (json.data?.documents || []) as BusinessDocument[];
      setDocs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [scope, customerId, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('scope', scope);
      fd.append('title', docTitle.trim() || file.name);
      fd.append('docKind', docKind);
      fd.append('includeOnInvoices', 'true');
      if (customerId) fd.append('customerId', customerId);
      if (invoiceId) fd.append('invoiceId', invoiceId);
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Upload failed');
      }
      setDocTitle('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Remove this document?')) return;
    const res = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) await load();
  };

  const toggleInclude = async (doc: BusinessDocument) => {
    await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeOnInvoices: !doc.includeOnInvoices }),
    });
    await load();
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-1">{DOCUMENT_DISCLAIMER}</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-500">No documents yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm border border-border rounded-lg px-3 py-2"
            >
              <div>
                <span className="font-medium text-gray-900">{d.title}</span>
                <span className="text-gray-500 ml-2 text-xs">({d.docKind})</span>
                {d.originalFilename && (
                  <div className="text-xs text-gray-400">{d.originalFilename}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.includeOnInvoices}
                    onChange={() => void toggleInclude(d)}
                  />
                  On invoices
                </label>
                <a
                  href={`/api/documents/${d.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent text-xs underline"
                >
                  View
                </a>
                <button
                  type="button"
                  onClick={() => void onDelete(d.id)}
                  className="text-xs text-danger hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Title (e.g. Standard T&Cs)"
            className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-border bg-input-bg text-sm"
          />
          <select
            value={docKind}
            onChange={(e) => setDocKind(e.target.value as DocKind)}
            className="px-3 py-2 rounded-lg border border-border bg-input-bg text-sm"
          >
            <option value="terms">Terms &amp; conditions</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            disabled={uploading}
            onChange={(e) => void onUpload(e.target.files?.[0] || null)}
            className="text-sm"
          />
          {uploading && <span className="text-xs text-gray-500">Uploading…</span>}
        </div>
        <p className="text-xs text-gray-500">PDF or Word, max 15MB. “On invoices” shows the file on shared invoice links.</p>
      </div>
    </Card>
  );
}
