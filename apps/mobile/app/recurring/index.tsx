/**
 * Recurring Invoices List Screen
 * Shows all recurring invoice templates with pending generation banner
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
import { recurringInvoicesApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface LineItem {
  id: string;
  description: string;
  unit_price: number;
  quantity: number;
  type: 'fixed' | 'variable';
}

interface RecurringInvoice {
  id: string;
  name: string;
  customer_name: string;
  day_of_month: number;
  is_active: boolean;
  is_auto_generate: boolean;
  include_gst: boolean;
  line_items: LineItem[];
  created_at: string;
}

interface PendingInfo {
  autoGenerate: RecurringInvoice[];
  needsInput: RecurringInvoice[];
}

export default function RecurringInvoicesListScreen() {
  const router = useRouter();
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [pending, setPending] = useState<PendingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [listResponse, pendingResponse] = await Promise.all([
        recurringInvoicesApi.list(),
        recurringInvoicesApi.getPending(),
      ]);

      if (listResponse.data.success) {
        setRecurringInvoices(listResponse.data.data.recurringInvoices || []);
      }

      if (pendingResponse.data.success) {
        const pendingData = pendingResponse.data.data;
        setPending({
          autoGenerate: pendingData.autoGenerate || [],
          needsInput: pendingData.needsInput || [],
        });
      }
    } catch (error) {
      console.error('Failed to load recurring invoices:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  function calculateTotal(items: LineItem[]): number {
    return items.reduce((sum, item) => sum + item.unit_price * (item.quantity || 1), 0);
  }

  function hasVariableItems(items: LineItem[]): boolean {
    return items.some((item) => item.type === 'variable');
  }

  function getOrdinalSuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  const hasPending = pending && (pending.autoGenerate.length > 0 || pending.needsInput.length > 0);

  function renderPendingBanner() {
    if (!hasPending || !pending) return null;

    const autoCount = pending.autoGenerate.length;
    const inputCount = pending.needsInput.length;

    return (
      <View style={styles.pendingBanner}>
        <View style={styles.pendingIconContainer}>
          <Ionicons name="alert-circle" size={24} color="#F59E0B" />
        </View>
        <View style={styles.pendingContent}>
          <Text style={styles.pendingTitle}>Invoices Due for Generation</Text>
          <View style={styles.pendingCounts}>
            {autoCount > 0 && (
              <View style={styles.pendingCountRow}>
                <View style={[styles.pendingDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.pendingCountText}>
                  {autoCount} ready to auto-generate
                </Text>
              </View>
            )}
            {inputCount > 0 && (
              <View style={styles.pendingCountRow}>
                <View style={[styles.pendingDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.pendingCountText}>
                  {inputCount} need{inputCount === 1 ? 's' : ''} your input
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  function renderRecurringInvoice({ item }: { item: RecurringInvoice }) {
    const total = calculateTotal(item.line_items);
    const isVariable = hasVariableItems(item.line_items);
    const day = item.day_of_month;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/recurring/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.cardCustomer} numberOfLines={1}>{item.customer_name}</Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <Text style={styles.cardAmount}>{formatCurrency(total)}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: item.is_active ? '#ECFDF5' : '#F3F4F6' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: item.is_active ? '#10B981' : '#9CA3AF' },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: item.is_active ? '#059669' : '#6B7280' },
                ]}
              >
                {item.is_active ? 'Active' : 'Paused'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="#6B7280" />
              <Text style={styles.metaText}>
                {day}{getOrdinalSuffix(day)} of each month
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="list-outline" size={14} color="#6B7280" />
              <Text style={styles.metaText}>
                {item.line_items.length} item{item.line_items.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: isVariable ? '#FFFBEB' : '#ECFDF5' },
              ]}
            >
              <Ionicons
                name={isVariable ? 'create-outline' : 'checkmark-circle-outline'}
                size={12}
                color={isVariable ? '#D97706' : '#059669'}
              />
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: isVariable ? '#D97706' : '#059669' },
                ]}
              >
                {isVariable ? 'Review' : 'Auto'}
              </Text>
            </View>
            {item.include_gst && (
              <View style={styles.gstBadge}>
                <Text style={styles.gstBadgeText}>+GST</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/money" />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.exitRow}>
        <InContentBack fallback="/(tabs)/money" />
      </View>
      <FlatList
        data={recurringInvoices}
        keyExtractor={(item) => item.id}
        renderItem={renderRecurringInvoice}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderPendingBanner}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="repeat-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Recurring Invoices</Text>
            <Text style={styles.emptyText}>
              Set up templates that automatically generate invoices each month
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/recurring/create' as any)}
            >
              <Text style={styles.emptyButtonText}>Create Your First Recurring Invoice</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/recurring/create' as any)}
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
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  pendingBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingIconContainer: {
    marginTop: 2,
  },
  pendingContent: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  pendingCounts: {
    gap: 6,
  },
  pendingCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pendingCountText: {
    fontSize: 13,
    color: '#78350F',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  cardCustomer: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardMeta: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  gstBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gstBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF6B35',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 20,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
