/**
 * Lets Job Details clock-out/delete drop Home's live job immediately.
 * Tabs stay mounted, so useFocusEffect alone is not enough.
 *
 * Clocked-out ids and last-live are module-scope, keyed by user, so a
 * remounted Home still refuses that job and getActive fail stays
 * fail-visible. Logout / clearAuth / owner change drop suppress, last-live,
 * and Home's banner so a later user is not shown the prior Clock Out.
 * This does not cover process-death or Fast Refresh.
 */

export type LastLiveJobLog = {
  id: string;
  description: string;
  siteAddress: string | null;
  startTime: string;
};

type Listener = (jobId?: string) => void;

const listeners = new Set<Listener>();
const suppressedJobIdsByOwner = new Map<string, Set<string>>();
const lastLiveByOwner = new Map<string, LastLiveJobLog>();
let currentOwnerId: string | null = null;

function suppressSetForOwner(ownerId: string): Set<string> {
  let set = suppressedJobIdsByOwner.get(ownerId);
  if (!set) {
    set = new Set<string>();
    suppressedJobIdsByOwner.set(ownerId, set);
  }
  return set;
}

function notifyListeners(jobId?: string): void {
  for (const listener of listeners) {
    listener(jobId);
  }
}

export function setActiveJobLogOwner(userId: string | null): void {
  const changed = userId !== currentOwnerId;
  currentOwnerId = userId;
  if (changed) {
    notifyListeners();
  }
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

export function getLastLiveJob(): LastLiveJobLog | null {
  if (!currentOwnerId) return null;
  return lastLiveByOwner.get(currentOwnerId) ?? null;
}

export function rememberLastLiveJob(job: LastLiveJobLog | null): void {
  if (!currentOwnerId) return;
  if (job) {
    lastLiveByOwner.set(currentOwnerId, job);
  } else {
    lastLiveByOwner.delete(currentOwnerId);
  }
}

export function invalidateActiveJobLog(jobId?: string): void {
  if (jobId && currentOwnerId) {
    suppressSetForOwner(currentOwnerId).add(jobId);
  }
  notifyListeners(jobId);
}

export function clearActiveJobLogSuppressions(): void {
  suppressedJobIdsByOwner.clear();
  lastLiveByOwner.clear();
  currentOwnerId = null;
  notifyListeners();
}

/** Test-only: module suppress + last-live survive remount; do not leak across cases. */
export function resetActiveJobLogSuppressionsForTests(): void {
  suppressedJobIdsByOwner.clear();
  lastLiveByOwner.clear();
  currentOwnerId = null;
}
