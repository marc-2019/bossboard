'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { jobLogsClient, ApiError } from '@/lib/api-client';
import type { JobLog, JobLogStatus } from '@bossboard/shared';
import { Clock, Plus } from 'lucide-react';

type StatusFilter = JobLogStatus | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All jobs' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

const VALID_FILTERS: ReadonlySet<StatusFilter> = new Set(['all', 'active', 'completed']);

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw && VALID_FILTERS.has(raw as StatusFilter)) {
    return raw as StatusFilter;
  }
  return 'all';
}

const dateFmt = new Intl.DateTimeFormat('en-NZ', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-NZ', {
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
}

function formatDuration(start: string, end: string | null): string {
  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return '—';
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(endMs)) return '—';
  const totalMin = Math.max(0, Math.floor((endMs - startMs) / 60000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// Next.js 15: useSearchParams() must be wrapped in <Suspense> when used
// inside an App Router page that is statically prerendered. The inner
// component reads the search params; the default export wraps it in
// <Suspense> so the prerender can bail out to client-side rendering for
// the search-params-dependent portion only.
function JobLogsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusFilter = parseStatusFilter(searchParams.get('status'));

  const [logs, setLogs] = useState<JobLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobLog | null>(null);
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [clockingOut, setClockingOut] = useState(false);
  const [clockOutError, setClockOutError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const updateStatusFilter = useCallback(
    (next: StatusFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete('status');
      } else {
        params.set('status', next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLogs(null);
    setError(null);
    const params = statusFilter === 'all' ? undefined : { status: statusFilter };
    jobLogsClient
      .list(params)
      .then((data) => {
        if (!cancelled) setLogs(data.jobLogs);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load job logs.');
        setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, reloadKey]);

  // The currently clocked-in job is fetched independently of the status filter
  // so the clock-out banner is always available regardless of which list view
  // is selected.
  useEffect(() => {
    let cancelled = false;
    jobLogsClient
      .getActive()
      .then((data) => {
        if (!cancelled) setActiveJob(data.jobLog);
      })
      .catch(() => {
        if (!cancelled) setActiveJob(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleClockOut = useCallback(async () => {
    if (!activeJob) return;
    setClockOutError(null);
    setClockingOut(true);
    try {
      const notes = clockOutNotes.trim();
      await jobLogsClient.clockOut(activeJob.id, notes ? { notes } : {});
      setClockOutNotes('');
      refresh();
    } catch (err) {
      setClockOutError(
        err instanceof ApiError ? err.message : 'Could not clock out.',
      );
    } finally {
      setClockingOut(false);
    }
  }, [activeJob, clockOutNotes, refresh]);

  // Sort active first, then completed by start desc.
  const sorted = (logs || []).slice().sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });

  const activeCount = sorted.filter((l) => l.status === 'active').length;
  const totalMinutes = sorted
    .filter((l) => l.status === 'completed' && l.endTime)
    .reduce((sum, l) => {
      const start = new Date(l.startTime).getTime();
      const end = new Date(l.endTime!).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) return sum;
      return sum + Math.max(0, (end - start) / 60000);
    }, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = Math.round(totalMinutes % 60);

  // The currently clocked-in job is surfaced in the banner above with its own
  // clock-out action, so omit it from the list rows to avoid showing it twice.
  const listRows = activeJob ? sorted.filter((l) => l.id !== activeJob.id) : sorted;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Job logs</h1>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>Status</span>
            <select
              aria-label="Filter job logs by status"
              value={statusFilter}
              onChange={(e) => updateStatusFilter(e.target.value as StatusFilter)}
              className="rounded border border-border-light bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <Link
            href="/job-logs/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <Plus size={16} />
            Clock in
          </Link>
        </div>
      </div>

      {activeJob && (
        <Card className="mb-4 border border-emerald-200 bg-emerald-50/50">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Clocked in
                  </span>
                </div>
                <p className="text-base font-semibold text-gray-900 truncate">
                  {activeJob.description}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Started {formatDateTime(activeJob.startTime)}
                  {activeJob.siteAddress ? ` · ${activeJob.siteAddress}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-500">Elapsed</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatDuration(activeJob.startTime, null)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="clock-out-notes"
                  className="block text-xs font-medium text-gray-600"
                >
                  Notes (optional)
                </label>
                <input
                  id="clock-out-notes"
                  type="text"
                  value={clockOutNotes}
                  onChange={(e) => setClockOutNotes(e.target.value)}
                  placeholder="What did you get done?"
                  maxLength={2000}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-gray-900 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                />
              </div>
              <Button
                type="button"
                variant="danger"
                loading={clockingOut}
                onClick={handleClockOut}
              >
                <Clock size={16} className="mr-1.5" />
                Clock out
              </Button>
            </div>

            {clockOutError && <p className="text-sm text-danger">{clockOutError}</p>}
          </div>
        </Card>
      )}

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {logs === null && !error && (
        <Card>
          <p className="text-sm text-gray-500 py-8 text-center">Loading job logs…</p>
        </Card>
      )}

      {logs !== null && logs.length === 0 && !error && (
        <Card>
          <div className="py-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <Clock size={20} className="text-gray-500" />
            </div>
            {statusFilter === 'all' ? (
              <>
                <h2 className="text-base font-semibold text-gray-900 mb-1">No job logs yet</h2>
                <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
                  Clock in to a job to track your time on site. Completed logs show up here
                  for billing and review.
                </p>
                <Link
                  href="/job-logs/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  <Plus size={16} />
                  Clock in
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  No {statusFilter} job logs
                </h2>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  Try a different status filter to see other job logs.
                </p>
              </>
            )}
          </div>
        </Card>
      )}

      {sorted.length > 0 && (
        <Card className="mb-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-500">Active now</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{activeCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Logged time</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">
                {totalHours}h {totalMins}m
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total logs</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{sorted.length}</p>
            </div>
          </div>
        </Card>
      )}

      {listRows.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {listRows.map((l) => {
              const active = l.status === 'active';
              return (
                <li key={l.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {l.description}
                      </span>
                      {active && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      Started {formatDateTime(l.startTime)}
                      {l.siteAddress ? ` · ${l.siteAddress}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatDuration(l.startTime, l.endTime)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {active ? 'in progress' : `Ended ${formatDateTime(l.endTime)}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function JobLogsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Job logs</h1>
          </div>
          <Card>
            <p className="text-sm text-gray-500 py-8 text-center">Loading job logs…</p>
          </Card>
        </div>
      }
    >
      <JobLogsPageContent />
    </Suspense>
  );
}
