import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function InvoicesLayout() {
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
        name="create"
        options={withBackHeader('New Invoice', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Invoice', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="edit/[id]"
        options={withBackHeader('Edit Invoice', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
