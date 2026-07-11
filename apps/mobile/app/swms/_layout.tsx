import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function SwmsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="generate" options={withBackHeader('Generate SWMS')} />
      <Stack.Screen name="[id]" options={withBackHeader('SWMS Details')} />
    </Stack>
  );
}
