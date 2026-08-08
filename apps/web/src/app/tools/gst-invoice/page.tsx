'use client';

/**
 * Public GST invoice draft helper → funnel to BossBoard register.
 * Claim-safe: calculator/layout helper only (see GST_TOOL_DISCLAIMER).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  computeGstTotals,
  formatNzdFromCents,
  parseDollars,
  GST_TOOL_DISCLAIMER,
  type GstLineInput,
} from '../../../lib/gstInvoice';

export default function GstInvoiceToolPage() {
  const [businessName, setBusinessName] = useState('');
  const [clientName, setClientName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [includeGst, setIncludeGst] = useState(true);
  const [lines, setLines] = useState<{ description: string; amount: string }[]>([
    { description: 'Labour', amount: '' },
    { description: '', amount: '' },
  ]);

  const lineInputs: GstLineInput[] = useMemo(
    () =>
      lines
        .filter((l) => l.description.trim() || parseDollars(l.amount) > 0)
        .map((l) => ({
          description: l.description.trim() || 'Item',
          amountDollars: parseDollars(l.amount),
        })),
    [lines]
  );

  const totals = useMemo(
    () => computeGstTotals(lineInputs, includeGst),
    [lineInputs, includeGst]
  );

  function updateLine(i: number, patch: Partial<{ description: string; amount: string }>) {
    setLines((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: '', amount: '' }]);
  }

  function printDraft() {
    window.print();
  }

  return (
    <div className="gst-tool">
      <style jsx global>{`
        .gst-tool {
          font-family: system-ui, -apple-system, Segoe UI, sans-serif;
          max-width: 720px;
          margin: 0 auto;
          padding: 24px 16px 64px;
          color: #111827;
        }
        .gst-tool h1 {
          font-size: 1.75rem;
          margin: 0 0 8px;
        }
        .gst-tool .muted {
          color: #6b7280;
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .gst-tool .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px;
          margin: 16px 0;
          background: #fff;
        }
        .gst-tool label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .gst-tool input[type='text'],
        .gst-tool input[type='number'] {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          margin-bottom: 12px;
          font-size: 1rem;
        }
        .gst-tool .row {
          display: grid;
          grid-template-columns: 1fr 120px;
          gap: 8px;
        }
        .gst-tool .totals {
          font-size: 1rem;
          line-height: 1.8;
        }
        .gst-tool .disclaimer {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e3a8a;
          border-radius: 10px;
          padding: 12px;
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .gst-tool .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }
        .gst-tool button,
        .gst-tool .btn {
          appearance: none;
          border: none;
          border-radius: 10px;
          padding: 12px 16px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          font-size: 0.95rem;
        }
        .gst-tool .btn-primary {
          background: #2563eb;
          color: #fff;
        }
        .gst-tool .btn-secondary {
          background: #f3f4f6;
          color: #111827;
        }
        .gst-tool .btn-accent {
          background: #059669;
          color: #fff;
        }
        .gst-tool nav a {
          color: #2563eb;
          text-decoration: none;
          font-weight: 600;
        }
        @media print {
          .gst-tool .no-print {
            display: none !important;
          }
          .gst-tool {
            max-width: 100%;
          }
        }
      `}</style>

      <nav className="no-print" style={{ marginBottom: 16 }}>
        <Link href="/">← BossBoard</Link>
      </nav>

      <h1>NZ GST invoice draft helper</h1>
      <p className="muted">
        Quick 15% GST totals and a printable draft for sole traders and small crews. Save proper
        invoices, SWMS and customers in BossBoard.
      </p>

      <div className="disclaimer no-print">{GST_TOOL_DISCLAIMER}</div>

      <div className="card" id="invoice-draft">
        <label>Your business name</label>
        <input
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="e.g. Smith Electrical Ltd"
        />
        <label>Client name</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client or site contact"
        />
        <label>Job description</label>
        <input
          type="text"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="What you did"
        />

        <label className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={includeGst}
            onChange={(e) => setIncludeGst(e.target.checked)}
          />
          Add GST at 15% (amounts exclusive of GST)
        </label>

        <p style={{ fontWeight: 600, marginTop: 16 }}>Line items</p>
        {lines.map((line, i) => (
          <div className="row" key={i}>
            <div>
              <label className="no-print">Description</label>
              <input
                type="text"
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="Description"
              />
            </div>
            <div>
              <label className="no-print">Amount ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={line.amount}
                onChange={(e) => updateLine(i, { amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary no-print" onClick={addLine}>
          + Add line
        </button>

        <div className="totals" style={{ marginTop: 20 }}>
          <div>
            <strong>From:</strong> {businessName || '—'}
          </div>
          <div>
            <strong>Bill to:</strong> {clientName || '—'}
          </div>
          {jobDescription ? (
            <div>
              <strong>Job:</strong> {jobDescription}
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            Subtotal: {formatNzdFromCents(totals.subtotalCents)}
          </div>
          <div>GST{includeGst ? ' (15%)' : ''}: {formatNzdFromCents(totals.gstCents)}</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
            Total: {formatNzdFromCents(totals.totalCents)}
          </div>
        </div>
      </div>

      <div className="actions no-print">
        <button type="button" className="btn btn-secondary" onClick={printDraft}>
          Print / Save as PDF
        </button>
        <Link href="/register" className="btn btn-accent">
          Save invoices in BossBoard (free during beta)
        </Link>
        <Link href="/login" className="btn btn-primary">
          Sign in
        </Link>
      </div>

      <p className="muted no-print" style={{ marginTop: 24 }}>
        Need SWMS + invoice after the job? BossBoard links them for NZ tradie crews.
      </p>
    </div>
  );
}
