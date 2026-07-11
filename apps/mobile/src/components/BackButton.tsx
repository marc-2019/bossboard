/**
 * Always-visible back/close control for stack screens.
 * Use in Stack.Screen headerLeft or as an in-content header.
 */

import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { safeGoBack } from '../utils/navigation';

type Props = {
  fallback?: string;
  color?: string;
  style?: ViewStyle;
  /** Use close icon when this is a modal-like flow */
  variant?: 'back' | 'close';
};

export function BackButton({
  fallback = '/(tabs)',
  color = '#FF6B35',
  style,
  variant = 'back',
}: Props) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => safeGoBack(router, fallback)}
      style={[styles.btn, style]}
      accessibilityRole="button"
      accessibilityLabel={variant === 'close' ? 'Close' : 'Go back'}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      testID="screen-back-button"
    >
      <Ionicons
        name={variant === 'close' ? 'close' : 'chevron-back'}
        size={28}
        color={color}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
