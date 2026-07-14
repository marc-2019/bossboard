/**
 * Create Invoice Screen (Enhanced)
 * Customer picker, product catalog, auto-populated bank details
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  invoicesApi,
  customersApi,
  productsApi,
  businessProfileApi,
} from '../../src/services/api';
import { safeGoBack } from '../../src/utils/navigation';

interface LineItem {
  id: string;
  description: string;
  amount: string;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  default_payment_terms: number | null;
  default_include_gst: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  type: 'fixed' | 'variable';
  is_gst_applicable: boolean;
}

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Customer picker
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Product picker
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Form state
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', amount: '' },
  ]);
  const [includeGst, setIncludeGst] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Enhanced fields (auto-populated from business profile)
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [intlBankAccountName, setIntlBankAccountName] = useState('');
  const [intlIban, setIntlIban] = useState('');
  const [intlSwiftBic, setIntlSwiftBic] = useState('');
  const [intlBankName, setIntlBankName] = useState('');
  const [intlBankAddress, setIntlBankAddress] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [irdNumber, setIrdNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState(20);

  // Load business profile on mount to auto-populate
  useEffect(() => {
    loadBusinessProfile();
  }, []);

  async function loadBusinessProfile() {
    try {
      const response = await businessProfileApi.get();
      if (response.data.success && response.data.data.profile) {
        const p = response.data.data.profile;
        // Auto-populate bank details
        if (p.bank_account_name) setBankAccountName(p.bank_account_name);
        if (p.bank_account_number) setBankAccountNumber(p.bank_account_number);
        // International bank
        if (p.intl_bank_account_name) setIntlBankAccountName(p.intl_bank_account_name);
        if (p.intl_iban) setIntlIban(p.intl_iban);
        if (p.intl_swift_bic) setIntlSwiftBic(p.intl_swift_bic);
        if (p.intl_bank_name) setIntlBankName(p.intl_bank_name);
        if (p.intl_bank_address) setIntlBankAddress(p.intl_bank_address);
        // Company details
        if (p.company_name) setCompanyName(p.company_name);
        if (p.company_address) setCompanyAddress(p.company_address);
        if (p.ird_number) setIrdNumber(p.ird_number);
        if (p.gst_number) setGstNumber(p.gst_number);
        // Defaults
        if (p.is_gst_registered !== undefined) setIncludeGst(p.is_gst_registered);
        if (p.default_payment_terms) {
          setDefaultPaymentTerms(p.default_payment_terms);
          // Auto-calculate due date
          const due = new Date();
          due.setDate(due.getDate() + p.default_payment_terms);
          setDueDate(due.toISOString().split('T')[0]);
        }
        if (p.default_notes) setNotes(p.default_notes);
      }
    } catch (error) {
      // No profile set up yet, that's OK
    } finally {
      setIsLoadingProfile(false);
    }
  }

  // Load customers for picker
  async function loadCustomers(search?: string) {
    setIsLoadingCustomers(true);
    try {
      const response = await customersApi.list({ search });
      if (response.data.success) {
        setCustomers(response.data.data.customers || []);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  // Load products for picker
  async function loadProducts(search?: string) {
    setIsLoadingProducts(true);
    try {
      const response = await productsApi.list({ search });
      if (response.data.success) {
        setProducts(response.data.data.products || []);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerId(customer.id);
    setClientName(customer.name);
    setClientEmail(customer.email || '');
    setClientPhone(customer.phone || '');
    // Use customer's GST preference if set
    if (customer.default_include_gst !== undefined) {
      setIncludeGst(customer.default_include_gst);
    }
    // Use customer's payment terms if set
    if (customer.default_payment_terms) {
      setDefaultPaymentTerms(customer.default_payment_terms);
      const due = new Date();
      due.setDate(due.getDate() + customer.default_payment_terms);
      setDueDate(due.toISOString().split('T')[0]);
    }
    setCustomerModalVisible(false);
    setCustomerSearch('');
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerId(undefined);
    setClientName('');
    setClientEmail('');
    setClientPhone('');
  }

  function addProductAsLineItem(product: Product) {
    const newItem: LineItem = {
      id: Date.now().toString(),
      description: product.description || product.name,
      amount: (product.unit_price / 100).toFixed(2),
    };
    // Replace empty first item or append
    if (lineItems.length === 1 && !lineItems[0].description && !lineItems[0].amount) {
      setLineItems([newItem]);
    } else {
      setLineItems([...lineItems, newItem]);
    }
    setProductModalVisible(false);
    setProductSearch('');
  }

  function addLineItem() {
    setLineItems([
      ...lineItems,
      { id: Date.now().toString(), description: '', amount: '' },
    ]);
  }

  function removeLineItem(id: string) {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((item) => item.id !== id));
    }
  }

  function updateLineItem(id: string, field: 'description' | 'amount', value: string) {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }

  function parseAmount(amountStr: string): number {
    const cleaned = amountStr.replace(/[^0-9.]/g, '');
    const dollars = parseFloat(cleaned) || 0;
    return Math.round(dollars * 100);
  }

  function calculateSubtotal(): number {
    return lineItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  }

  function calculateGst(): number {
    return includeGst ? Math.round(calculateSubtotal() * 0.15) : 0;
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateGst();
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async function handleSubmit() {
    if (!clientName.trim()) {
      Alert.alert('Error', 'Please enter a client name or select a customer');
      return;
    }

    const validLineItems = lineItems.filter(
      (item) => item.description.trim() && parseAmount(item.amount) > 0
    );

    if (validLineItems.length === 0) {
      Alert.alert('Error', 'Please add at least one line item with a description and amount');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await invoicesApi.create({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
        lineItems: validLineItems.map((item) => ({
          description: item.description.trim(),
          amount: parseAmount(item.amount),
        })),
        includeGst,
        dueDate: dueDate || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        customerId: customerId,
        intlBankAccountName: intlBankAccountName.trim() || undefined,
        intlIban: intlIban.trim() || undefined,
        intlSwiftBic: intlSwiftBic.trim() || undefined,
        intlBankName: intlBankName.trim() || undefined,
        intlBankAddress: intlBankAddress.trim() || undefined,
        companyName: companyName.trim() || undefined,
        companyAddress: companyAddress.trim() || undefined,
        irdNumber: irdNumber.trim() || undefined,
        gstNumber: gstNumber.trim() || undefined,
      });

      if (response.data.success) {
        Alert.alert('Success', 'Invoice created successfully', [
          {
            text: 'View Invoice',
            onPress: () => router.replace(`/invoices/${response.data.data.invoice.id}` as any),
          },
          {
            text: 'Create Another',
            onPress: () => {
              clearCustomer();
              setJobDescription('');
              setLineItems([{ id: '1', description: '', amount: '' }]);
              // Keep bank details, company details, GST setting
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to create invoice:', error);
      Alert.alert('Error', 'Failed to create invoice. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filtered customers for search
  const filteredCustomers = customerSearch
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
      )
    : customers;

  // Filtered products for search
  const filteredProducts = productSearch
    ? products.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(productSearch.toLowerCase()))
      )
    : products;

  if (isLoadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading defaults...</Text>
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
        <TouchableOpacity
          style={styles.inContentBack}
          onPress={() => safeGoBack(router, '/(tabs)/money')}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="invoice-create-in-content-back"
        >
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
          <Text style={styles.inContentBackText}>Back to invoices</Text>
        </TouchableOpacity>

        {/* Customer Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>

          {selectedCustomer ? (
            <View style={styles.selectedCustomerCard}>
              <View style={styles.selectedCustomerInfo}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>
                    {selectedCustomer.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedCustomerName}>{selectedCustomer.name}</Text>
                  {selectedCustomer.email && (
                    <Text style={styles.selectedCustomerDetail}>{selectedCustomer.email}</Text>
                  )}
                  {selectedCustomer.phone && (
                    <Text style={styles.selectedCustomerDetail}>{selectedCustomer.phone}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={clearCustomer} style={styles.changeButton}>
                  <Text style={styles.changeButtonText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                style={styles.selectCustomerButton}
                onPress={() => {
                  loadCustomers();
                  setCustomerModalVisible(true);
                }}
              >
                <Ionicons name="people" size={20} color="#FF6B35" />
                <Text style={styles.selectCustomerText}>Select from Customers</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <Text style={styles.orDivider}>or enter manually</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Client Name *</Text>
                <TextInput
                  style={styles.input}
                  value={clientName}
                  onChangeText={setClientName}
                  placeholder="Enter client or company name"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={clientEmail}
                  onChangeText={setClientEmail}
                  placeholder="client@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={clientPhone}
                  onChangeText={setClientPhone}
                  placeholder="021 123 4567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          )}
        </View>

        {/* Job Description */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Job Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={jobDescription}
              onChangeText={setJobDescription}
              placeholder="Brief description of work performed"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>

          {lineItems.map((item) => (
            <View key={item.id} style={styles.lineItem}>
              <View style={styles.lineItemContent}>
                <TextInput
                  style={[styles.input, styles.descriptionInput]}
                  value={item.description}
                  onChangeText={(text) => updateLineItem(item.id, 'description', text)}
                  placeholder="Description (e.g., Labour, Materials)"
                  placeholderTextColor="#9CA3AF"
                />
                <View style={styles.amountRow}>
                  <Text style={styles.currencyPrefix}>$</Text>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    value={item.amount}
                    onChangeText={(text) => updateLineItem(item.id, 'amount', text)}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                  />
                  {lineItems.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeLineItem(item.id)}
                    >
                      <Ionicons name="close-circle" size={24} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}

          <View style={styles.addItemButtons}>
            <TouchableOpacity style={styles.addItemButton} onPress={addLineItem}>
              <Ionicons name="add" size={20} color="#FF6B35" />
              <Text style={styles.addItemText}>Add Item</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addItemButton, styles.addFromCatalogButton]}
              onPress={() => {
                loadProducts();
                setProductModalVisible(true);
              }}
            >
              <Ionicons name="cube" size={20} color="#10B981" />
              <Text style={[styles.addItemText, { color: '#10B981' }]}>From Catalog</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* GST Toggle */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Include GST (15%)</Text>
              <Text style={styles.toggleDescription}>
                NZ Goods and Services Tax
              </Text>
            </View>
            <Switch
              value={includeGst}
              onValueChange={setIncludeGst}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={includeGst ? '#FF6B35' : '#9CA3AF'}
            />
          </View>
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

        {/* Bank Details (auto-populated) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
            {bankAccountName ? (
              <View style={styles.autoPopBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.autoPopText}>Auto-filled</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>NZD Account Name</Text>
            <TextInput
              style={styles.input}
              value={bankAccountName}
              onChangeText={setBankAccountName}
              placeholder="Your business name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>NZD Account Number</Text>
            <TextInput
              style={styles.input}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              placeholder="00-0000-0000000-00"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
          </View>

          {/* International bank (collapsible) */}
          {(intlIban || intlSwiftBic) ? (
            <View style={styles.intlSection}>
              <Text style={styles.intlHeader}>International Payment Details</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Account Name</Text>
                <TextInput
                  style={styles.input}
                  value={intlBankAccountName}
                  onChangeText={setIntlBankAccountName}
                  placeholder="Account holder name"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>IBAN</Text>
                <TextInput
                  style={styles.input}
                  value={intlIban}
                  onChangeText={setIntlIban}
                  placeholder="IBAN number"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>SWIFT/BIC</Text>
                <TextInput
                  style={styles.input}
                  value={intlSwiftBic}
                  onChangeText={setIntlSwiftBic}
                  placeholder="SWIFT/BIC code"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Due Date</Text>
            <TextInput
              style={styles.input}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD (e.g., 2026-03-01)"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional notes for the client"
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
            {isSubmitting ? 'Creating...' : 'Create Invoice'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal visible={customerModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => { setCustomerModalVisible(false); setCustomerSearch(''); }}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalSearch}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.modalSearchInput}
              value={customerSearch}
              onChangeText={(text) => {
                setCustomerSearch(text);
                loadCustomers(text);
              }}
              placeholder="Search customers..."
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            {customerSearch.length > 0 && (
              <TouchableOpacity onPress={() => { setCustomerSearch(''); loadCustomers(); }}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {isLoadingCustomers ? (
            <ActivityIndicator size="large" color="#FF6B35" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.customerPickerItem}
                  onPress={() => selectCustomer(item)}
                >
                  <View style={styles.customerPickerAvatar}>
                    <Text style={styles.customerPickerAvatarText}>
                      {item.name[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerPickerName}>{item.name}</Text>
                    {item.email && (
                      <Text style={styles.customerPickerDetail}>{item.email}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmptyState}>
                  <Ionicons name="people-outline" size={48} color="#D1D5DB" />
                  <Text style={styles.modalEmptyText}>
                    {customerSearch ? 'No matching customers' : 'No customers yet'}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalEmptyButton}
                    onPress={() => {
                      setCustomerModalVisible(false);
                      router.push('/customers/create' as any);
                    }}
                  >
                    <Text style={styles.modalEmptyButtonText}>Add New Customer</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </View>
      </Modal>

      {/* Product Picker Modal */}
      <Modal visible={productModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add from Catalog</Text>
            <TouchableOpacity onPress={() => { setProductModalVisible(false); setProductSearch(''); }}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalSearch}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.modalSearchInput}
              value={productSearch}
              onChangeText={(text) => {
                setProductSearch(text);
                loadProducts(text);
              }}
              placeholder="Search products & services..."
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            {productSearch.length > 0 && (
              <TouchableOpacity onPress={() => { setProductSearch(''); loadProducts(); }}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {isLoadingProducts ? (
            <ActivityIndicator size="large" color="#FF6B35" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.productPickerItem}
                  onPress={() => addProductAsLineItem(item)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.productPickerNameRow}>
                      <Text style={styles.productPickerName}>{item.name}</Text>
                      <View
                        style={[
                          styles.productTypeBadge,
                          { backgroundColor: item.type === 'fixed' ? '#DCFCE7' : '#FEF3C7' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.productTypeBadgeText,
                            { color: item.type === 'fixed' ? '#166534' : '#92400E' },
                          ]}
                        >
                          {item.type === 'fixed' ? 'Fixed' : 'Variable'}
                        </Text>
                      </View>
                    </View>
                    {item.description && (
                      <Text style={styles.productPickerDescription}>{item.description}</Text>
                    )}
                  </View>
                  <Text style={styles.productPickerPrice}>
                    {formatCurrency(item.unit_price)}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmptyState}>
                  <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                  <Text style={styles.modalEmptyText}>
                    {productSearch ? 'No matching products' : 'No products yet'}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalEmptyButton}
                    onPress={() => {
                      setProductModalVisible(false);
                      router.push('/products/create' as any);
                    }}
                  >
                    <Text style={styles.modalEmptyButtonText}>Add New Product</Text>
                  </TouchableOpacity>
                </View>
              }
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
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  inContentBack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  inContentBackText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  autoPopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  autoPopText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#10B981',
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
  // Customer selection
  selectedCustomerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  selectedCustomerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  selectedCustomerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  selectedCustomerDetail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 1,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B35',
  },
  selectCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  selectCustomerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#FF6B35',
  },
  orDivider: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 13,
    marginVertical: 12,
  },
  // Line items
  lineItem: {
    marginBottom: 12,
  },
  lineItemContent: {
    gap: 8,
  },
  descriptionInput: {
    flex: 1,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  addItemButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addItemButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF6B35',
    borderRadius: 10,
    gap: 8,
  },
  addFromCatalogButton: {
    borderColor: '#10B981',
  },
  addItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
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
  // International bank
  intlSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  intlHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
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
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    margin: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  modalSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#111827',
  },
  modalList: {
    padding: 16,
    paddingTop: 0,
  },
  // Customer picker items
  customerPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  customerPickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerPickerAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  customerPickerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  customerPickerDetail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  // Product picker items
  productPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  productPickerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productPickerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  productTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  productTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  productPickerDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  productPickerPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  // Modal empty states
  modalEmptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  modalEmptyText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
  },
  modalEmptyButton: {
    marginTop: 16,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalEmptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
