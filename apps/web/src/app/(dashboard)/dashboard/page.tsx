'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { jobLogsClient, statsClient, ApiError } from '@/lib/api-client';
import type { JobLog, DashboardStats } from '@bossboard/shared';
import { CalendarDays, Clock, Shield, FileText, CheckCircle, AlertTriangle, Award } from 'lucide-react';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobLog[] | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    
    setLoading(true);
    
    Promise.all([
      jobLogsClient.list({ status: 'active' }),
      statsClient.dashboard()
    ])
      .then(([jobsData, statsData]) => {
        if (cancelled) return;
        setJobs(jobsData.jobLogs);
        setStats(statsData.stats);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load dashboard data.');
        setJobs([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isEmpty = jobs !== null && jobs.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {!isEmpty && !loading && (
          <Link href="/jobs/new">
            <Button variant="primary" size="sm">
              New Job
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">SWMS This Month</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats ? stats.swms.thisMonth : '-'}
              </p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <Shield size={20} className="text-blue-600" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats ? stats.invoices.unpaid : '-'}
              </p>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <FileText size={20} className="text-emerald-600" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Quotes</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats ? stats.quotes.pending : '-'}
              </p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <CheckCircle size={20} className="text-amber-600" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Certifications</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {stats ? stats.certifications.total : '-'}
              </p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <Award size={20} className="text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-100">
          <div className="flex items-center gap-3 text-red-800">
            <AlertTriangle size={20} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        </Card>
      )}

      {loading ? (
        <Card>
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading your dashboard...</p>
          </div>
        </Card>
      ) : isEmpty ? (
        <Card>
          <div className="py-12 px-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <CalendarDays size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No jobs scheduled</h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              You don&apos;t have any jobs on the go yet. Create your first job to start
              tracking time, expenses, and SWMS against it.
            </p>
            <Link href="/jobs/new">
              <Button variant="primary" size="lg" className="px-8">
                Create your first job
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Active Jobs</h2>
            <Link href="/job-logs" className="text-sm font-medium text-primary hover:underline">
              View all job logs
            </Link>
          </div>
          <Card className="!p-0 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {jobs!.map((job) => (
                <li key={job.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Clock size={20} className="text-emerald-600 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{job.description}</h3>
                        <p className="text-sm text-gray-500">
                          {job.siteAddress || 'No address specified'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">Active</p>
                      <p className="text-xs text-gray-500">
                        Started {new Date(job.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card className="bg-gray-50 border-dashed border-2">
        <div className="py-6 px-4 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome to BossBoard web</h2>
          <p className="text-gray-600 max-w-xl mx-auto text-sm">
            BossBoard is in beta. The web view shows your account dashboard;
            day-to-day features (SWMS, invoices, quotes, expenses, job logs,
            teams) live in the BossBoard mobile app.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-gray-200 text-gray-800">
              Beta v0.5.0
            </span>
            <span className="text-xs text-gray-500">
              App Store + Google Play release coming soon
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
