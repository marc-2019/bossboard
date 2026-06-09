'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { swmsClient, ApiError } from '@/lib/api-client';
import type { SWMSDocument } from '@bossboard/shared';
import { HardHat, Plus } from 'lucide-react';

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | Date | null) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

const statusBadge: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700' },
  signed: { label: 'Signed', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  archived: { label: 'Archived', bg: 'bg-gray-100', text: 'text-gray-500' },
};

const tradeLabel: Record<string, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
  builder: 'Builder',
  landscaper: 'Landscaper',
  painter: 'Painter',
  other: 'Other',
};

export default function SwmsPage() {
  const [documents, setDocuments] = useState<SWMSDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    swmsClient
      .list()
      .then((data) => {
        if (!cancelled) setDocuments(data.documents);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load SWMS documents.');
        setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sort: draft first (action needed), then signed by date desc, archived last.
  const sorted = (documents || []).slice().sort((a, b) => {
    const order: Record<string, number> = { draft: 0, signed: 1, archived: 2 };
    const sa = order[a.status] ?? 3;
    const sb = order[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt as unknown as string).getTime() -
      new Date(a.createdAt as unknown as string).getTime();
  });

  const draftCount = sorted.filter((d) => d.status === 'draft').length;
  const signedCount = sorted.filter((d) => d.status === 'signed').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SWMS documents</h1>
        <Link href="/swms/new">
          <Button size="md">
            <Plus size={14} className="mr-2" />
            Generate SWMS
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {documents === null && !error && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading SWMS documents…</p>
        </Card>
      )}

      {documents !== null && documents.length === 0 && !error && (
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <HardHat size={20} className="text-gray-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No SWMS documents yet</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
              Generate an AI-assisted Safe Work Method Statement in seconds — site-specific
              hazard ID, control measures, and PDF export. Sign on site in the BossBoard
              mobile app.
            </p>
            <Link href="/swms/new">
              <Button size="md">
                <Plus size={14} className="mr-2" />
                Generate your first SWMS
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {sorted.length > 0 && (draftCount > 0 || signedCount > 0) && (
        <Card className="mb-4">
          <div className="flex flex-wrap gap-6 text-sm">
            {draftCount > 0 && (
              <div>
                <p className="text-xs text-gray-500">Drafts (need signing)</p>
                <p className="text-lg font-semibold text-gray-900 mt-0.5">{draftCount}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Signed</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{signedCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{sorted.length}</p>
            </div>
          </div>
        </Card>
      )}

      {sorted.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {sorted.map((d) => {
              const badge = statusBadge[d.status] || statusBadge.draft;
              return (
                <li key={d.id}>
                  <Link
                    href={`/swms/${d.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {d.title || 'Untitled SWMS'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {tradeLabel[d.templateType] || d.templateType}
                      {d.siteAddress ? ` · ${d.siteAddress}` : ''}
                      {d.clientName ? ` · ${d.clientName}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500">Created</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(d.createdAt as unknown as string)}
                    </div>
                  </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
