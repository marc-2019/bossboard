/**
 * Expense Detail Screen
 * View and edit an individual expense
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { safeGoBack } from '../../src/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { expensesApi } from '../../src/services/api';

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  vendor: string | null;
  isGstClaimable: boolean;
  gstAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  materials: { label: 'Materials', icon: 'construct', color: '#2563EB' },
  fuel: { label: 'Fuel', icon: 'car', color: '#F59E0B' },
  tools: { label: 'Tools', icon: 'hammer', color: '#8B5CF6' },
  subcontractor: { label: 'Subcontractor', icon: 'people', color: '#EC4899' },
  vehicle: { label: 'Vehicle', icon: 'car-sport', color: '#10B981' },
  office: { label: 'Office', icon: 'desktop', color: '#6366F1' },
  other: { label: 'Other', icon: 'ellipsis-horizontal', color: '#6B7280' },
};

export default function ExpenseDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadExpense();
    }, [id])
  );

  async function loadExpense() {
    try {
      const response = await expensesApi.get(id as string);
      if ((response.data as any).success) {
        setExpense((response.data as any).data.expense);
      }
    } catch (error) {
      console.error('Failed to load expense:', error);
      Alert.alert('Error', 'Failed to load expense');
      safeGoBack(router, '/(tabs)');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await expensesApi.delete(id as string);
              safeGoBack(router, '/(tabs)');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete expense');
            }
          },
        },
      ]
    );
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString: string): string {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  if (isLoading || !expense) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  const cat = CATEGORIES[expense.category] || CATEGORIES.other;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Amount Header */}
      <View style={styles.amountCard}>
        <View style={[styles.catBadge, { backgroundColor: cat.color + '15' }]}>
          <Ionicons name={cat.icon as any} size={24} color={cat.color} />
          <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
        </View>
        <Text style={styles.amount}>{formatCurrency(expense.amount)}</Text>
        {expense.isGstClaimable && (
          <View style={styles.gstRow}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.gstText}>
              GST claimable: {formatCurrency(expense.gstAmount)}
            </Text>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.detailCard}>
        <DetailRow icon="calendar" label="Date" value={formatDate(expense.date)} />
        {expense.description && (
          <DetailRow icon="document-text" label="Description" value={expense.description} />
        )}
        {expense.vendor && (
          <DetailRow icon="storefront" label="Vendor" value={expense.vendor} />
        )}
        <DetailRow
          icon="receipt"
          label="GST Claimable"
          value={expense.isGstClaimable ? 'Yes (15% GST included)' : 'No'}
        />
        {expense.notes && (
          <DetailRow icon="chatbox" label="Notes" value={expense.notes} />
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={styles.deleteText}>Delete Expense</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon as any} size={18} color="#6B7280" />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  amountCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  catLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
  },
  gstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  gstText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  detailRow: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailIcon: {
    width: 32,
    alignItems: 'center',
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    color: '#111827',
    marginTop: 2,
  },
  actions: {
    marginTop: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
});
