/**
 * Lets Job Details clock-out/delete drop Home's live job immediately.
 * Tabs stay mounted, so useFocusEffect alone is not enough.
 *
 * Clocked-out ids are suppressed at module scope, keyed by user, so a
 * remounted Home still refuses that job for the same session. Instance-only
 * suppress is not enough: the clock-out notify can hit an old listener.
 * Logout / clearAuth must drop the set so a later user is not stuck.
 * This does not cover process-death or Fast Refresh.
 */

type Listener = (jobId?: string) => void;

const listeners = new Set<Listener>();
const suppressedJobIdsByOwner = new Map<string, Set<string>>();
let currentOwnerId: string | null = null;

function suppressSetForOwner(ownerId: string): Set<string> {
  let set = suppressedJobIdsByOwner.get(ownerId);
  if (!set) {
    set = new Set<string>();
    suppressedJobIdsByOwner.set(ownerId, set);
  }
  return set;
}

export function setActiveJobLogOwner(userId: string | null): void {
  currentOwnerId = userId;
}

export function subscribeActiveJobInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isActiveJobLogSuppressed(jobId: string): boolean {
  if (!currentOwnerId) return false;
  return suppressedJobIdsByOwner.get(currentOwnerId)?.has(jobId) ?? false;
}

export function hasSuppressedActiveJobLogs(): boolean {
  if (!currentOwnerId) return false;
  return (suppressedJobIdsByOwner.get(currentOwnerId)?.size ?? 0) > 0;
}

export function invalidateActiveJobLog(jobId?: string): void {
  if (jobId && currentOwnerId) {
    suppressSetForOwner(currentOwnerId).add(jobId);
  }
  for (const listener of listeners) {
    listener(jobId);
  }
}

export function clearActiveJobLogSuppressions(): void {
  suppressedJobIdsByOwner.clear();
  currentOwnerId = null;
}

/** Test-only: module suppress survives remount; do not leak across cases. */
export function resetActiveJobLogSuppressionsForTests(): void {
  clearActiveJobLogSuppressions();
}
