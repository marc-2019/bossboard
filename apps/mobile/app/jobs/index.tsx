/**
 * Job Logs List Screen
 * Browse, filter, and manage time-tracked job logs
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
import { jobLogsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface JobLog {
  id: string;
  description: string;
  siteAddress: string | null;
  customerId: string | null;
  startTime: string;
  endTime: string | null;
  status: 'active' | 'completed';
  notes: string | null;
}

interface JobLogStats {
  totalLogs: number;
  thisWeek: number;
  activeLog: boolean;
  totalHoursThisWeek: number;
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

export default function JobLogsListScreen() {
  const router = useRouter();
  const [jobLogs, setJobLogs] = useState<JobLog[]>([]);
  const [stats, setStats] = useState<JobLogStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        jobLogsApi.list({ status: statusFilter || undefined }),
        jobLogsApi.getStats(),
      ]);

      if ((logsRes.data as any).success) {
        setJobLogs((logsRes.data as any).data.jobLogs || []);
      }
      if ((statsRes.data as any).success) {
        setStats((statsRes.data as any).data.stats);
      }
    } catch (error) {
      console.error('Failed to load job logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

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

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
    });
  }

  function getDuration(start: string, end: string | null): string {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function renderJobLog({ item }: { item: JobLog }) {
    const isActive = item.status === 'active';

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => router.push(`/jobs/${item.id}` as any)}
      >
        <View style={[styles.statusDot, isActive && styles.statusDotActive]} />
        <View style={styles.logInfo}>
          <Text style={styles.logDescription} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.logMeta}>
            {formatDate(item.startTime)} {formatTime(item.startTime)}
            {item.endTime ? ` - ${formatTime(item.endTime)}` : ''}
            {item.siteAddress ? ` \u00b7 ${item.siteAddress}` : ''}
          </Text>
        </View>
        <View style={styles.logRight}>
          <Text style={[styles.logDuration, isActive && styles.logDurationActive]}>
            {getDuration(item.startTime, item.endTime)}
          </Text>
          {isActive && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)" color="#0D9488" />
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.exitRow}>
        <InContentBack fallback="/(tabs)" color="#0D9488" />
      </View>
      {/* Weekly Summary */}
      {stats && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>This Week</Text>
              <Text style={styles.summaryAmount}>{stats.totalHoursThisWeek}h</Text>
              <Text style={styles.summaryCount}>{stats.thisWeek} logs</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Logs</Text>
              <Text style={styles.summaryAmount}>{stats.totalLogs}</Text>
              <Text style={styles.summaryCount}>
                {stats.activeLog ? 'Currently active' : 'all time'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Status Filters */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterChip,
              (statusFilter === filter.key || (filter.key === 'all' && !statusFilter)) &&
                styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.key === 'all' ? null : filter.key)}
          >
            <Text
              style={[
                styles.filterText,
                (statusFilter === filter.key || (filter.key === 'all' && !statusFilter)) &&
                  styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Job Logs List */}
      <FlatList
        data={jobLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderJobLog}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="timer-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No job logs yet</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/jobs/create' as any)}
            >
              <Text style={styles.emptyButtonText}>Clock In to Your First Job</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/jobs/create' as any)}
      >
        <Ionicons name="timer" size={24} color="#fff" />
        <Text style={styles.fabText}>Clock In</Text>
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
    backgroundColor: '#F0FDFA',
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
    backgroundColor: '#99F6E4',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#134E4A',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#134E4A',
    marginTop: 2,
  },
  summaryCount: {
    fontSize: 11,
    color: '#0F766E',
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
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#0D9488',
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
  logCard: {
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
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D1D5DB',
    marginRight: 12,
  },
  statusDotActive: {
    backgroundColor: '#0D9488',
  },
  logInfo: {
    flex: 1,
  },
  logDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  logMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  logRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  logDuration: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  logDurationActive: {
    color: '#0D9488',
  },
  liveBadge: {
    backgroundColor: '#0D948815',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
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
    backgroundColor: '#0D9488',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#0D9488',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
