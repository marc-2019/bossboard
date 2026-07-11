/**
 * Shared Stack.Screen options that always show a back control.
 */

import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { BackButton } from '../components/BackButton';
import { colors } from '../theme/colors';

export function withBackHeader(
  title: string,
  opts?: {
    fallback?: string;
    headerTintColor?: string;
  }
): NativeStackNavigationOptions {
  const tint = opts?.headerTintColor ?? colors.primary;
  const fallback = opts?.fallback ?? '/(tabs)';
  return {
    headerShown: true,
    title,
    headerTintColor: tint,
    headerBackVisible: false, // we always supply our own so it's never missing
    headerLeft: () => <BackButton fallback={fallback} color={tint} />,
  };
}
