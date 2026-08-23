/**
 * Lets Job Details clock-out/delete drop Home's live job immediately.
 * Tabs stay mounted, so useFocusEffect alone is not enough.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeActiveJobInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateActiveJobLog(): void {
  for (const listener of listeners) {
    listener();
  }
}
