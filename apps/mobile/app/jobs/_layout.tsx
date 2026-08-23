import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function JobsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={withBackHeader('Job Logs')} />
      <Stack.Screen name="create" options={withBackHeader('New Job')} />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Job Details', { fallback: '/(tabs)' })}
      />
    </Stack>
  );
}
