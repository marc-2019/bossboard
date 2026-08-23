/**
 * SWMS Detail Screen
 * View and sign SWMS document
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { swmsApi } from '../../src/services/api';
import PhotoAttachments from '../../src/components/PhotoAttachments';
import { InContentBack } from '../../src/components/InContentBack';

interface Hazard {
  id: string;
  hazard: string;
  risk_level: string;
  control_measures: string[];
}

interface SWMSDocument {
  id: string;
  title: string;
  trade_type: string;
  status: string;
  job_description: string;
  site_address: string | null;
  client_name: string | null;
  expected_duration: string | null;
  hazards: Hazard[];
  ppe_required: string[];
  emergency_procedures: string[];
  signatures: Array<{
    role: string;
    signed_at: string;
    signed_by: string;
  }>;
  created_at: string;
  updated_at: string;
}

export default function SWMSDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [document, setDocument] = useState<SWMSDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [id]);

  async function loadDocument() {
    try {
      const response = await swmsApi.get(id as string);
      if (response.data.success) {
        setDocument(response.data.data.document);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load document');
      router.back();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSign(role: 'worker' | 'supervisor') {
    Alert.alert(
      'Sign Document',
      `Sign as ${role}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign',
          onPress: async () => {
            setIsSigning(true);
            try {
              const response = await swmsApi.sign(
                id as string,
                'digital-signature',
                role
              );
              if (response.data.success) {
                Alert.alert('Success', 'Document signed successfully');
                loadDocument();
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Signing failed';
              Alert.alert('Error', message);
            } finally {
              setIsSigning(false);
            }
          },
        },
      ]
    );
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this SWMS?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await swmsApi.delete(id as string);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete document');
            }
          },
        },
      ]
    );
  }

  function getRiskColor(level: string): string {
    switch (level.toLowerCase()) {
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#10B981';
      default:
        return '#6B7280';
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/work" />
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!document) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/work" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <InContentBack fallback="/(tabs)/work" />
      <View style={styles.header}>
        <Text style={styles.title}>{document.title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="construct" size={14} color="#6B7280" />
            <Text style={styles.metaText}>{document.trade_type}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  document.status === 'signed' ? '#D1FAE5' : '#FEF3C7',
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: document.status === 'signed' ? '#059669' : '#D97706' },
              ]}
            >
              {document.status}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Job Details</Text>
        <View style={styles.card}>
          <Text style={styles.description}>{document.job_description}</Text>

          {document.site_address && (
            <View style={styles.detailRow}>
              <Ionicons name="location" size={16} color="#6B7280" />
              <Text style={styles.detailText}>{document.site_address}</Text>
            </View>
          )}

          {document.client_name && (
            <View style={styles.detailRow}>
              <Ionicons name="person" size={16} color="#6B7280" />
              <Text style={styles.detailText}>{document.client_name}</Text>
            </View>
          )}

          {document.expected_duration && (
            <View style={styles.detailRow}>
              <Ionicons name="time" size={16} color="#6B7280" />
              <Text style={styles.detailText}>{document.expected_duration}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Hazards & Controls ({document.hazards?.length || 0})
        </Text>
        {document.hazards?.map((hazard, index) => (
          <View key={hazard.id || index} style={styles.hazardCard}>
            <View style={styles.hazardHeader}>
              <Text style={styles.hazardTitle}>{hazard.hazard}</Text>
              <View
                style={[
                  styles.riskBadge,
                  { backgroundColor: getRiskColor(hazard.risk_level) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.riskText,
                    { color: getRiskColor(hazard.risk_level) },
                  ]}
                >
                  {hazard.risk_level}
                </Text>
              </View>
            </View>
            <Text style={styles.controlsLabel}>Control Measures:</Text>
            {hazard.control_measures?.map((control, i) => (
              <View key={i} style={styles.controlItem}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.controlText}>{control}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {document.ppe_required && document.ppe_required.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PPE Required</Text>
          <View style={styles.card}>
            <View style={styles.ppeGrid}>
              {document.ppe_required.map((ppe, index) => (
                <View key={index} style={styles.ppeItem}>
                  <Ionicons name="shield-checkmark" size={16} color="#2563EB" />
                  <Text style={styles.ppeText}>{ppe}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {document.signatures && document.signatures.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <View style={styles.card}>
            {document.signatures.map((sig, index) => (
              <View key={index} style={styles.signatureRow}>
                <Ionicons name="create" size={16} color="#10B981" />
                <View style={styles.signatureInfo}>
                  <Text style={styles.signatureRole}>
                    {sig.role.charAt(0).toUpperCase() + sig.role.slice(1)}
                  </Text>
                  <Text style={styles.signatureDate}>
                    Signed: {formatDate(sig.signed_at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <PhotoAttachments entityType="swms" entityId={id as string} editable={document.status !== 'signed'} />

      {/* After-job wedge: SWMS → invoice draft (Radar: small-crew admin loop) */}
      <View style={styles.afterJobCard}>
        <Text style={styles.afterJobTitle}>Finish the job</Text>
        <Text style={styles.afterJobBody}>
          Paperwork done — draft the invoice from this SWMS so you get paid without retyping the job.
        </Text>
        <TouchableOpacity
          style={styles.invoiceButton}
          testID="swms-invoice-this-job"
          onPress={() => {
            const params = new URLSearchParams();
            params.set('swmsId', id as string);
            if (document.client_name) params.set('clientName', document.client_name);
            if (document.job_description) {
              params.set('jobDescription', document.job_description.slice(0, 500));
            }
            if (document.site_address) {
              params.set('siteAddress', document.site_address.slice(0, 200));
            }
            router.push(`/invoices/create?${params.toString()}` as any);
          }}
        >
          <Ionicons name="receipt-outline" size={20} color="#fff" />
          <Text style={styles.invoiceButtonText}>Invoice this job</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        {document.status !== 'signed' && (
          <>
            <TouchableOpacity
              style={styles.signButton}
              onPress={() => handleSign('worker')}
              disabled={isSigning}
            >
              {isSigning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="create" size={20} color="#fff" />
                  <Text style={styles.signButtonText}>Sign as Worker</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.signButton, styles.supervisorButton]}
              onPress={() => handleSign('supervisor')}
              disabled={isSigning}
            >
              <Ionicons name="create" size={20} color="#2563EB" />
              <Text style={styles.supervisorButtonText}>Sign as Supervisor</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
          <Text style={styles.deleteButtonText}>Delete Document</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.timestamp}>
        Created: {formatDate(document.created_at)}
      </Text>
    </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  description: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  hazardCard: {
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
  hazardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  hazardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  riskText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  controlsLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  controlItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  controlText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  ppeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ppeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ppeText: {
    fontSize: 13,
    color: '#2563EB',
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  signatureInfo: {
    flex: 1,
  },
  signatureRole: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  signatureDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  afterJobCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  afterJobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 6,
  },
  afterJobBody: {
    fontSize: 14,
    color: '#1E40AF',
    marginBottom: 12,
    lineHeight: 20,
  },
  invoiceButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  invoiceButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  supervisorButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  supervisorButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  timestamp: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 16,
  },
});
