import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function CertificationsLayout() {
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
        options={withBackHeader('Certifications', { fallback: '/(tabs)/people' })}
      />
      <Stack.Screen
        name="add"
        options={withBackHeader('Add Certification', { fallback: '/(tabs)/people' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Certification Details', { fallback: '/(tabs)/people' })}
      />
    </Stack>
  );
}
