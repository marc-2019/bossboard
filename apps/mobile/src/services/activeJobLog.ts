/**
 * Lets Job Details clock-out/delete drop Home's live job immediately.
 * Tabs stay mounted, so useFocusEffect alone is not enough.
 *
 * Clocked-out ids are suppressed at module scope so a remounted Home
 * still refuses that job. Instance-only suppress is not enough: the
 * clock-out notify can hit an old listener, and the new Home has an
 * empty Set.
 */

type Listener = (jobId?: string) => void;

const listeners = new Set<Listener>();
const suppressedJobIds = new Set<string>();

export function subscribeActiveJobInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isActiveJobLogSuppressed(jobId: string): boolean {
  return suppressedJobIds.has(jobId);
}

export function invalidateActiveJobLog(jobId?: string): void {
  if (jobId) suppressedJobIds.add(jobId);
  for (const listener of listeners) {
    listener(jobId);
  }
}

/** Test-only: module suppress survives remount; do not leak across cases. */
export function resetActiveJobLogSuppressionsForTests(): void {
  suppressedJobIds.clear();
}
