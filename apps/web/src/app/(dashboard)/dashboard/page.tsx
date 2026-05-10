'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { jobLogsClient, ApiError } from '@/lib/api-client';
import type { JobLog } from '@bossboard/shared';
import { CalendarDays, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const loading = jobs === null && error === null;
  const isEmpty = jobs !== null && jobs.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm font-medium text-gray-500">SWMS This Month</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">-</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">-</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Pending Quotes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">-</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-500">Certifications</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">-</p>
        </Card>
      </div>

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
