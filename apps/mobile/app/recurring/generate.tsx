/**
 * Generate Invoice from Recurring Template Screen
 * Prompts user for variable amounts before generating a draft invoice
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { recurringInvoicesApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface LineItem {
  id: string;
  product_service_id: string;
  product_name: string;
  description: string;
  unit_price: number;
  quantity: number;
  type: 'fixed' | 'variable';
}

interface RecurringInvoice {
  id: string;
  name: string;
  customer_name: string;
  include_gst: boolean;
  line_items: LineItem[];
}

interface LastAmounts {
  [productServiceId: string]: number;
}

interface VariableAmountEntry {
  lineItemId: string;
  productServiceId: string;
  amount: string;
  lastAmount: number | null;
}

export default function GenerateInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [recurring, setRecurring] = useState<RecurringInvoice | null>(null);
  const [lastAmounts, setLastAmounts] = useState<LastAmounts>({});
  const [variableAmounts, setVariableAmounts] = useState<VariableAmountEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [detailResponse, lastAmountsResponse] = await Promise.all([
        recurringInvoicesApi.get(id),
        recurringInvoicesApi.getLastAmounts(id),
      ]);

      if (detailResponse.data.success) {
        const recurringData = detailResponse.data.data.recurringInvoice;
        setRecurring(recurringData);

        let lastAmountsMap: LastAmounts = {};
        if (lastAmountsResponse.data.success) {
          lastAmountsMap = lastAmountsResponse.data.data.lastAmounts || {};
          setLastAmounts(lastAmountsMap);
        }

        // Initialize variable amounts from line items
        const variableItems = (recurringData.line_items || [])
          .filter((item: LineItem) => item.type === 'variable')
          .map((item: LineItem) => ({
            lineItemId: item.id,
            productServiceId: item.product_service_id,
            amount: '',
            lastAmount: lastAmountsMap[item.product_service_id] ?? null,
          }));

        setVariableAmounts(variableItems);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load recurring invoice details');
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

  function parseAmount(amountStr: string): number {
    const cleaned = amountStr.replace(/[^0-9.]/g, '');
    const dollars = parseFloat(cleaned) || 0;
    return Math.round(dollars * 100);
  }

  function updateVariableAmount(lineItemId: string, value: string) {
    setVariableAmounts(
      variableAmounts.map((entry) =>
        entry.lineItemId === lineItemId ? { ...entry, amount: value } : entry
      )
    );
  }

  function getVariableAmountCents(lineItemId: string): number {
    const entry = variableAmounts.find((e) => e.lineItemId === lineItemId);
    if (!entry || !entry.amount) return 0;
    return parseAmount(entry.amount);
  }

  function calculateSubtotal(): number {
    if (!recurring) return 0;
    return recurring.line_items.reduce((sum, item) => {
      if (item.type === 'variable') {
        const variableCents = getVariableAmountCents(item.id);
        return sum + variableCents * (item.quantity || 1);
      }
      return sum + item.unit_price * (item.quantity || 1);
    }, 0);
  }

  function calculateGst(): number {
    if (!recurring?.include_gst) return 0;
    return Math.round(calculateSubtotal() * 0.15);
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateGst();
  }

  async function handleGenerate() {
    if (!recurring) return;

    // Validate that all variable amounts have been entered
    const missingAmounts = variableAmounts.filter((entry) => {
      const cents = parseAmount(entry.amount);
      return cents <= 0;
    });

    if (missingAmounts.length > 0) {
      Alert.alert('Missing Amounts', 'Please enter amounts for all variable line items');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build variableAmounts map: productServiceId -> amount in cents
      const amountsMap: Record<string, number> = {};
      for (const entry of variableAmounts) {
        amountsMap[entry.productServiceId] = parseAmount(entry.amount);
      }

      const response = await recurringInvoicesApi.generate(recurring.id, amountsMap);

      if (response.data.success) {
        const invoiceId = response.data.data.invoice?.id;
        Alert.alert('Success', 'Draft invoice generated successfully', [
          {
            text: 'View Invoice',
            onPress: () => {
              if (invoiceId) {
                router.replace(`/invoices/${invoiceId}` as any);
              } else {
                router.back();
              }
            },
          },
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to generate invoice:', error);
      Alert.alert('Error', 'Failed to generate invoice. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/money" />
        <ActivityIndicator size="large" color="#FF6B35" />
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <InContentBack fallback="/(tabs)/money" />
        {/* Header Info */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Ionicons name="repeat" size={20} color="#FF6B35" />
            <Text style={styles.headerName}>{recurring.name}</Text>
          </View>
          <Text style={styles.headerCustomer}>{recurring.customer_name}</Text>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#FF6B35" />
          <Text style={styles.infoBannerText}>
            Enter amounts for variable items below. Fixed items use their saved amounts.
          </Text>
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line Items</Text>

          {recurring.line_items.map((item) => {
            const isVariable = item.type === 'variable';
            const variableEntry = variableAmounts.find(
              (e) => e.lineItemId === item.id
            );

            return (
              <View
                key={item.id}
                style={[
                  styles.lineItemCard,
                  isVariable && styles.lineItemCardVariable,
                ]}
              >
                <View style={styles.lineItemHeader}>
                  <Text style={styles.lineItemName} numberOfLines={1}>
                    {item.product_name || item.description}
                  </Text>
                  <View
                    style={[
                      styles.typeBadge,
                      {
                        backgroundColor: isVariable ? '#FFFBEB' : '#ECFDF5',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeBadgeText,
                        {
                          color: isVariable ? '#D97706' : '#059669',
                        },
                      ]}
                    >
                      {isVariable ? 'Variable' : 'Fixed'}
                    </Text>
                  </View>
                </View>

                {item.description && item.description !== item.product_name && (
                  <Text style={styles.lineItemDesc}>{item.description}</Text>
                )}

                {isVariable ? (
                  <View style={styles.variableInputSection}>
                    <View style={styles.amountInputContainer}>
                      <Text style={styles.amountLabel}>Amount per unit</Text>
                      <View style={styles.amountInputRow}>
                        <Text style={styles.currencyPrefix}>$</Text>
                        <TextInput
                          style={styles.amountInput}
                          value={variableEntry?.amount || ''}
                          onChangeText={(text) =>
                            updateVariableAmount(item.id, text)
                          }
                          placeholder="0.00"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    {variableEntry?.lastAmount != null && (
                      <View style={styles.lastAmountRow}>
                        <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                        <Text style={styles.lastAmountText}>
                          Last month: {formatCurrency(variableEntry.lastAmount)}
                        </Text>
                      </View>
                    )}
                    {(item.quantity || 1) > 1 && (
                      <Text style={styles.qtyNote}>
                        Qty: {item.quantity} | Line total:{' '}
                        {formatCurrency(
                          getVariableAmountCents(item.id) * (item.quantity || 1)
                        )}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.fixedAmountSection}>
                    <View style={styles.fixedAmountRow}>
                      <Text style={styles.fixedAmountLabel}>
                        {formatCurrency(item.unit_price)} x {item.quantity || 1}
                      </Text>
                      <Text style={styles.fixedAmountValue}>
                        {formatCurrency(item.unit_price * (item.quantity || 1))}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(calculateSubtotal())}
            </Text>
          </View>

          {recurring.include_gst && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST (15%)</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(calculateGst())}
              </Text>
            </View>
          )}

          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(calculateTotal())}
            </Text>
          </View>
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[
            styles.generateButton,
            isSubmitting && styles.generateButtonDisabled,
          ]}
          onPress={handleGenerate}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="document-text" size={20} color="#fff" />
              <Text style={styles.generateButtonText}>Generate Draft Invoice</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
    backgroundColor: '#FF6B35',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  // Header
  headerCard: {
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerCustomer: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 28,
  },
  // Info banner
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  // Line items
  lineItemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lineItemCardVariable: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF7',
  },
  lineItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  lineItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lineItemDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  // Variable input
  variableInputSection: {
    marginTop: 8,
  },
  amountInputContainer: {
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  lastAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  lastAmountText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  qtyNote: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },
  // Fixed amount
  fixedAmountSection: {
    marginTop: 4,
  },
  fixedAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fixedAmountLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  fixedAmountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  // Totals
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 15,
    color: '#374151',
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
    marginBottom: 0,
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
  // Generate button
  generateButton: {
    backgroundColor: '#FF6B35',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 12,
    gap: 8,
  },
  generateButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
