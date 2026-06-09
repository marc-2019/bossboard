'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { certificationsClient, ApiError } from '@/lib/api-client';
import type { Certification } from '@bossboard/shared';
import { Award, Plus, Pencil } from 'lucide-react';

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

type ExpiryState = 'expired' | 'expiring_soon' | 'valid' | 'unknown';

function expiryState(expiry: Date | string | null): ExpiryState {
  if (!expiry) return 'unknown';
  const d = typeof expiry === 'string' ? new Date(expiry) : expiry;
  if (Number.isNaN(d.getTime())) return 'unknown';
  const days = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'valid';
}

const stateBadge: Record<ExpiryState, { label: string; bg: string; text: string }> = {
  expired: { label: 'Expired', bg: 'bg-danger/10', text: 'text-danger' },
  expiring_soon: { label: 'Expiring soon', bg: 'bg-amber-100', text: 'text-amber-800' },
  valid: { label: 'Valid', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  unknown: { label: 'No expiry', bg: 'bg-gray-100', text: 'text-gray-700' },
};

const typeLabel: Record<string, string> = {
  electrical: 'Electrical',
  gas: 'Gas',
  plumbing: 'Plumbing',
  lpg: 'LPG',
  first_aid: 'First Aid',
  site_safe: 'Site Safe',
  other: 'Other',
};

export default function CertificationsPage() {
  const [certs, setCerts] = useState<Certification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    certificationsClient
      .list()
      .then((data) => {
        if (!cancelled) setCerts(data.certifications);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load certifications.');
        setCerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Group/sort: expired first, then expiring soon, then by expiry date asc.
  const sorted = (certs || []).slice().sort((a, b) => {
    const order: Record<ExpiryState, number> = {
      expired: 0,
      expiring_soon: 1,
      valid: 2,
      unknown: 3,
    };
    const sa = order[expiryState(a.expiryDate)];
    const sb = order[expiryState(b.expiryDate)];
    if (sa !== sb) return sa - sb;
    const da = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
    const db = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
    return da - db;
  });

  const expiredCount = sorted.filter((c) => expiryState(c.expiryDate) === 'expired').length;
  const expiringSoonCount = sorted.filter(
    (c) => expiryState(c.expiryDate) === 'expiring_soon',
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Certifications</h1>
        <Link
          href="/certifications/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Plus size={16} />
          Add certification
        </Link>
      </div>

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {certs === null && !error && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading certifications…</p>
        </Card>
      )}

      {certs !== null && certs.length === 0 && !error && (
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <Award size={20} className="text-gray-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No certifications recorded</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
              Add your trade licences, safety certifications, and tickets, and we&apos;ll remind
              you before they expire.
            </p>
            <Link
              href="/certifications/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <Plus size={16} />
              Add certification
            </Link>
          </div>
        </Card>
      )}

      {sorted.length > 0 && (expiredCount > 0 || expiringSoonCount > 0) && (
        <Card className="mb-4">
          <div className="flex flex-wrap gap-3 text-sm">
            {expiredCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-danger" />
                <span className="text-gray-700">
                  <span className="font-semibold text-danger">{expiredCount}</span> expired
                </span>
              </div>
            )}
            {expiringSoonCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-gray-700">
                  <span className="font-semibold text-amber-700">{expiringSoonCount}</span> expiring
                  in the next 30 days
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {sorted.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {sorted.map((c) => {
              const state = expiryState(c.expiryDate);
              const badge = stateBadge[state];
              return (
                <li key={c.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {c.name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {typeLabel[c.type] || c.type}
                      {c.issuingBody ? ` · ${c.issuingBody}` : ''}
                      {c.certNumber ? ` · ${c.certNumber}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500">Expires</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(c.expiryDate)}
                    </div>
                  </div>
                  <Link
                    href={`/certifications/${c.id}/edit`}
                    className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    aria-label={`Edit ${c.name}`}
                  >
                    <Pencil size={14} />
                    Edit
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
