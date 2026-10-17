import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

/**
 * expo-router route error boundary for the Teams group: a render error in
 * any Teams screen shows this instead of crashing the app.
 *
 * The fallback is required lazily so this layout module stays free of
 * react-native imports; layout-config tests (nested-layout-exits) load it
 * with only expo-router mocked.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { RouteErrorFallback } =
    require('../../src/components/RouteErrorFallback') as typeof import('../../src/components/RouteErrorFallback');
  return (
    <RouteErrorFallback error={error} retry={retry} label="teams" fallbackHref="/(tabs)/people" />
  );
}

export default function TeamsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={withBackHeader('Team', { fallback: '/(tabs)/people' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Team Member', { fallback: '/(tabs)/people' })}
      />
    </Stack>
  );
}
