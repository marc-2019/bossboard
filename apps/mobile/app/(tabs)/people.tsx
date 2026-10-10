/**
 * People Tab
 * Track trade licenses and certifications
 * Future: staff records are not on this screen.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { certificationsApi } from '../../src/services/api';

interface Certification {
  id: string;
  type: string;
  name: string;
  cert_number: string | null;
  issuing_body: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  created_at: string;
}

export default function PeopleScreen() {
  const router = useRouter();
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadCertifications = useCallback(async () => {
    try {
      const response = await certificationsApi.list();
      if (response.data.success) {
        setCertifications(response.data.data.certifications || []);
      }
    } catch (error) {
      console.error('Failed to load certifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCertifications();
    }, [loadCertifications])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadCertifications();
    setIsRefreshing(false);
  }

  function getStatusColor(expiryDate: string | null): string {
    if (!expiryDate) return '#6B7280';
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft < 0) return '#EF4444'; // Expired
    if (daysLeft <= 30) return '#F59E0B'; // Expiring soon
    return '#10B981'; // Valid
  }

  function getStatus(expiryDate: string | null): 'valid' | 'expiring' | 'expired' | 'unknown' {
    if (!expiryDate) return 'unknown';
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 30) return 'expiring';
    return 'valid';
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'No expiry set';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function getDaysUntilExpiry(dateString: string): number {
    const expiry = new Date(dateString);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getStatusText(expiryDate: string | null): string {
    if (!expiryDate) return 'No expiry';
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft < 0) return 'Expired';
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return '1 day left';
    return `${daysLeft} days left`;
  }

  function getCertTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
    switch (type) {
      case 'electrical':
        return 'flash';
      case 'gas':
        return 'flame';
      case 'plumbing':
        return 'water';
      case 'first_aid':
        return 'medkit';
      case 'site_safe':
        return 'shield-checkmark';
      default:
        return 'ribbon';
    }
  }

  function renderCertification({ item }: { item: Certification }) {
    const statusColor = getStatusColor(item.expiry_date);

    return (
      <TouchableOpacity
        style={styles.certCard}
        onPress={() => router.push(`/certifications/${item.id}` as any)}
      >
        <View style={styles.certHeader}>
          <View style={styles.certIcon}>
            <Ionicons name={getCertTypeIcon(item.type)} size={24} color="#FF6B35" />
          </View>
          <View style={styles.certInfo}>
            <Text style={styles.certName}>{item.name}</Text>
            {item.issuing_body && (
              <Text style={styles.certIssuer}>{item.issuing_body}</Text>
            )}
            {item.cert_number && (
              <Text style={styles.certNumber}>#{item.cert_number}</Text>
            )}
          </View>
        </View>

        <View style={styles.expiryRow}>
          <View style={styles.expiryInfo}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.expiryText}>
              {item.expiry_date ? `Expires: ${formatDate(item.expiry_date)}` : 'No expiry date'}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + '20' },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getStatusText(item.expiry_date)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={certifications}
        keyExtractor={(item) => item.id}
        renderItem={renderCertification}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Certifications</Text>
            <Text style={styles.sectionSubtitle}>
              Track your trade licenses and get expiry reminders
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="ribbon-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No certifications added</Text>
            <Text style={styles.emptySubtext}>
              Add your trade licenses and certifications to track expiry dates
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/certifications/add' as any)}
            >
              <Text style={styles.emptyButtonText}>Add Certification</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/certifications/add' as any)}
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
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  certCard: {
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
  certHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  certIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  certInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  certName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  certIssuer: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  certNumber: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  expiryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  expiryText: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 20,
  },
  emptyText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
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
