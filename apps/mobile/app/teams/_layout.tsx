import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function TeamsLayout() {
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
        options={withBackHeader('Team', { fallback: '/(tabs)/people' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Team Member', { fallback: '/(tabs)/people' })}
      />
    </Stack>
  );
}
