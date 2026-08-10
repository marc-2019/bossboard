/**
 * Create Quote Screen
 * Adapted from invoices/create.tsx with purple theme and quote-specific fields
 */

import { useState, useEffect } from 'react';
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
import { quotesApi, customersApi, productsApi, businessProfileApi } from '../../src/services/api';

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

const GST_RATE = 0.15;

export default function CreateQuoteScreen() {
  const router = useRouter();

  // Form state
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

  // Quote fields
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', amount: '' },
  ]);
  const [includeGst, setIncludeGst] = useState(true);
  const [validUntil, setValidUntil] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [internalMemo, setInternalMemo] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);

  // International bank details
  const [intlBankAccountName, setIntlBankAccountName] = useState('');
  const [intlIban, setIntlIban] = useState('');
  const [intlSwiftBic, setIntlSwiftBic] = useState('');
  const [intlBankName, setIntlBankName] = useState('');
  const [intlBankAddress, setIntlBankAddress] = useState('');

  // Company details (auto-populated from business profile)
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [irdNumber, setIrdNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  useEffect(() => {
    loadBusinessProfile();
  }, []);

  async function loadBusinessProfile() {
    try {
      const response = await businessProfileApi.get();
      const p = (response.data as any).data?.profile;
      if (p) {
        if (p.bank_account_name) setBankAccountName(p.bank_account_name);
        if (p.bank_account_number) setBankAccountNumber(p.bank_account_number);
        if (p.company_name) setCompanyName(p.company_name);
        if (p.company_address) setCompanyAddress(p.company_address);
        if (p.ird_number) setIrdNumber(p.ird_number);
        if (p.gst_number) setGstNumber(p.gst_number);
        if (p.is_gst_registered !== undefined) setIncludeGst(p.is_gst_registered);
        if (p.default_notes) setNotes(p.default_notes);
        if (p.intl_bank_account_name) setIntlBankAccountName(p.intl_bank_account_name);
        if (p.intl_iban) setIntlIban(p.intl_iban);
        if (p.intl_swift_bic) setIntlSwiftBic(p.intl_swift_bic);
        if (p.intl_bank_name) setIntlBankName(p.intl_bank_name);
        if (p.intl_bank_address) setIntlBankAddress(p.intl_bank_address);
      }
    } catch (err) {
      // Non-critical, continue without profile
    }
    // Always set validUntil to 30 days from now
    const valid = new Date();
    valid.setDate(valid.getDate() + 30);
    setValidUntil(valid.toISOString().split('T')[0]);
    setIsLoadingProfile(false);
  }

  async function loadCustomers() {
    setIsLoadingCustomers(true);
    try {
      const response = await customersApi.list({ limit: 100 });
      const data = (response.data as any).data?.customers || [];
      setCustomers(data);
    } catch (err) {
      // Silent fail
    }
    setIsLoadingCustomers(false);
  }

  async function loadProducts() {
    setIsLoadingProducts(true);
    try {
      const response = await productsApi.list({ limit: 100 });
      const data = (response.data as any).data?.products || [];
      setProducts(data);
    } catch (err) {
      // Silent fail
    }
    setIsLoadingProducts(false);
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerId(customer.id);
    setClientName(customer.name);
    if (customer.email) setClientEmail(customer.email);
    if (customer.phone) setClientPhone(customer.phone);
    if (customer.default_include_gst !== undefined) setIncludeGst(customer.default_include_gst);
    setCustomerModalVisible(false);
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
      description: product.description ? `${product.name} - ${product.description}` : product.name,
      amount: (product.unit_price / 100).toFixed(2),
    };
    setLineItems((prev) => [...prev, newItem]);
    setProductModalVisible(false);
  }

  // Line item helpers
  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description: '', amount: '' },
    ]);
  }

  function removeLineItem(id: string) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateLineItem(id: string, field: 'description' | 'amount', value: string) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  // Amount parsing & calculations
  function parseAmount(value: string): number {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }

  function calculateSubtotal(): number {
    return lineItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  }

  function calculateGst(): number {
    if (!includeGst) return 0;
    return Math.round(calculateSubtotal() * GST_RATE);
  }

  function calculateTotal(): number {
    return calculateSubtotal() + calculateGst();
  }

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  async function handleSubmit() {
    // Validate
    if (!clientName.trim()) {
      Alert.alert('Error', 'Client name is required');
      return;
    }

    const validItems = lineItems.filter(
      (item) => item.description.trim() && parseAmount(item.amount) > 0
    );
    if (validItems.length === 0) {
      Alert.alert('Error', 'At least one line item with description and amount is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await quotesApi.create({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        customerId: customerId || undefined,
        jobDescription: jobDescription.trim() || undefined,
        lineItems: validItems.map((item) => ({
          description: item.description.trim(),
          amount: parseAmount(item.amount),
        })),
        includeGst,
        validUntil: validUntil || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        internalMemo: internalMemo.trim() || undefined,
      });

      const quoteId = (response.data as any).data?.quote?.id;

      Alert.alert('Success', 'Quote created successfully!', [
        {
          text: 'View Quote',
          onPress: () => {
            if (quoteId) {
              router.replace(`/quotes/${quoteId}` as any);
            } else {
              router.back();
            }
          },
        },
        {
          text: 'Create Another',
          onPress: () => {
            // Reset form
            clearCustomer();
            setJobDescription('');
            setLineItems([{ id: '1', description: '', amount: '' }]);
            const valid = new Date();
            valid.setDate(valid.getDate() + 30);
            setValidUntil(valid.toISOString().split('T')[0]);
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create quote');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filtered lists for modals
  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(productSearch.toLowerCase()))
  );

  if (isLoadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Quote</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Customer Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client Details</Text>

          {selectedCustomer ? (
            <View style={styles.selectedCustomerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedCustomerName}>{selectedCustomer.name}</Text>
                {selectedCustomer.email && (
                  <Text style={styles.selectedCustomerDetail}>{selectedCustomer.email}</Text>
                )}
              </View>
              <TouchableOpacity onPress={clearCustomer}>
                <Ionicons name="close-circle" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectCustomerButton}
              onPress={() => {
                loadCustomers();
                setCustomerModalVisible(true);
              }}
            >
              <Ionicons name="person-add-outline" size={20} color="#8B5CF6" />
              <Text style={styles.selectCustomerText}>Select from Customers</Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={styles.input}
            placeholder="Client Name *"
            value={clientName}
            onChangeText={setClientName}
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.input}
            placeholder="Client Email"
            value={clientEmail}
            onChangeText={setClientEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.input}
            placeholder="Client Phone"
            value={clientPhone}
            onChangeText={setClientPhone}
            keyboardType="phone-pad"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Job Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the work to be quoted..."
            value={jobDescription}
            onChangeText={setJobDescription}
            multiline
            numberOfLines={3}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Line Items</Text>
            <TouchableOpacity
              style={styles.addFromCatalog}
              onPress={() => {
                loadProducts();
                setProductModalVisible(true);
              }}
            >
              <Ionicons name="cube-outline" size={16} color="#8B5CF6" />
              <Text style={styles.addFromCatalogText}>From Catalog</Text>
            </TouchableOpacity>
          </View>

          {lineItems.map((item, index) => (
            <View key={item.id} style={styles.lineItem}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemNumber}>Item {index + 1}</Text>
                {lineItems.length > 1 && (
                  <TouchableOpacity onPress={() => removeLineItem(item.id)}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Description"
                value={item.description}
                onChangeText={(v) => updateLineItem(item.id, 'description', v)}
                placeholderTextColor="#9CA3AF"
              />
              <TextInput
                style={styles.input}
                placeholder="Amount ($)"
                value={item.amount}
                onChangeText={(v) => updateLineItem(item.id, 'amount', v)}
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}

          <TouchableOpacity style={styles.addLineButton} onPress={addLineItem}>
            <Ionicons name="add-circle-outline" size={20} color="#8B5CF6" />
            <Text style={styles.addLineText}>Add Line Item</Text>
          </TouchableOpacity>
        </View>

        {/* GST Toggle */}
        <View style={styles.section}>
          <View style={styles.gstRow}>
            <Text style={styles.sectionTitle}>Include GST (15%)</Text>
            <Switch
              value={includeGst}
              onValueChange={setIncludeGst}
              trackColor={{ false: '#D1D5DB', true: '#C4B5FD' }}
              thumbColor={includeGst ? '#8B5CF6' : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
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

        {/* Valid Until */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Valid Until</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={validUntil}
            onChangeText={setValidUntil}
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.helperText}>Quote validity period (default: 30 days)</Text>
        </View>

        {/* Customer notes (PDF) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer notes (PDF)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Terms or thank-you — client sees this on the PDF"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.helperText}>
            Not for system test / seed notes — use Internal memo below.
          </Text>
        </View>

        {/* Internal memo (private) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#92400E' }]}>
            Internal memo (private)
          </Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }]}
            placeholder="Staff only — never on the PDF"
            value={internalMemo}
            onChangeText={setInternalMemo}
            multiline
            numberOfLines={3}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Create Quote</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal visible={customerModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="Search customers..."
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholderTextColor="#9CA3AF"
          />
          {isLoadingCustomers ? (
            <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => selectCustomer(item)}
                >
                  <Text style={styles.modalItemTitle}>{item.name}</Text>
                  {item.email && <Text style={styles.modalItemSubtitle}>{item.email}</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No customers found</Text>
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
            <TouchableOpacity onPress={() => setProductModalVisible(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="Search products..."
            value={productSearch}
            onChangeText={setProductSearch}
            placeholderTextColor="#9CA3AF"
          />
          {isLoadingProducts ? (
            <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => addProductAsLineItem(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemTitle}>{item.name}</Text>
                    {item.description && (
                      <Text style={styles.modalItemSubtitle}>{item.description}</Text>
                    )}
                  </View>
                  <Text style={styles.modalItemPrice}>
                    ${(item.unit_price / 100).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No products found</Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  selectedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  selectedCustomerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  selectedCustomerDetail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  selectCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    borderStyle: 'dashed',
    marginBottom: 12,
    backgroundColor: '#F5F3FF',
  },
  selectCustomerText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#8B5CF6',
  },
  lineItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lineItemNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  addLineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    borderStyle: 'dashed',
  },
  addLineText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#8B5CF6',
  },
  addFromCatalog: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F5F3FF',
  },
  addFromCatalogText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#8B5CF6',
  },
  gstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 12,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: -8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#C4B5FD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalSearch: {
    margin: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  modalItemSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  modalItemPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 15,
    marginTop: 40,
  },
});
