/**
 * Create/Edit Recurring Invoice Screen
 * Form for setting up recurring invoice templates with customer, line items, and schedule
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { recurringInvoicesApi, customersApi, productsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  type: 'fixed' | 'variable';
}

interface LineItem {
  localId: string;
  productServiceId: string;
  productName: string;
  description: string;
  unitPrice: string;
  quantity: string;
  type: 'fixed' | 'variable';
}

export default function CreateRecurringInvoiceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [includeGst, setIncludeGst] = useState(true);
  const [paymentTerms, setPaymentTerms] = useState('14');
  const [notes, setNotes] = useState('');

  // Modals
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [customersResponse, productsResponse] = await Promise.all([
        customersApi.list(),
        productsApi.list(),
      ]);

      if (customersResponse.data.success) {
        setCustomers(customersResponse.data.data.customers || []);
      }
      if (productsResponse.data.success) {
        setProducts(productsResponse.data.data.products || []);
      }

      if (isEditMode && id) {
        const response = await recurringInvoicesApi.get(id);
        if (response.data.success) {
          const recurring = response.data.data.recurringInvoice;
          setName(recurring.name || '');
          setDayOfMonth(String(recurring.day_of_month || 1));
          setIncludeGst(recurring.include_gst ?? true);
          setPaymentTerms(String(recurring.payment_terms || 14));
          setNotes(recurring.notes || '');

          // Set customer
          const customerList = customersResponse.data.data.customers || [];
          const matchedCustomer = customerList.find(
            (c: Customer) => c.id === recurring.customer_id
          );
          if (matchedCustomer) {
            setSelectedCustomer(matchedCustomer);
          }

          // Set line items
          if (recurring.line_items && recurring.line_items.length > 0) {
            setLineItems(
              recurring.line_items.map((item: any, index: number) => ({
                localId: `existing-${index}`,
                productServiceId: item.product_service_id || '',
                productName: item.product_name || item.description || '',
                description: item.description || '',
                unitPrice: String((item.unit_price || 0) / 100),
                quantity: String(item.quantity || 1),
                type: item.type || 'fixed',
              }))
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setIsLoadingData(false);
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

  function calculateSubtotal(): number {
    return lineItems.reduce((sum, item) => {
      const price = parseAmount(item.unitPrice);
      const qty = parseInt(item.quantity, 10) || 1;
      return sum + price * qty;
    }, 0);
  }

  function calculateGst(): number {
    return includeGst ? Math.round(calculateSubtotal() * 0.15) : 0;
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateGst();
  }

  function handleSelectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setShowCustomerPicker(false);
  }

  function handleAddProduct(product: Product) {
    const newItem: LineItem = {
      localId: Date.now().toString(),
      productServiceId: product.id,
      productName: product.name,
      description: product.description || product.name,
      unitPrice: String(product.unit_price / 100),
      quantity: '1',
      type: product.type || 'fixed',
    };
    setLineItems([...lineItems, newItem]);
    setShowProductPicker(false);
  }

  function updateLineItem(localId: string, field: keyof LineItem, value: string) {
    setLineItems(
      lineItems.map((item) =>
        item.localId === localId ? { ...item, [field]: value } : item
      )
    );
  }

  function removeLineItem(localId: string) {
    setLineItems(lineItems.filter((item) => item.localId !== localId));
  }

  async function handleSubmit() {
    // Validation
    if (!selectedCustomer) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for this recurring invoice');
      return;
    }
    if (lineItems.length === 0) {
      Alert.alert('Error', 'Please add at least one line item');
      return;
    }

    const day = parseInt(dayOfMonth, 10);
    if (isNaN(day) || day < 1 || day > 28) {
      Alert.alert('Error', 'Day of month must be between 1 and 28');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        customerId: selectedCustomer.id,
        name: name.trim(),
        dayOfMonth: day,
        includeGst,
        paymentTerms: parseInt(paymentTerms, 10) || 14,
        notes: notes.trim() || undefined,
        lineItems: lineItems.map((item) => ({
          productServiceId: item.productServiceId,
          description: item.description.trim() || undefined,
          unitPrice: parseAmount(item.unitPrice),
          quantity: parseInt(item.quantity, 10) || 1,
          type: item.type,
        })),
      };

      let response;
      if (isEditMode && id) {
        response = await recurringInvoicesApi.update(id, payload);
      } else {
        response = await recurringInvoicesApi.create(payload);
      }

      if (response.data.success) {
        const savedId = isEditMode
          ? id
          : response.data.data.recurringInvoice?.id;

        Alert.alert(
          'Success',
          isEditMode
            ? 'Recurring invoice updated successfully'
            : 'Recurring invoice created successfully',
          [
            {
              text: 'View Details',
              onPress: () => {
                if (savedId) {
                  router.replace(`/recurring/${savedId}` as any);
                } else {
                  router.back();
                }
              },
            },
            {
              text: 'Done',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to save recurring invoice:', error);
      Alert.alert('Error', 'Failed to save recurring invoice. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingData) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/(tabs)/money" />
        <ActivityIndicator size="large" color="#FF6B35" />
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
        {/* Customer Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer *</Text>
          {selectedCustomer ? (
            <View style={styles.selectedCustomerCard}>
              <View style={styles.selectedCustomerInfo}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.customerDetails}>
                  <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                  {selectedCustomer.email && (
                    <Text style={styles.customerEmail}>{selectedCustomer.email}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.changeButton}
                onPress={() => setShowCustomerPicker(true)}
              >
                <Text style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectCustomerButton}
              onPress={() => setShowCustomerPicker(true)}
            >
              <Ionicons name="person-add-outline" size={20} color="#FF6B35" />
              <Text style={styles.selectCustomerText}>Select a Customer</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Name */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Template Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Monthly Lawn Care - Smith"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Day of Month (1-28)</Text>
            <TextInput
              style={styles.input}
              value={dayOfMonth}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9]/g, '');
                const num = parseInt(cleaned, 10);
                if (cleaned === '' || (num >= 0 && num <= 28)) {
                  setDayOfMonth(cleaned);
                }
              }}
              placeholder="1"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.hint}>
              Invoice will be generated on this day each month
            </Text>
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line Items</Text>

          {lineItems.map((item) => (
            <View key={item.localId} style={styles.lineItemCard}>
              <View style={styles.lineItemHeader}>
                <View style={styles.lineItemTitleRow}>
                  <Text style={styles.lineItemProductName} numberOfLines={1}>
                    {item.productName}
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
                        styles.lineItemTypeBadgeText,
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
                <TouchableOpacity
                  style={styles.removeItemButton}
                  onPress={() => removeLineItem(item.localId)}
                >
                  <Ionicons name="close-circle" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.lineItemDescInput}
                value={item.description}
                onChangeText={(text) => updateLineItem(item.localId, 'description', text)}
                placeholder="Description (optional override)"
                placeholderTextColor="#9CA3AF"
              />

              <View style={styles.lineItemAmountRow}>
                <View style={styles.lineItemAmountGroup}>
                  <Text style={styles.lineItemAmountLabel}>Unit Price</Text>
                  <View style={styles.amountInputRow}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      style={styles.lineItemAmountInput}
                      value={item.unitPrice}
                      onChangeText={(text) =>
                        updateLineItem(item.localId, 'unitPrice', text)
                      }
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={styles.lineItemQtyGroup}>
                  <Text style={styles.lineItemAmountLabel}>Qty</Text>
                  <TextInput
                    style={styles.lineItemQtyInput}
                    value={item.quantity}
                    onChangeText={(text) =>
                      updateLineItem(item.localId, 'quantity', text.replace(/[^0-9]/g, ''))
                    }
                    placeholder="1"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.lineItemTotalGroup}>
                  <Text style={styles.lineItemAmountLabel}>Line Total</Text>
                  <Text style={styles.lineItemTotal}>
                    {formatCurrency(
                      parseAmount(item.unitPrice) * (parseInt(item.quantity, 10) || 1)
                    )}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addItemButton}
            onPress={() => setShowProductPicker(true)}
          >
            <Ionicons name="add" size={20} color="#FF6B35" />
            <Text style={styles.addItemText}>Add from Products</Text>
          </TouchableOpacity>
        </View>

        {/* Totals */}
        <View style={styles.section}>
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(calculateSubtotal())}</Text>
            </View>
            {includeGst && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>GST (15%)</Text>
                <Text style={styles.totalValue}>{formatCurrency(calculateGst())}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(calculateTotal())}</Text>
            </View>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Include GST (15%)</Text>
              <Text style={styles.toggleDescription}>NZ Goods and Services Tax</Text>
            </View>
            <Switch
              value={includeGst}
              onValueChange={setIncludeGst}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={includeGst ? '#FF6B35' : '#9CA3AF'}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Payment Terms (days)</Text>
            <TextInput
              style={styles.input}
              value={paymentTerms}
              onChangeText={(text) => setPaymentTerms(text.replace(/[^0-9]/g, ''))}
              placeholder="14"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes to include on generated invoices"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting
              ? isEditMode ? 'Updating...' : 'Creating...'
              : isEditMode ? 'Update Recurring Invoice' : 'Create Recurring Invoice'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCustomerPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => setShowCustomerPicker(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          {customers.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="people-outline" size={48} color="#D1D5DB" />
              <Text style={styles.modalEmptyText}>No customers found</Text>
              <Text style={styles.modalEmptyHint}>
                Add customers from the Money tab first
              </Text>
            </View>
          ) : (
            <FlatList
              data={customers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalListItem}
                  onPress={() => handleSelectCustomer(item)}
                >
                  <View style={styles.customerAvatar}>
                    <Text style={styles.customerAvatarText}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.modalListItemInfo}>
                    <Text style={styles.modalListItemName}>{item.name}</Text>
                    {item.email && (
                      <Text style={styles.modalListItemDetail}>{item.email}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Product Picker Modal */}
      <Modal
        visible={showProductPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProductPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Product / Service</Text>
            <TouchableOpacity onPress={() => setShowProductPicker(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          {products.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
              <Text style={styles.modalEmptyText}>No products found</Text>
              <Text style={styles.modalEmptyHint}>
                Add products from the Money tab first
              </Text>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalListItem}
                  onPress={() => handleAddProduct(item)}
                >
                  <View
                    style={[
                      styles.productIcon,
                      {
                        backgroundColor:
                          item.type === 'variable' ? '#FFFBEB' : '#ECFDF5',
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.type === 'variable' ? 'create-outline' : 'cube'}
                      size={20}
                      color={item.type === 'variable' ? '#D97706' : '#059669'}
                    />
                  </View>
                  <View style={styles.modalListItemInfo}>
                    <Text style={styles.modalListItemName}>{item.name}</Text>
                    <View style={styles.productMetaRow}>
                      <Text style={styles.productPrice}>
                        {formatCurrency(item.unit_price)}
                      </Text>
                      <View
                        style={[
                          styles.productTypeBadge,
                          {
                            backgroundColor:
                              item.type === 'variable' ? '#FFFBEB' : '#ECFDF5',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.productTypeBadgeText,
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
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color="#FF6B35" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  // Customer picker
  selectedCustomerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedCustomerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B35',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  customerEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF6B35',
  },
  selectCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF6B35',
    borderRadius: 12,
    gap: 8,
  },
  selectCustomerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
  // Line items
  lineItemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  lineItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
    marginRight: 8,
  },
  lineItemProductName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  lineItemTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lineItemTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  removeItemButton: {
    padding: 2,
  },
  lineItemDescInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
  },
  lineItemAmountRow: {
    flexDirection: 'row',
    gap: 10,
  },
  lineItemAmountGroup: {
    flex: 2,
  },
  lineItemAmountLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginRight: 4,
  },
  lineItemAmountInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  lineItemQtyGroup: {
    flex: 1,
  },
  lineItemQtyInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  lineItemTotalGroup: {
    flex: 2,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  lineItemTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    paddingVertical: 10,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF6B35',
    borderRadius: 10,
    gap: 8,
  },
  addItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
  // Totals
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
  // Settings
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  toggleDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  // Submit
  submitButton: {
    backgroundColor: '#FF6B35',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Modals
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalListContent: {
    padding: 16,
  },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modalListItemInfo: {
    flex: 1,
  },
  modalListItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  modalListItemDetail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  modalEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalEmptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  modalEmptyHint: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  // Product specific
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  productTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productTypeBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
