/**
 * Labeled in-content Back/Done. Nested-stack header back (including
 * withBackHeader on a layout) is not a usable device exit.
 */

import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { safeGoBack } from '../utils/navigation';

type Props = {
  fallback?: string;
  label?: string;
  accessibilityLabel?: string;
  color?: string;
  style?: ViewStyle;
  testID?: string;
};

export function InContentBack({
  fallback = '/(tabs)',
  label = 'Go back',
  accessibilityLabel,
  color = '#FF6B35',
  style,
  testID = 'in-content-back',
}: Props) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => safeGoBack(router, fallback)}
      style={[styles.row, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      testID={testID}
    >
      <Ionicons name="chevron-back" size={20} color={color} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
    marginBottom: 8,
    gap: 2,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
