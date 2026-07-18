/**
 * Customer Detail Screen
 * Displays customer information with edit and delete actions
 */

import { useEffect, useState } from 'react';
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
import { safeGoBack } from '../../src/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { customersApi } from '../../src/services/api';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  default_payment_terms: number | null;
  default_include_gst: boolean;
  created_at: string;
  updated_at: string;
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadCustomer();
  }, [id]);

  async function loadCustomer() {
    try {
      const response = await customersApi.get(id);
      if (response.data.success) {
        setCustomer(response.data.data.customer);
      }
    } catch (error) {
      console.error('Failed to load customer:', error);
      Alert.alert('Error', 'Failed to load customer details');
    } finally {
      setIsLoading(false);
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Customer',
      'Are you sure you want to delete this customer? They will be marked as inactive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await customersApi.delete(id);
              if (response.data.success) {
                Alert.alert('Success', 'Customer deleted');
                safeGoBack(router, '/(tabs)');
              }
            } catch (error) {
              console.error('Failed to delete customer:', error);
              Alert.alert('Error', 'Failed to delete customer');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Customer not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => safeGoBack(router, '/(tabs)')}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {customer.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.customerName}>{customer.name}</Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: customer.is_active ? '#10B98120' : '#EF444420',
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: customer.is_active ? '#10B981' : '#EF4444' },
              ]}
            >
              {customer.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>

      {/* Contact Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact Details</Text>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="mail-outline" size={18} color="#6B7280" />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>
              {customer.email || 'Not provided'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="call-outline" size={18} color="#6B7280" />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>
              {customer.phone || 'Not provided'}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="location-outline" size={18} color="#6B7280" />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={styles.detailValue}>
              {customer.address || 'Not provided'}
            </Text>
          </View>
        </View>
      </View>

      {/* Invoice Defaults */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invoice Defaults</Text>

        <View style={styles.defaultsRow}>
          <Text style={styles.defaultsLabel}>Payment Terms</Text>
          <Text style={styles.defaultsValue}>
            {customer.default_payment_terms != null
              ? `${customer.default_payment_terms} days`
              : 'Not set'}
          </Text>
        </View>

        <View style={styles.defaultsRow}>
          <Text style={styles.defaultsLabel}>Include GST</Text>
          <Text style={styles.defaultsValue}>
            {customer.default_include_gst ? 'Yes (15%)' : 'No'}
          </Text>
        </View>
      </View>

      {/* Notes */}
      {customer.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.notes}>{customer.notes}</Text>
        </View>
      )}

      {/* Metadata */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Record Info</Text>

        <View style={styles.defaultsRow}>
          <Text style={styles.defaultsLabel}>Created</Text>
          <Text style={styles.defaultsValue}>
            {formatDate(customer.created_at)}
          </Text>
        </View>

        <View style={styles.defaultsRow}>
          <Text style={styles.defaultsLabel}>Last Updated</Text>
          <Text style={styles.defaultsValue}>
            {formatDate(customer.updated_at)}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push(`/customers/create?id=${id}` as any)}
          disabled={isProcessing}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Edit Customer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={isProcessing}
        >
          <Text style={styles.deleteButtonText}>Delete Customer</Text>
        </TouchableOpacity>
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#374151',
    marginTop: 12,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2563EB',
  },
  headerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
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
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
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
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  defaultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  defaultsLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  defaultsValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  notes: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  actionsContainer: {
    marginTop: 12,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    alignItems: 'center',
    padding: 12,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '500',
  },
});
