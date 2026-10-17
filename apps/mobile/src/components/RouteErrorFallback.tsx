import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { safeGoBack } from '../utils/navigation';

interface Props {
  error: Error;
  /** expo-router's retry: clears the error and re-mounts the route, so its data loaders run again. */
  retry: () => Promise<void>;
  /** Sentry tag for the route group that failed. */
  label: string;
  /** Where "Go back" lands when there is no history to pop. */
  fallbackHref: string;
}

/**
 * Fallback for an expo-router route `ErrorBoundary` export.
 * The nested stack header is not rendered while the boundary is shown,
 * so this screen must carry its own way out.
 */
export function RouteErrorFallback({ error, retry, label, fallbackHref }: Props) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: label } });
  }, [error, label]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  }

  function handleGoBack() {
    // safeGoBack also survives canGoBack() throwing while the navigator is degraded.
    safeGoBack(router, fallbackHref);
  }

  return (
    <View style={styles.wrap} testID="route-error-fallback">
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>This screen hit an error. You can reload it or go back.</Text>
      <TouchableOpacity
        style={styles.primary}
        onPress={handleRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Reload this screen"
      >
        <Text style={styles.primaryText}>{retrying ? 'Reloading…' : 'Reload'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondary}
        onPress={handleGoBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.secondaryText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 16 },
  primary: { backgroundColor: '#FF6B35', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginBottom: 12 },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: { paddingHorizontal: 20, paddingVertical: 10 },
  secondaryText: { color: '#FF6B35', fontWeight: '600' },
});
