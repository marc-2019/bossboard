import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#1A2A44',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={withBackHeader('Settings')} />
      <Stack.Screen name="profile" options={withBackHeader('Edit Profile', { fallback: '/settings' })} />
      <Stack.Screen
        name="business-profile"
        options={withBackHeader('Business Profile', { fallback: '/settings' })}
      />
      <Stack.Screen
        name="bank-details"
        options={withBackHeader('Bank Details', { fallback: '/settings' })}
      />
      <Stack.Screen
        name="invite-mate"
        options={withBackHeader('Invite a mate', { fallback: '/settings' })}
      />
      <Stack.Screen
        name="feedback"
        options={withBackHeader('Send Feedback', { fallback: '/settings' })}
      />
    </Stack>
  );
}
