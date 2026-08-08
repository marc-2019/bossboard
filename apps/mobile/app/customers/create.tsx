/**
 * Create / Edit Customer Screen
 * Form for adding new customers or editing existing ones
 * Determines mode based on `id` route param
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
  KeyboardAvoidingView,
  Platform,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { customersApi, businessProfileApi } from '../../src/services/api';

export default function CreateCustomerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [companyTemplate, setCompanyTemplate] = useState('');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('');
  const [defaultIncludeGst, setDefaultIncludeGst] = useState(true);

  useEffect(() => {
    if (isEditing) {
      loadCustomer();
    } else {
      loadCompanyTemplate();
    }
  }, [id]);

  async function loadCompanyTemplate() {
    try {
      const response = await businessProfileApi.get();
      if (response.data.success) {
        const p = response.data.data.profile || response.data.data;
        const tpl = (p?.default_notes || p?.defaultNotes || '').trim();
        setCompanyTemplate(tpl);
        if (tpl) setNotes(tpl);
        const terms = p?.default_payment_terms ?? p?.defaultPaymentTerms;
        if (terms) setDefaultPaymentTerms(String(terms));
      }
    } catch (e) {
      console.warn('Could not load company notes template', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCustomer() {
    try {
      const response = await customersApi.get(id!);
      if (response.data.success) {
        const customer = response.data.data.customer;
        setName(customer.name || '');
        setEmail(customer.email || '');
        setPhone(customer.phone || '');
        setAddress(customer.address || '');
        setNotes(customer.notes || '');
        setDefaultPaymentTerms(
          customer.default_payment_terms != null
            ? customer.default_payment_terms.toString()
            : ''
        );
        setDefaultIncludeGst(
          customer.default_include_gst !== undefined
            ? customer.default_include_gst
            : true
        );
      }
    } catch (error) {
      console.error('Failed to load customer:', error);
      Alert.alert('Error', 'Failed to load customer details');
      router.back();
    } finally {
      setIsLoading(false);
    }
  }

  function looksLikeBankDetails(text: string): boolean {
    const t = text.replace(/\s+/g, ' ');
    if (/\b\d{2}[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d{2,3}\b/.test(t)) return true;
    if (/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i.test(t)) return true;
    if (
      /\b(account\s*(number|no\.?|#)|bank\s*account)\b/i.test(t) &&
      /\d{6,}/.test(t)
    ) {
      return true;
    }
    return false;
  }

  async function handleSubmit() {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a customer name');
      return;
    }

    if (looksLikeBankDetails(notes)) {
      Alert.alert(
        'Bank details go in Settings',
        'Do not put bank account numbers in client notes. Save payment details once under Settings → Bank details so they appear on all invoices.',
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        defaultPaymentTerms: defaultPaymentTerms
          ? parseInt(defaultPaymentTerms, 10)
          : undefined,
        defaultIncludeGst,
      };

      if (isEditing) {
        const response = await customersApi.update(id!, payload);
        if (response.data.success) {
          Alert.alert('Success', 'Customer updated successfully', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      } else {
        const response = await customersApi.create(
          payload as {
            name: string;
            email?: string;
            phone?: string;
            address?: string;
            notes?: string;
            defaultPaymentTerms?: number;
            defaultIncludeGst?: boolean;
          }
        );
        if (response.data.success) {
          Alert.alert('Success', 'Customer created successfully', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      }
    } catch (error) {
      console.error('Failed to save customer:', error);
      Alert.alert(
        'Error',
        `Failed to ${isEditing ? 'update' : 'create'} customer. Please try again.`
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
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
        {/* Customer Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Customer or company name"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="customer@example.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="021 123 4567"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address, suburb, city"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Invoice Defaults */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Defaults</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Payment Terms (days)</Text>
            <TextInput
              style={styles.input}
              value={defaultPaymentTerms}
              onChangeText={setDefaultPaymentTerms}
              placeholder="e.g., 14 or 30"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>
              Default number of days until invoice is due
            </Text>
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Include GST (15%)</Text>
              <Text style={styles.toggleDescription}>
                Default GST setting for this customer
              </Text>
            </View>
            <Switch
              value={defaultIncludeGst}
              onValueChange={setDefaultIncludeGst}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={defaultIncludeGst ? '#FF6B35' : '#9CA3AF'}
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            {!isEditing && companyTemplate ? (
              <TouchableOpacity
                onPress={() => setNotes(companyTemplate)}
                style={{ marginBottom: 8 }}
              >
                <Text style={{ color: '#FF6B35', fontSize: 14 }}>
                  Apply company template
                </Text>
              </TouchableOpacity>
            ) : null}
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Company template or notes for this client only"
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
              ? isEditing
                ? 'Updating...'
                : 'Creating...'
              : isEditing
                ? 'Update Customer'
                : 'Create Customer'}
          </Text>
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
});
