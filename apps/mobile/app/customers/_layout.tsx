import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function CustomersLayout() {
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
        options={withBackHeader('Customers', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="create"
        options={withBackHeader('New Customer', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Customer Details', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
