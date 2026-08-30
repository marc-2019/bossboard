'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { swmsClient, ApiError } from '@/lib/api-client';
import type { TradeType, SWMSGenerateInput } from '@bossboard/shared';
import { useAuth } from '@/providers/auth-provider';
import {
  ArrowLeft,
  HardHat,
  Sparkles,
  Info,
  Zap,
  Droplet,
  Hammer,
  Leaf,
  Paintbrush,
  Wrench,
  Copy,
} from 'lucide-react';

const TRADE_OPTIONS: { id: TradeType; label: string; Icon: typeof Zap }[] = [
  { id: 'electrician', label: 'Electrician', Icon: Zap },
  { id: 'plumber', label: 'Plumber', Icon: Droplet },
  { id: 'builder', label: 'Builder', Icon: Hammer },
  { id: 'landscaper', label: 'Landscaper', Icon: Leaf },
  { id: 'painter', label: 'Painter', Icon: Paintbrush },
  { id: 'other', label: 'Other', Icon: Wrench },
];

const MIN_JOB_DESCRIPTION = 10;

const SWMS_PCBU_DISCLAIMER =
  'You remain the PCBU and must sign off for this site. This draft is not WorkSafe compliant, not affiliated with WorkSafe NZ, and not legal advice.';

export default function NewSwmsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const defaultTrade = (user?.tradeType as TradeType | undefined) ?? '';

  const [tradeType, setTradeType] = useState<TradeType | ''>(defaultTrade);
  const [jobDescription, setJobDescription] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('');
  const [useAI, setUseAI] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'generate' | 'copy'>('generate');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tradeType) {
      setError('Please select a trade type.');
      return;
    }
    const trimmedJob = jobDescription.trim();
    if (trimmedJob.length < MIN_JOB_DESCRIPTION) {
      setError(`Job description must be at least ${MIN_JOB_DESCRIPTION} characters.`);
      return;
    }

    const payload: SWMSGenerateInput = {
      tradeType,
      jobDescription: trimmedJob,
      useAI,
    };
    if (siteAddress.trim()) payload.siteAddress = siteAddress.trim();
    if (clientName.trim()) payload.clientName = clientName.trim();
    if (expectedDuration.trim()) payload.expectedDuration = expectedDuration.trim();

    setSubmitMode('generate');
    setSubmitting(true);
    try {
      const result = await swmsClient.generate(payload);
      router.push(`/swms/${result.swmsId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate SWMS.');
      setSubmitting(false);
    }
  };

  const handleCopyLast = async () => {
    setError(null);
    const payload: {
      jobDescription?: string;
      siteAddress?: string;
      clientName?: string;
      expectedDuration?: string;
    } = {};
    const trimmedJob = jobDescription.trim();
    if (trimmedJob.length >= MIN_JOB_DESCRIPTION) payload.jobDescription = trimmedJob;
    if (siteAddress.trim()) payload.siteAddress = siteAddress.trim();
    if (clientName.trim()) payload.clientName = clientName.trim();
    if (expectedDuration.trim()) payload.expectedDuration = expectedDuration.trim();

    setSubmitMode('copy');
    setSubmitting(true);
    try {
      const result = await swmsClient.copy(payload);
      router.push(`/swms/${result.swmsId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not copy last SWMS.');
      setSubmitting(false);
    }
  };

  // Prominent loading state — generation hits the AI provider and is slow.
  if (submitting) {
    return (
      <div className="max-w-3xl">
        <Card>
          <div className="py-16 flex flex-col items-center text-center">
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-5">
              <Sparkles size={28} className="text-accent animate-pulse" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {submitMode === 'copy' ? 'Copying last SWMS…' : 'Generating your SWMS…'}
            </h2>
            <p className="text-sm text-gray-600 max-w-md">
              {submitMode === 'copy'
                ? 'Cloning hazards and controls into a new draft. You remain the PCBU and must sign off. This draft is not WorkSafe compliant.'
                : useAI
                ? 'Our AI is identifying site-specific hazards and control measures for your job. This can take 15–30 seconds — please don’t close this page.'
                : 'Building your SWMS from the trade template. This will only take a moment.'}
            </p>
            <div className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/swms"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to SWMS
      </Link>

      <div className="flex items-center gap-2">
        <HardHat size={22} className="text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Generate SWMS</h1>
      </div>

      {error && (
        <Card>
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Trade type <span className="text-danger">*</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TRADE_OPTIONS.map(({ id, label, Icon }) => {
              const selected = tradeType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTradeType(id)}
                  aria-pressed={selected}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-3 py-4 transition-colors ${
                    selected
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-border-light bg-surface text-gray-600 hover:border-border'
                  }`}
                >
                  <Icon size={22} className={selected ? 'text-accent' : 'text-gray-500'} />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Job description <span className="text-danger">*</span>
          </h2>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Describe the work to be performed — the more detail, the better the AI hazard suggestions."
            rows={4}
            required
            className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">
            At least {MIN_JOB_DESCRIPTION} characters. {jobDescription.trim().length}/{MIN_JOB_DESCRIPTION}
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Job details (optional)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Site address"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="123 Main Street, Auckland"
            />
            <Input
              label="Client name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client or company name"
            />
            <Input
              label="Expected duration"
              value={expectedDuration}
              onChange={(e) => setExpectedDuration(e.target.value)}
              placeholder="e.g. 2 days, 1 week"
            />
          </div>
        </Card>

        <Card>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/50"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Sparkles size={15} className="text-accent" />
                AI-powered generation
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Get smart, site-specific hazard suggestions and control measures. Turn off
                to use the standard trade template only.
              </span>
            </span>
          </label>
        </Card>

        <div className="flex gap-3 flex-wrap">
          <Button type="submit" loading={submitting && submitMode === 'generate'}>
            <HardHat size={14} className="mr-2" />
            Generate SWMS
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={submitting && submitMode === 'copy'}
            onClick={handleCopyLast}
          >
            <Copy size={14} className="mr-2" />
            Copy last SWMS
          </Button>
          <Link
            href="/swms"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </Link>
        </div>

        <div className="flex items-start gap-2 text-xs text-gray-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          <p>{SWMS_PCBU_DISCLAIMER}</p>
        </div>
      </form>
    </div>
  );
}
