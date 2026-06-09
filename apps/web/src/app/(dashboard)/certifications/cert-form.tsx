'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, type CertificationType, type CreateCertificationInput } from '@/lib/api-client';
import {
  ArrowLeft,
  Award,
  Zap,
  Flame,
  Droplet,
  HeartPulse,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** The 7 certification types, matching the mobile add-cert grid. */
const CERT_TYPES: { id: CertificationType; label: string; icon: LucideIcon }[] = [
  { id: 'electrical', label: 'Electrical', icon: Zap },
  { id: 'gas', label: 'Gas', icon: Flame },
  { id: 'plumbing', label: 'Plumbing', icon: Droplet },
  { id: 'lpg', label: 'LPG', icon: Flame },
  { id: 'first_aid', label: 'First Aid', icon: HeartPulse },
  { id: 'site_safe', label: 'Site Safe', icon: ShieldCheck },
  { id: 'other', label: 'Other', icon: Award },
];

// Default name per type — copied from mobile getDefaultName for parity.
export function getDefaultName(type: CertificationType): string {
  switch (type) {
    case 'electrical':
      return 'Electrical Registration';
    case 'gas':
      return 'Gasfitter Registration';
    case 'plumbing':
      return 'Plumber Registration';
    case 'lpg':
      return 'LPG Fitter Certificate';
    case 'first_aid':
      return 'First Aid Certificate';
    case 'site_safe':
      return 'Site Safe Passport';
    default:
      return '';
  }
}

// Default issuing body per type — copied from mobile getDefaultIssuingBody for parity.
export function getDefaultIssuingBody(type: CertificationType): string {
  switch (type) {
    case 'electrical':
      return 'Electrical Workers Registration Board';
    case 'gas':
    case 'plumbing':
      return 'Plumbers, Gasfitters and Drainlayers Board';
    case 'lpg':
      return 'Energy Safety';
    case 'first_aid':
      return 'St John';
    case 'site_safe':
      return 'Site Safe NZ';
    default:
      return '';
  }
}

export interface CertFormInitial {
  type: CertificationType | null;
  name: string;
  certNumber: string;
  issuingBody: string;
  issueDate: string;
  expiryDate: string;
}

export const emptyCertForm: CertFormInitial = {
  type: null,
  name: '',
  certNumber: '',
  issuingBody: '',
  issueDate: '',
  expiryDate: '',
};

interface CertFormProps {
  heading: string;
  submitLabel: string;
  initial: CertFormInitial;
  /** Receives the cleaned payload; should persist then navigate away. */
  onSubmit: (payload: CreateCertificationInput) => Promise<void>;
}

/** Normalize an ISO/date value into a YYYY-MM-DD string for <input type="date">. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function CertForm({ heading, submitLabel, initial, onSubmit }: CertFormProps) {
  const [type, setType] = useState<CertificationType | null>(initial.type);
  const [name, setName] = useState(initial.name);
  const [certNumber, setCertNumber] = useState(initial.certNumber);
  const [issuingBody, setIssuingBody] = useState(initial.issuingBody);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [expiryDate, setExpiryDate] = useState(initial.expiryDate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = (next: CertificationType) => {
    setType(next);
    // Only auto-fill empty fields, mirroring the mobile behaviour.
    if (!name.trim()) setName(getDefaultName(next));
    if (!issuingBody.trim()) setIssuingBody(getDefaultIssuingBody(next));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!type) {
      setError('Please select a certification type.');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Certification name is required.');
      return;
    }

    const payload: CreateCertificationInput = {
      type,
      name: trimmedName,
    };
    if (certNumber.trim()) payload.certNumber = certNumber.trim();
    if (issuingBody.trim()) payload.issuingBody = issuingBody.trim();
    if (issueDate) payload.issueDate = issueDate;
    if (expiryDate) payload.expiryDate = expiryDate;

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not save certification.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/certifications"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to certifications
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>

      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Certification type
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CERT_TYPES.map((t) => {
              const Icon = t.icon;
              const selected = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTypeSelect(t.id)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 px-3 py-4 transition-colors ${
                    selected
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${
                      selected ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      selected ? 'text-accent' : 'text-gray-700'
                    }`}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Details
          </h2>
          <div className="space-y-4">
            <Input
              label="Certification name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Electrical Registration"
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Certificate number (optional)"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="e.g. EW12345"
              />
              <Input
                label="Issuing body (optional)"
                value={issuingBody}
                onChange={(e) => setIssuingBody(e.target.value)}
                placeholder="e.g. Electrical Workers Registration Board"
              />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Dates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Issue date (optional)"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <Input
              label="Expiry date (optional)"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            We&apos;ll remind you before the certification expires.
          </p>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
          <Link
            href="/certifications"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
