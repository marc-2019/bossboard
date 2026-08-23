import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function RecurringLayout() {
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
        options={withBackHeader('Recurring Invoices', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="create"
        options={withBackHeader('New Recurring Invoice', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="generate"
        options={withBackHeader('Generate Invoices', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Recurring Invoice', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
