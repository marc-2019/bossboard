import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function ExpensesLayout() {
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
        options={withBackHeader('Expenses', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="create"
        options={withBackHeader('New Expense', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Expense Details', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
