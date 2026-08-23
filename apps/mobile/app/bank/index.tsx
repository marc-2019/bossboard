/**
 * Bank Transactions Screen
 * Lists bank transactions with reconciliation status,
 * summary card, and auto-match functionality.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { bankTransactionsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  payment_reference: string | null;
  running_balance: number | null;
  is_reconciled: boolean;
  matched_invoice_id: string | null;
  match_confidence: 'high' | 'medium' | 'low' | null;
  upload_batch_id: string | null;
  source_filename: string | null;
  created_at: string;
}

interface BankSummary {
  total: number;
  reconciled: number;
  unreconciled: number;
  total_credits: number;
  total_debits: number;
}

type FilterValue = 'all' | 'unreconciled' | 'reconciled';

export default function BankTransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const listParams: { isReconciled?: boolean } = {};
      if (filter === 'reconciled') listParams.isReconciled = true;
      if (filter === 'unreconciled') listParams.isReconciled = false;

      const [transactionsRes, summaryRes] = await Promise.all([
        bankTransactionsApi.list(listParams),
        bankTransactionsApi.getSummary(),
      ]);

      if (transactionsRes.data.success) {
        setTransactions(transactionsRes.data.data.transactions || []);
      }
      if (summaryRes.data.success) {
        setSummary(summaryRes.data.data.summary || null);
      }
    } catch (error) {
      console.error('Failed to load bank transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

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

  async function handleAutoMatch() {
    setIsAutoMatching(true);
    try {
      const response = await bankTransactionsApi.autoMatch();
      if (response.data.success) {
        const result = response.data.data;
        Alert.alert(
          'Auto-Match Complete',
          `Matched ${result.matched || 0} transaction${(result.matched || 0) !== 1 ? 's' : ''} to invoices.`,
          [{ text: 'OK' }]
        );
        await loadData();
      }
    } catch (error) {
      console.error('Auto-match failed:', error);
      Alert.alert('Error', 'Auto-match failed. Please try again.');
    } finally {
      setIsAutoMatching(false);
    }
  }

  async function handleConfirmMatch(id: string) {
    setActionLoading(id);
    try {
      const response = await bankTransactionsApi.confirmMatch(id);
      if (response.data.success) {
        await loadData();
      }
    } catch (error) {
      console.error('Failed to confirm match:', error);
      Alert.alert('Error', 'Failed to confirm match. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnmatch(id: string) {
    Alert.alert(
      'Remove Match',
      'Are you sure you want to remove this invoice match?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(id);
            try {
              const response = await bankTransactionsApi.unmatch(id);
              if (response.data.success) {
                await loadData();
              }
            } catch (error) {
              console.error('Failed to unmatch:', error);
              Alert.alert('Error', 'Failed to remove match. Please try again.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }

  function formatCurrency(cents: number): string {
    return '$' + (Math.abs(cents) / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function getConfidenceColor(confidence: string | null): string {
    switch (confidence) {
      case 'high':
        return '#10B981';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  }

  function getConfidenceLabel(confidence: string | null): string {
    switch (confidence) {
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return 'Unknown';
    }
  }

  function renderSummaryCard() {
    if (!summary) return null;

    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{summary.total}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>
              {summary.reconciled}
            </Text>
            <Text style={styles.summaryLabel}>Reconciled</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
              {summary.unreconciled}
            </Text>
            <Text style={styles.summaryLabel}>Unreconciled</Text>
          </View>
        </View>
        <View style={styles.summaryAmounts}>
          <View style={styles.summaryAmountItem}>
            <Ionicons name="arrow-down-circle" size={16} color="#10B981" />
            <Text style={[styles.summaryAmountText, { color: '#10B981' }]}>
              {formatCurrency(summary.total_credits)} in
            </Text>
          </View>
          <View style={styles.summaryAmountItem}>
            <Ionicons name="arrow-up-circle" size={16} color="#EF4444" />
            <Text style={[styles.summaryAmountText, { color: '#EF4444' }]}>
              {formatCurrency(summary.total_debits)} out
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function renderTransaction({ item }: { item: BankTransaction }) {
    const isCredit = item.amount > 0;
    const isMatched = !!item.matched_invoice_id;
    const isLoadingAction = actionLoading === item.id;

    return (
      <View style={styles.transactionCard}>
        <View style={styles.transactionHeader}>
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
            <Text style={styles.transactionDescription} numberOfLines={2}>
              {item.description || item.payment_reference || 'No description'}
            </Text>
          </View>
          <View style={styles.transactionAmountContainer}>
            <Text
              style={[
                styles.transactionAmount,
                { color: isCredit ? '#10B981' : '#EF4444' },
              ]}
            >
              {isCredit ? '+' : '-'}{formatCurrency(item.amount)}
            </Text>
          </View>
        </View>

        {/* Status badges */}
        <View style={styles.transactionFooter}>
          {item.is_reconciled ? (
            <View style={[styles.badge, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={[styles.badgeText, { color: '#059669' }]}>
                Reconciled
              </Text>
            </View>
          ) : isMatched ? (
            <View style={styles.matchInfo}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: getConfidenceColor(item.match_confidence) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: getConfidenceColor(item.match_confidence) },
                  ]}
                >
                  {getConfidenceLabel(item.match_confidence)} match
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Action buttons for matched but not reconciled */}
        {isMatched && !item.is_reconciled && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.confirmButton]}
              onPress={() => handleConfirmMatch(item.id)}
              disabled={isLoadingAction}
            >
              {isLoadingAction ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.unmatchButton]}
              onPress={() => handleUnmatch(item.id)}
              disabled={isLoadingAction}
            >
              <Ionicons name="close" size={16} color="#EF4444" />
              <Text style={styles.unmatchButtonText}>Remove Match</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/money" />
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.exitRow}>
        <InContentBack fallback="/(tabs)/money" />
      </View>
      {renderSummaryCard()}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => router.push('/bank/upload' as any)}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.uploadButtonText}>Upload CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.autoMatchButton, isAutoMatching && styles.autoMatchButtonDisabled]}
          onPress={handleAutoMatch}
          disabled={isAutoMatching}
        >
          {isAutoMatching ? (
            <ActivityIndicator size="small" color="#FF6B35" />
          ) : (
            <Ionicons name="git-compare-outline" size={18} color="#FF6B35" />
          )}
          <Text style={styles.autoMatchButtonText}>
            {isAutoMatching ? 'Matching...' : 'Auto-Match'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {(['all', 'unreconciled', 'reconciled'] as FilterValue[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterChip,
              filter === f && styles.filterChipActive,
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transaction List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {filter !== 'all'
                ? `No ${filter} transactions`
                : 'No bank transactions yet'}
            </Text>
            {filter === 'all' && (
              <Text style={styles.emptySubtext}>
                Upload a Wise CSV to get started.
              </Text>
            )}
            {filter === 'all' && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/bank/upload' as any)}
              >
                <Text style={styles.emptyButtonText}>Upload CSV</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
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
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  summaryAmounts: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  summaryAmountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryAmountText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Action Buttons
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  autoMatchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  autoMatchButtonDisabled: {
    opacity: 0.7,
  },
  autoMatchButtonText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
  },

  // Filter Row
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#FF6B35',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#fff',
  },

  // Transaction List
  listContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  transactionCard: {
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
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 20,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  transactionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  matchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  confirmButton: {
    backgroundColor: '#FF6B35',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  unmatchButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  unmatchButtonText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 4,
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
