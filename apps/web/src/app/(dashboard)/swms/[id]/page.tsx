'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { swmsClient, ApiError } from '@/lib/api-client';
import {
  ArrowLeft,
  HardHat,
  Download,
  AlertTriangle,
  ShieldCheck,
  Shirt,
  Siren,
  PenLine,
} from 'lucide-react';

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string | Date | null | undefined) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

// The /api/swms/:id endpoint returns the API's mobile-shaped document
// (snake_case) which swmsClient.get deep-camelizes. That shape differs from
// the shared SWMSDocument type, so we describe what we actually render here.
interface SwmsHazardView {
  id: string;
  hazard: string;
  riskLevel?: string;
  controlMeasures?: string[];
  ppeRequired?: string[];
}

interface SwmsSignatureView {
  role: string;
  signedAt?: string;
  signedBy?: string;
}

interface SwmsDocumentView {
  id: string;
  title?: string;
  tradeType?: string;
  status?: string;
  jobDescription?: string | null;
  siteAddress?: string | null;
  clientName?: string | null;
  expectedDuration?: string | null;
  hazards?: SwmsHazardView[];
  ppeRequired?: string[];
  emergencyProcedures?: string[];
  signatures?: SwmsSignatureView[];
  createdAt?: string;
  updatedAt?: string;
}

const tradeLabel: Record<string, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
  builder: 'Builder',
  landscaper: 'Landscaper',
  painter: 'Painter',
  other: 'Other',
};

const statusBadge: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700' },
  signed: { label: 'Signed', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  archived: { label: 'Archived', bg: 'bg-gray-100', text: 'text-gray-500' },
};

const riskStyle: Record<string, { label: string; bg: string; text: string }> = {
  low: { label: 'Low', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  medium: { label: 'Medium', bg: 'bg-amber-100', text: 'text-amber-800' },
  high: { label: 'High', bg: 'bg-orange-100', text: 'text-orange-800' },
  extreme: { label: 'Extreme', bg: 'bg-red-100', text: 'text-red-800' },
};

export default function SwmsDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [doc, setDoc] = useState<SwmsDocumentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    swmsClient
      .get(id)
      .then((data) => {
        if (!cancelled) setDoc(data.document as unknown as SwmsDocumentView);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load SWMS document.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error && !doc) {
    return (
      <div>
        <BackLink />
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      </div>
    );
  }

  if (!doc) {
    return (
      <div>
        <BackLink />
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading SWMS document…</p>
        </Card>
      </div>
    );
  }

  const badge = statusBadge[doc.status || 'draft'] || statusBadge.draft;
  const hazards = doc.hazards || [];
  const ppe = doc.ppeRequired || [];
  const emergency = doc.emergencyProcedures || [];
  const signatures = doc.signatures || [];

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <HardHat size={20} className="text-gray-700 shrink-0" />
              <h1 className="text-2xl font-bold text-gray-900">
                {doc.title || 'Untitled SWMS'}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {tradeLabel[doc.tradeType || ''] || doc.tradeType || '—'}
              {doc.expectedDuration ? ` · ${doc.expectedDuration}` : ''}
              {' · Created '}
              {formatDate(doc.createdAt)}
            </p>
          </div>

          <a
            href={swmsClient.pdfUrl(id!)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="md" type="button">
              <Download size={14} className="mr-2" />
              Download PDF
            </Button>
          </a>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-danger-light text-danger text-sm">
            {error}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Site
          </h2>
          <p className="text-base text-gray-900 font-medium">
            {doc.siteAddress || '—'}
          </p>
          {doc.clientName && (
            <p className="text-sm text-gray-600 mt-1">Client: {doc.clientName}</p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Details
          </h2>
          <dl className="text-sm text-gray-700 space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Trade</dt>
              <dd className="font-medium text-gray-900">
                {tradeLabel[doc.tradeType || ''] || doc.tradeType || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Expected duration</dt>
              <dd className="font-medium text-gray-900">{doc.expectedDuration || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Status</dt>
              <dd className="font-medium text-gray-900 capitalize">{doc.status || '—'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {doc.jobDescription && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Job description
          </h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{doc.jobDescription}</p>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Hazards &amp; controls
          </h2>
        </div>
        {hazards.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-500">No hazards recorded.</p>
        ) : (
          <ul className="divide-y divide-border-light">
            {hazards.map((h) => {
              const risk = riskStyle[(h.riskLevel || '').toLowerCase()];
              return (
                <li key={h.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="text-sm font-medium text-gray-900">{h.hazard}</span>
                    {risk && (
                      <span
                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${risk.bg} ${risk.text}`}
                      >
                        {risk.label} risk
                      </span>
                    )}
                  </div>
                  {h.controlMeasures && h.controlMeasures.length > 0 && (
                    <div className="mt-1">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        <ShieldCheck size={13} className="text-emerald-600" />
                        Control measures
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-700">
                        {h.controlMeasures.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {ppe.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            <Shirt size={16} className="text-gray-600" />
            Required PPE
          </h2>
          <ul className="flex flex-wrap gap-2">
            {ppe.map((p, i) => (
              <li
                key={i}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-sm text-gray-700"
              >
                {p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {emergency.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            <Siren size={16} className="text-red-600" />
            Emergency procedures
          </h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {emergency.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          <PenLine size={16} className="text-gray-600" />
          Signatures
        </h2>
        {signatures.length === 0 ? (
          <p className="text-sm text-gray-500">
            Not yet signed. SWMS documents are signed on site in the BossBoard mobile app.
          </p>
        ) : (
          <ul className="divide-y divide-border-light">
            {signatures.map((s, i) => (
              <li key={i} className="py-2 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {s.signedBy || s.role}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{s.role}</p>
                </div>
                <p className="text-sm text-gray-600">{formatDate(s.signedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/swms"
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
    >
      <ArrowLeft size={14} />
      Back to SWMS
    </Link>
  );
}
