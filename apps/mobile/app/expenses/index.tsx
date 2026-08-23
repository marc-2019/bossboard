/**
 * Expenses List Screen
 * Browse, search, and filter expenses with monthly totals
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { expensesApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  vendor: string | null;
  isGstClaimable: boolean;
  gstAmount: number;
}

interface ExpenseStats {
  thisMonth: number;
  thisMonthAmount: number;
  gstClaimable: number;
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'materials', label: 'Materials', icon: 'construct', color: '#FF6B35' },
  { key: 'fuel', label: 'Fuel', icon: 'car', color: '#F59E0B' },
  { key: 'tools', label: 'Tools', icon: 'hammer', color: '#8B5CF6' },
  { key: 'subcontractor', label: 'Subbie', icon: 'people', color: '#EC4899' },
  { key: 'vehicle', label: 'Vehicle', icon: 'car-sport', color: '#10B981' },
  { key: 'office', label: 'Office', icon: 'desktop', color: '#6366F1' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#6B7280' },
];

function getCategoryConfig(key: string) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

export default function ExpensesListScreen() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [expenseRes, statsRes] = await Promise.all([
        expensesApi.list({ category: categoryFilter || undefined }),
        expensesApi.getStats(),
      ]);

      if ((expenseRes.data as any).success) {
        setExpenses((expenseRes.data as any).data.expenses || []);
      }
      if ((statsRes.data as any).success) {
        setStats((statsRes.data as any).data.stats);
      }
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString: string): string {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
    });
  }

  function renderExpense({ item }: { item: Expense }) {
    const cat = getCategoryConfig(item.category);
    return (
      <TouchableOpacity
        style={styles.expenseCard}
        onPress={() => router.push(`/expenses/${item.id}` as any)}
      >
        <View style={[styles.categoryIcon, { backgroundColor: (cat.color || '#6B7280') + '15' }]}>
          <Ionicons name={(cat.icon || 'ellipsis-horizontal') as any} size={20} color={cat.color || '#6B7280'} />
        </View>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseDescription} numberOfLines={1}>
            {item.description || item.vendor || cat.label}
          </Text>
          <Text style={styles.expenseMeta}>
            {formatDate(item.date)}
            {item.vendor ? ` · ${item.vendor}` : ''}
            {item.isGstClaimable ? ' · GST' : ''}
          </Text>
        </View>
        <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/money" color="#F59E0B" />
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.exitRow}>
        <InContentBack fallback="/(tabs)/money" color="#F59E0B" />
      </View>
      {/* Monthly Summary */}
      {stats && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>This Month</Text>
              <Text style={styles.summaryAmount}>{formatCurrency(stats.thisMonthAmount)}</Text>
              <Text style={styles.summaryCount}>{stats.thisMonth} expenses</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>GST Claimable</Text>
              <Text style={[styles.summaryAmount, { color: '#10B981' }]}>
                {formatCurrency(stats.gstClaimable)}
              </Text>
              <Text style={styles.summaryCount}>this month</Text>
            </View>
          </View>
        </View>
      )}

      {/* Category Filters */}
      <View style={styles.filterRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.filterChip,
              (categoryFilter === cat.key || (cat.key === 'all' && !categoryFilter)) &&
                styles.filterChipActive,
            ]}
            onPress={() => setCategoryFilter(cat.key === 'all' ? null : cat.key)}
          >
            <Text
              style={[
                styles.filterText,
                (categoryFilter === cat.key || (cat.key === 'all' && !categoryFilter)) &&
                  styles.filterTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Expense List */}
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderExpense}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No expenses yet</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/expenses/create' as any)}
            >
              <Text style={styles.emptyButtonText}>Add Your First Expense</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/expenses/create' as any)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  exitRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  summaryCard: {
    backgroundColor: '#FFFBEB',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 48,
    backgroundColor: '#FDE68A',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 2,
  },
  summaryCount: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#F59E0B',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  expenseMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
