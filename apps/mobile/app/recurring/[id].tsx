/**
 * Recurring Invoice Detail Screen
 * Shows full detail of a recurring invoice template with actions
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
import { Ionicons } from '@expo/vector-icons';
import { recurringInvoicesApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface LineItem {
  id: string;
  product_name: string;
  description: string;
  unit_price: number;
  quantity: number;
  type: 'fixed' | 'variable';
}

interface RecurringInvoice {
  id: string;
  name: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  day_of_month: number;
  is_active: boolean;
  is_auto_generate: boolean;
  include_gst: boolean;
  payment_terms: number;
  notes: string | null;
  line_items: LineItem[];
  next_generation_date: string | null;
  last_generated_at: string | null;
  created_at: string;
}

export default function RecurringInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [recurring, setRecurring] = useState<RecurringInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadRecurringInvoice();
  }, [id]);

  async function loadRecurringInvoice() {
    try {
      const response = await recurringInvoicesApi.get(id);
      if (response.data.success) {
        setRecurring(response.data.data.recurringInvoice);
      }
    } catch (error) {
      console.error('Failed to load recurring invoice:', error);
      Alert.alert('Error', 'Failed to load recurring invoice');
    } finally {
      setIsLoading(false);
    }
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
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

  function calculateSubtotal(): number {
    if (!recurring) return 0;
    return recurring.line_items.reduce(
      (sum, item) => sum + item.unit_price * (item.quantity || 1),
      0
    );
  }

  function calculateGst(): number {
    if (!recurring?.include_gst) return 0;
    return Math.round(calculateSubtotal() * 0.15);
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateGst();
  }

  function hasVariableItems(): boolean {
    if (!recurring) return false;
    return recurring.line_items.some((item) => item.type === 'variable');
  }

  async function handleGenerateNow() {
    if (!recurring) return;

    if (hasVariableItems()) {
      router.push(`/recurring/generate?id=${recurring.id}` as any);
      return;
    }

    Alert.alert(
      'Generate Invoice',
      'Create a draft invoice from this template now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await recurringInvoicesApi.generate(recurring.id);
              if (response.data.success) {
                const invoiceId = response.data.data.invoice?.id;
                Alert.alert('Success', 'Draft invoice generated successfully', [
                  {
                    text: 'View Invoice',
                    onPress: () => {
                      if (invoiceId) {
                        router.push(`/invoices/${invoiceId}` as any);
                      }
                    },
                  },
                  { text: 'OK' },
                ]);
              }
            } catch (error) {
              console.error('Failed to generate invoice:', error);
              Alert.alert('Error', 'Failed to generate invoice. Please try again.');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  async function handleToggleActive() {
    if (!recurring) return;

    const newStatus = !recurring.is_active;
    const action = newStatus ? 'Resume' : 'Pause';

    Alert.alert(
      `${action} Recurring Invoice`,
      newStatus
        ? 'Resume automatic generation for this template?'
        : 'Pause automatic generation for this template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await recurringInvoicesApi.update(recurring.id, {
                isActive: newStatus,
              });
              if (response.data.success) {
                setRecurring({
                  ...recurring,
                  is_active: newStatus,
                });
              }
            } catch (error) {
              console.error('Failed to update recurring invoice:', error);
              Alert.alert('Error', 'Failed to update status');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  async function handleDelete() {
    if (!recurring) return;

    Alert.alert(
      'Delete Recurring Invoice',
      'Are you sure you want to delete this recurring invoice template? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await recurringInvoicesApi.delete(recurring.id);
              if (response.data.success) {
                Alert.alert('Success', 'Recurring invoice deleted');
                router.back();
              }
            } catch (error) {
              console.error('Failed to delete recurring invoice:', error);
              Alert.alert('Error', 'Failed to delete recurring invoice');
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
        <InContentBack fallback="/(tabs)/money" />
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!recurring) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Recurring invoice not found</Text>
        <InContentBack fallback="/(tabs)/money" />
      </View>
    );
  }

  const isVariable = hasVariableItems();
  const day = recurring.day_of_month;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <InContentBack fallback="/(tabs)/money" />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerName}>{recurring.name}</Text>
          <View style={styles.headerBadges}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: recurring.is_active ? '#ECFDF5' : '#F3F4F6',
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: recurring.is_active ? '#10B981' : '#9CA3AF',
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color: recurring.is_active ? '#059669' : '#6B7280',
                  },
                ]}
              >
                {recurring.is_active ? 'Active' : 'Paused'}
              </Text>
            </View>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isVariable ? '#FFFBEB' : '#ECFDF5',
                },
              ]}
            >
              <Ionicons
                name={isVariable ? 'create-outline' : 'checkmark-circle-outline'}
                size={14}
                color={isVariable ? '#D97706' : '#059669'}
              />
              <Text
                style={[
                  styles.typeBadgeText,
                  {
                    color: isVariable ? '#D97706' : '#059669',
                  },
                ]}
              >
                {isVariable ? 'Review' : 'Auto'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Customer Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <View style={styles.customerRow}>
          <View style={styles.customerAvatar}>
            <Text style={styles.customerAvatarText}>
              {recurring.customer_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.customerName}>{recurring.customer_name}</Text>
            {recurring.customer_email && (
              <Text style={styles.customerEmail}>{recurring.customer_email}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Schedule Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Schedule</Text>
        <View style={styles.scheduleRow}>
          <Ionicons name="calendar" size={20} color="#2563EB" />
          <Text style={styles.scheduleText}>
            Generates on the {day}{getOrdinalSuffix(day)} of each month
          </Text>
        </View>
        {recurring.next_generation_date && (
          <View style={styles.scheduleRow}>
            <Ionicons name="time-outline" size={20} color="#6B7280" />
            <Text style={styles.scheduleDetail}>
              Next: {formatDate(recurring.next_generation_date)}
            </Text>
          </View>
        )}
        {recurring.last_generated_at && (
          <View style={styles.scheduleRow}>
            <Ionicons name="checkmark-done-outline" size={20} color="#10B981" />
            <Text style={styles.scheduleDetail}>
              Last generated: {formatDate(recurring.last_generated_at)}
            </Text>
          </View>
        )}
        <View style={styles.scheduleRow}>
          <Ionicons name="receipt-outline" size={20} color="#6B7280" />
          <Text style={styles.scheduleDetail}>
            Payment terms: {recurring.payment_terms} days
          </Text>
        </View>
      </View>

      {/* Line Items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Line Items</Text>
        {recurring.line_items.map((item) => (
          <View key={item.id} style={styles.lineItem}>
            <View style={styles.lineItemLeft}>
              <View style={styles.lineItemNameRow}>
                <Text style={styles.lineItemName} numberOfLines={1}>
                  {item.product_name || item.description}
                </Text>
                <View
                  style={[
                    styles.lineItemTypeBadge,
                    {
                      backgroundColor:
                        item.type === 'variable' ? '#FFFBEB' : '#ECFDF5',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.lineItemTypeText,
                      {
                        color:
                          item.type === 'variable' ? '#D97706' : '#059669',
                      },
                    ]}
                  >
                    {item.type === 'variable' ? 'Variable' : 'Fixed'}
                  </Text>
                </View>
              </View>
              {item.description && item.description !== item.product_name && (
                <Text style={styles.lineItemDesc} numberOfLines={1}>
                  {item.description}
                </Text>
              )}
              <Text style={styles.lineItemMeta}>
                {formatCurrency(item.unit_price)} x {item.quantity || 1}
              </Text>
            </View>
            <Text style={styles.lineItemAmount}>
              {formatCurrency(item.unit_price * (item.quantity || 1))}
            </Text>
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCurrency(calculateSubtotal())}</Text>
        </View>

        {recurring.include_gst && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST (15%)</Text>
            <Text style={styles.totalValue}>{formatCurrency(calculateGst())}</Text>
          </View>
        )}

        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(calculateTotal())}</Text>
        </View>
      </View>

      {/* Notes */}
      {recurring.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.notesText}>{recurring.notes}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleGenerateNow}
          disabled={isProcessing}
        >
          <Ionicons name="flash" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Generate Now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push(`/recurring/create?id=${recurring.id}` as any)}
          disabled={isProcessing}
        >
          <Ionicons name="create-outline" size={20} color="#2563EB" />
          <Text style={styles.secondaryButtonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            {
              borderColor: recurring.is_active ? '#F59E0B' : '#10B981',
            },
          ]}
          onPress={handleToggleActive}
          disabled={isProcessing}
        >
          <Ionicons
            name={recurring.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
            size={20}
            color={recurring.is_active ? '#F59E0B' : '#10B981'}
          />
          <Text
            style={[
              styles.secondaryButtonText,
              { color: recurring.is_active ? '#F59E0B' : '#10B981' },
            ]}
          >
            {recurring.is_active ? 'Pause' : 'Resume'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={isProcessing}
        >
          <Text style={styles.deleteButtonText}>Delete Recurring Invoice</Text>
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
  // Header
  header: {
    marginBottom: 16,
  },
  headerTop: {
    gap: 12,
  },
  headerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Card
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
  // Customer
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563EB',
  },
  customerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  customerEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  // Schedule
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  scheduleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  scheduleDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  // Line items
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  lineItemLeft: {
    flex: 1,
    marginRight: 12,
  },
  lineItemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  lineItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    flexShrink: 1,
  },
  lineItemTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lineItemTypeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lineItemDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  lineItemMeta: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  lineItemAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 2,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 15,
    color: '#374151',
  },
  grandTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  // Notes
  notesText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  // Actions
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
  secondaryButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563EB',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#2563EB',
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
