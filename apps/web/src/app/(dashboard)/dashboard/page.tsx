'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { jobLogsClient, statsClient, ApiError } from '@/lib/api-client';
import type { DashboardStats, JobLog } from '@bossboard/shared';
import { CalendarDays, ClipboardList, FileText, HardHat, Landmark, Loader2 } from 'lucide-react';

/** Render value for a stat card: number, dash placeholder while loading,
 *  or em-dash on error. Keeps the card height stable across states. */
function statValue(
  stats: DashboardStats | null,
  loading: boolean,
  pick: (s: DashboardStats) => number,
): string {
  if (loading) return '…';
  if (!stats) return '—';
  return pick(stats).toLocaleString();
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(async (signal?: AbortSignal) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await statsClient.dashboard();
      if (signal?.aborted) return;
      setStats(data.stats);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setStatsError(
        err instanceof ApiError ? err.message : 'Stats unavailable.',
      );
    } finally {
      if (!signal?.aborted) setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    jobLogsClient
      .list({ status: 'active' })
      .then((data) => {
        if (!cancelled) setJobs(data.jobLogs);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load jobs.');
        setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stats: load on mount and re-load when the tab regains focus so the
  // numbers don't go stale after a tradie creates an invoice in the mobile
  // app then flips back to the web dashboard.
  useEffect(() => {
    const controller = new AbortController();
    void loadStats(controller.signal);

    const onFocus = () => {
      void loadStats();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      controller.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [loadStats]);

  const loading = jobs === null && error === null;
  const isEmpty = jobs !== null && jobs.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm font-medium text-gray-500">SWMS This Month</p>
          <p
            className="text-2xl font-bold text-gray-900 mt-1"
            aria-live="polite"
            data-testid="stat-swms-this-month"
          >
            {statValue(stats, statsLoading, (s) => s.swms.thisMonth)}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
          <p
            className="text-2xl font-bold text-gray-900 mt-1"
            aria-live="polite"
            data-testid="stat-unpaid-invoices"
          >
            {statValue(stats, statsLoading, (s) => s.invoices.unpaid)}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Pending Quotes</p>
          <p
            className="text-2xl font-bold text-gray-900 mt-1"
            aria-live="polite"
            data-testid="stat-pending-quotes"
          >
            {statValue(stats, statsLoading, (s) => s.quotes.pending)}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Certifications</p>
          <p
            className="text-2xl font-bold text-gray-900 mt-1"
            aria-live="polite"
            data-testid="stat-certifications"
          >
            {statValue(stats, statsLoading, (s) => s.certifications.total)}
          </p>
        </Card>
      </div>

      {statsError && (
        <Card className="mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Stats unavailable. {statsError}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void loadStats();
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card className="mt-6">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {loading && (
        <Card className="mt-6">
          <div className="py-10 px-4 flex items-center justify-center text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading your jobs…</span>
          </div>
        </Card>
      )}

      {isEmpty && !error && (
        <Card className="mt-6">
          <div className="py-12 px-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-4">
              <HardHat size={32} className="text-accent" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Kia ora — let&apos;s get you set up
            </h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              Pick a tile to start running your trade business from the dashboard.
              You can always do more from the BossBoard mobile app.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
              <Link
                href="/job-logs"
                className="group block rounded-lg border border-border-light bg-white p-4 hover:border-primary-300 hover:shadow-sm transition"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary-50 mb-3">
                  <HardHat size={20} className="text-primary-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Log a job</h3>
                <p className="text-xs text-gray-600">
                  Track time on site, per-worker hours, and a full audit trail for billing.
                </p>
              </Link>
              <Link
                href="/swms"
                className="group block rounded-lg border border-border-light bg-white p-4 hover:border-primary-300 hover:shadow-sm transition"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary-50 mb-3">
                  <ClipboardList size={20} className="text-primary-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Draft a SWMS</h3>
                <p className="text-xs text-gray-600">
                  AI-assisted Safe Work Method Statement starting material — you stay the PCBU.
                </p>
              </Link>
              <Link
                href="/invoices/new"
                className="group block rounded-lg border border-border-light bg-white p-4 hover:border-primary-300 hover:shadow-sm transition"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary-50 mb-3">
                  <FileText size={20} className="text-primary-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Send an invoice</h3>
                <p className="text-xs text-gray-600">
                  Create a professional invoice with 15% GST built in and send it from your phone or the web.
                </p>
              </Link>
              <Link
                href="/bank"
                className="group block rounded-lg border border-border-light bg-white p-4 hover:border-primary-300 hover:shadow-sm transition"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary-50 mb-3">
                  <Landmark size={20} className="text-primary-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Reconcile bank</h3>
                <p className="text-xs text-gray-600">
                  Upload a bank CSV and match payments to unpaid invoices on web.
                </p>
              </Link>
            </div>
            <p className="text-xs text-gray-500 mt-6">
              <CalendarDays size={12} className="inline align-text-bottom mr-1" />
              No jobs on the go yet — your active jobs and stats will appear here as you start logging time.
            </p>
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <div className="py-6 px-4 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome to BossBoard web</h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            BossBoard is in beta. The web view shows your account dashboard;
            day-to-day features (SWMS, invoices, quotes, expenses, job logs,
            teams) live in the BossBoard mobile app.
          </p>
          <p className="text-sm text-gray-500 mt-3">
            App Store + Google Play release coming soon.
          </p>
        </div>
      </Card>
    </div>
  );
}
