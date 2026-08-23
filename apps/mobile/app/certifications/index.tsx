/**
 * Certifications Index Screen
 * Lists all trade certifications with expiry status indicators
 * Navigates to add and detail screens
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
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { certificationsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

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

export default function CertificationsScreen() {
  const router = useRouter();
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'expiring' | 'expired'>('all');

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

  async function handleDelete(id: string, name: string) {
    Alert.alert(
      'Delete Certification',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await certificationsApi.delete(id);
              setCertifications((prev) => prev.filter((c) => c.id !== id));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete certification');
            }
          },
        },
      ]
    );
  }

  function getDaysUntilExpiry(dateString: string): number {
    const expiry = new Date(dateString);
    const now = new Date();
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  function getStatus(expiryDate: string | null): 'valid' | 'expiring' | 'expired' | 'unknown' {
    if (!expiryDate) return 'unknown';
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 30) return 'expiring';
    return 'valid';
  }

  function getStatusColor(expiryDate: string | null): string {
    if (!expiryDate) return '#6B7280';
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft < 0) return '#EF4444';
    if (daysLeft <= 30) return '#F59E0B';
    return '#10B981';
  }

  function getStatusText(expiryDate: string | null): string {
    if (!expiryDate) return 'No expiry';
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft < 0) return 'Expired';
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return '1 day left';
    return `${daysLeft} days left`;
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'No expiry set';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function getCertTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
    switch (type) {
      case 'electrical': return 'flash';
      case 'gas': return 'flame';
      case 'plumbing': return 'water';
      case 'lpg': return 'flame';
      case 'first_aid': return 'medkit';
      case 'site_safe': return 'shield-checkmark';
      default: return 'ribbon';
    }
  }

  function getCertTypeName(type: string): string {
    switch (type) {
      case 'electrical': return 'Electrical';
      case 'gas': return 'Gasfitting';
      case 'plumbing': return 'Plumbing';
      case 'lpg': return 'LPG';
      case 'first_aid': return 'First Aid';
      case 'site_safe': return 'Site Safe';
      default: return 'Other';
    }
  }

  const filteredCertifications = certifications.filter((cert) => {
    const matchesSearch =
      !searchQuery ||
      cert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cert.issuing_body && cert.issuing_body.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cert.cert_number && cert.cert_number.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' || getStatus(cert.expiry_date) === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: certifications.length,
    valid: certifications.filter((c) => getStatus(c.expiry_date) === 'valid').length,
    expiring: certifications.filter((c) => getStatus(c.expiry_date) === 'expiring').length,
    expired: certifications.filter((c) => getStatus(c.expiry_date) === 'expired').length,
  };

  function renderCertification({ item }: { item: Certification }) {
    const statusColor = getStatusColor(item.expiry_date);

    return (
      <TouchableOpacity
        style={styles.certCard}
        onPress={() => router.push(`/certifications/${item.id}` as any)}
        onLongPress={() => handleDelete(item.id, item.name)}
      >
        <View style={styles.certHeader}>
          <View style={styles.certIcon}>
            <Ionicons name={getCertTypeIcon(item.type)} size={24} color="#FF6B35" />
          </View>
          <View style={styles.certInfo}>
            <Text style={styles.certName}>{item.name}</Text>
            <Text style={styles.certType}>{getCertTypeName(item.type)}</Text>
            {item.issuing_body && (
              <Text style={styles.certIssuer}>{item.issuing_body}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
        </View>

        <View style={styles.detailRow}>
          {item.cert_number && (
            <View style={styles.detailItem}>
              <Ionicons name="document-text-outline" size={14} color="#9CA3AF" />
              <Text style={styles.detailText}>#{item.cert_number}</Text>
            </View>
          )}
          {item.issue_date && (
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
              <Text style={styles.detailText}>Issued: {formatDate(item.issue_date)}</Text>
            </View>
          )}
        </View>

        <View style={styles.expiryRow}>
          <View style={styles.expiryInfo}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={styles.expiryText}>
              {item.expiry_date ? `Expires: ${formatDate(item.expiry_date)}` : 'No expiry date'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {getStatusText(item.expiry_date)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const filters: { key: typeof statusFilter; label: string }[] = [
    { key: 'all', label: `All (${statusCounts.all})` },
    { key: 'valid', label: `Valid (${statusCounts.valid})` },
    { key: 'expiring', label: `Expiring (${statusCounts.expiring})` },
    { key: 'expired', label: `Expired (${statusCounts.expired})` },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.exitRow}>
        <InContentBack fallback="/(tabs)/people" />
      </View>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search certifications..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filter Chips */}
      <View style={styles.filterRow}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterChip,
              statusFilter === filter.key && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === filter.key && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredCertifications}
        keyExtractor={(item) => item.id}
        renderItem={renderCertification}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="ribbon-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {searchQuery || statusFilter !== 'all'
                ? 'No matching certifications'
                : 'No certifications added'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your trade licenses and certifications to track expiry dates'}
            </Text>
            {!searchQuery && statusFilter === 'all' && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/certifications/add' as any)}
              >
                <Text style={styles.emptyButtonText}>Add Certification</Text>
              </TouchableOpacity>
            )}
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
  exitRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 100,
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
    alignItems: 'center',
    marginBottom: 10,
  },
  certIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  certInfo: {
    flex: 1,
  },
  certName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  certType: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '500',
    marginTop: 1,
  },
  certIssuer: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
    paddingLeft: 56,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
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
    marginTop: 8,
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
