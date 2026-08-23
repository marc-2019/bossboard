import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function BankLayout() {
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
        options={withBackHeader('Bank Transactions', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="upload"
        options={withBackHeader('Upload Statement', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
