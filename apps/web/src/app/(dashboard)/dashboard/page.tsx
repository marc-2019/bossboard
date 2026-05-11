'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { jobLogsClient, statsClient, ApiError } from '@/lib/api-client';
import type { DashboardStats, JobLog } from '@bossboard/shared';
import { CalendarDays, Loader2 } from 'lucide-react';

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
              <CalendarDays size={32} className="text-accent" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No jobs scheduled</h2>
            <p className="text-gray-600 max-w-md mx-auto mb-6">
              You don&apos;t have any jobs on the go yet. Create your first job to start
              tracking time, expenses, and SWMS against it.
            </p>
            <Link href="/job-logs">
              <Button variant="primary" size="lg" className="px-8">
                Create your first job
              </Button>
            </Link>
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
