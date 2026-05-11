'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { jobLogsClient, ApiError } from '@/lib/api-client';
import type { JobLog, JobLogStatus } from '@bossboard/shared';
import { Clock } from 'lucide-react';

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
  }, [statusFilter]);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Job logs</h1>
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
      </div>

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
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  Clock in to a job from the BossBoard mobile app to track your time on site.
                  Completed logs show up here for billing and review.
                </p>
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

      {sorted.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {sorted.map((l) => {
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
