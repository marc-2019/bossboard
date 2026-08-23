import { Stack } from 'expo-router';
import { withBackHeader } from '../../src/navigation/headerOptions';

export default function ProductsLayout() {
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
        options={withBackHeader('Products & Services', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="create"
        options={withBackHeader('New Product', { fallback: '/(tabs)/money' })}
      />
      <Stack.Screen
        name="[id]"
        options={withBackHeader('Product Details', { fallback: '/(tabs)/money' })}
      />
    </Stack>
  );
}
