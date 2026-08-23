import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function QuotesLayout() {
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
        options={withBackHeader('Quotes', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="create"
        options={withBackHeader('New Quote', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Quote Details', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
