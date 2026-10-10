/**
 * Money Tab
 * Invoice list with status filtering
 * Future: Cashflow forecasting, Xero integration
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { invoicesApi } from '../../src/services/api';

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  due_date: string | null;
  created_at: string;
}

export default function MoneyScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [unpaidTotal, setUnpaidTotal] = useState(0);

  const loadInvoices = useCallback(async () => {
    try {
      const response = await invoicesApi.list({ status: statusFilter || undefined });
      if (response.data.success) {
        const invoiceList = response.data.data.invoices || [];
        setInvoices(invoiceList);

        // Calculate unpaid total
        const unpaid = invoiceList
          .filter((inv: Invoice) => inv.status === 'sent' || inv.status === 'overdue')
          .reduce((sum: number, inv: Invoice) => sum + inv.total, 0);
        setUnpaidTotal(unpaid);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadInvoices();
    }, [loadInvoices])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadInvoices();
    setIsRefreshing(false);
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'No due date';
    const civil = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.0+)?Z$)/.exec(dateString);
    if (civil) return `${civil[3]}/${civil[2]}/${civil[1]}`;
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return 'No due date';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'paid':
        return '#10B981';
      case 'sent':
        return '#FF6B35';
      case 'overdue':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'paid':
        return 'Paid';
      case 'sent':
        return 'Sent';
      case 'overdue':
        return 'Overdue';
      default:
        return 'Draft';
    }
  }

  const filteredInvoices = invoices.filter((inv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inv.client_name.toLowerCase().includes(query) ||
      inv.invoice_number.toLowerCase().includes(query)
    );
  });

  function renderInvoice({ item }: { item: Invoice }) {
    return (
      <TouchableOpacity
        style={styles.invoiceCard}
        onPress={() => router.push(`/invoices/${item.id}` as any)}
      >
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceInfo}>
            <Text style={styles.invoiceNumber}>{item.invoice_number}</Text>
            <Text style={styles.clientName}>{item.client_name}</Text>
          </View>
          <View style={styles.invoiceAmountContainer}>
            <Text style={styles.invoiceAmount}>{formatCurrency(item.total)}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item.status) + '20' },
              ]}
            >
              <Text
                style={[styles.statusText, { color: getStatusColor(item.status) }]}
              >
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.invoiceMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color="#6B7280" />
            <Text style={styles.metaText}>
              {item.status === 'paid' ? 'Paid' : `Due: ${formatDate(item.due_date)}`}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Unpaid Summary Card */}
      {unpaidTotal > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Text style={styles.summaryLabel}>Unpaid Invoices</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(unpaidTotal)}</Text>
          </View>
          <Ionicons name="trending-up" size={32} color="#FF6B35" />
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/customers/' as any)}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="people" size={20} color="#FF6B35" />
          </View>
          <Text style={styles.quickActionLabel}>Customers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/products/' as any)}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="cube" size={20} color="#10B981" />
          </View>
          <Text style={styles.quickActionLabel}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/recurring/' as any)}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="repeat" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.quickActionLabel}>Recurring</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/bank/' as any)}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#FDF2F8' }]}>
            <Ionicons name="card" size={20} color="#EC4899" />
          </View>
          <Text style={styles.quickActionLabel}>Bank</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/quotes/' as any)}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#F5F3FF' }]}>
            <Ionicons name="document-text" size={20} color="#8B5CF6" />
          </View>
          <Text style={styles.quickActionLabel}>Quotes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/expenses/' as any)}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="receipt" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.quickActionLabel}>Expenses</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search invoices..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9CA3AF"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterRow}>
        {['all', 'draft', 'sent', 'paid', 'overdue'].map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              (statusFilter === filter || (filter === 'all' && !statusFilter)) &&
                styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter === 'all' ? null : filter)}
          >
            <Text
              style={[
                styles.filterText,
                (statusFilter === filter || (filter === 'all' && !statusFilter)) &&
                  styles.filterTextActive,
              ]}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoice}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching invoices' : 'No invoices yet'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/invoices/create' as any)}
              >
                <Text style={styles.emptyButtonText}>Create Your First Invoice</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/invoices/create' as any)}
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
  summaryCard: {
    backgroundColor: '#EFF6FF',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E40AF',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    marginTop: 8,
    marginHorizontal: 0,
  },
  quickAction: {
    alignItems: 'center',
    gap: 4,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    marginTop: 0,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#111827',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
    flexWrap: 'wrap',
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
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  invoiceCard: {
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
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 2,
  },
  invoiceAmountContainer: {
    alignItems: 'flex-end',
  },
  invoiceAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  invoiceMeta: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
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
