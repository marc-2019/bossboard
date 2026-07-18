/**
 * Certification Detail Screen
 * View an individual certification / trade licence with expiry status.
 *
 * Created 2026-07-01 to fix an iOS navigation dead-end: the People tab
 * (app/(tabs)/people.tsx) pushed to /certifications/[id], but this screen did
 * not exist, so tapping a certification landed on an unmatched route with no
 * way back. This screen is declared in app/_layout.tsx with headerShown:true so
 * it always carries a header back button.
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

const ORANGE = '#FF6B35';

const TYPE_LABELS: Record<string, string> = {
  electrical: 'Electrical',
  gas: 'Gas',
  plumbing: 'Plumbing',
  first_aid: 'First Aid',
  site_safe: 'Site Safe',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
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

function getDaysUntilExpiry(dateString: string): number {
  const diff = new Date(dateString).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getStatusColor(expiryDate: string | null): string {
  if (!expiryDate) return '#6B7280';
  const daysLeft = getDaysUntilExpiry(expiryDate);
  if (daysLeft < 0) return '#EF4444';
  if (daysLeft <= 30) return '#F59E0B';
  return '#10B981';
}

function getStatusText(expiryDate: string | null): string {
  if (!expiryDate) return 'No expiry set';
  const daysLeft = getDaysUntilExpiry(expiryDate);
  if (daysLeft < 0) return 'Expired';
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set';
  return new Date(dateString).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function CertificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [cert, setCert] = useState<Certification | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Always have a guaranteed way out: if there is nothing to go back to
  // (deep link, empty stack, navigation not yet settled), fall back to the
  // People tab instead of a no-op safeGoBack(router, '/(tabs)') that would re-trap the user.
  const safeBack = useCallback(() => {
    if (router.canGoBack()) safeGoBack(router, '/(tabs)');
    else router.replace('/(tabs)/people' as any);
  }, [router]);

  const loadCertification = useCallback(async () => {
    if (typeof id !== 'string' || !id) {
      safeBack();
      return;
    }
    try {
      const response = await certificationsApi.get(id);
      const body = response.data as any;
      if (body.success) {
        setCert(body.data.certification || body.data);
      } else {
        throw new Error('Not found');
      }
    } catch (error) {
      console.error('Failed to load certification:', error);
      Alert.alert('Error', 'Failed to load certification');
      safeBack();
    } finally {
      setIsLoading(false);
    }
  }, [id, safeBack]);

  useFocusEffect(
    useCallback(() => {
      loadCertification();
    }, [loadCertification])
  );

  function handleDelete() {
    Alert.alert(
      'Delete Certification',
      'Are you sure you want to delete this certification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await certificationsApi.delete(id as string);
              safeBack();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete certification');
            }
          },
        },
      ]
    );
  }

  if (isLoading || !cert) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
      </View>
    );
  }

  const statusColor = getStatusColor(cert.expiry_date);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.iconCircle}>
          <Ionicons name={getCertTypeIcon(cert.type)} size={28} color={ORANGE} />
        </View>
        <Text style={styles.name}>{cert.name}</Text>
        <Text style={styles.typeLabel}>{typeLabel(cert.type)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getStatusText(cert.expiry_date)}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailCard}>
        <DetailRow icon="pricetag" label="Type" value={typeLabel(cert.type)} />
        {cert.cert_number && (
          <DetailRow icon="barcode" label="Certificate number" value={cert.cert_number} />
        )}
        {cert.issuing_body && (
          <DetailRow icon="business" label="Issuing body" value={cert.issuing_body} />
        )}
        <DetailRow icon="calendar" label="Issue date" value={formatDate(cert.issue_date)} />
        <DetailRow icon="alarm" label="Expiry date" value={formatDate(cert.expiry_date)} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={styles.deleteText}>Delete Certification</Text>
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingBottom: 40 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  headerCard: {
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
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ORANGE + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  typeLabel: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  statusBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontSize: 14, fontWeight: '600' },
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
  detailIcon: { width: 32, alignItems: 'center', marginTop: 2 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  detailValue: { fontSize: 15, color: '#111827', marginTop: 2 },
  actions: { marginTop: 8 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
  },
  deleteText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
});
