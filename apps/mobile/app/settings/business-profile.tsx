/**
 * Business Profile Screen
 * Form for editing company details and invoice settings
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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { businessProfileApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

export default function BusinessProfileScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Company Details
  const [companyName, setCompanyName] = useState('');
  const [tradingAs, setTradingAs] = useState('');
  const [irdNumber, setIrdNumber] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [invoiceBccEmail, setInvoiceBccEmail] = useState('');

  // Invoice Settings
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('');
  const [defaultNotes, setDefaultNotes] = useState('');
  const [isGstRegistered, setIsGstRegistered] = useState(false);
  const [gstNumber, setGstNumber] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const response = await businessProfileApi.get();
      // API returns { success, data: { profile } } with snake_case keys
      const envelope = (response.data as any)?.data;
      const profile = envelope?.profile || envelope;
      if (profile) {
        setCompanyName(profile.companyName || profile.company_name || '');
        setTradingAs(profile.tradingAs || profile.trading_as || '');
        setIrdNumber(profile.irdNumber || profile.ird_number || '');
        setCompanyAddress(profile.companyAddress || profile.company_address || '');
        setCompanyPhone(profile.companyPhone || profile.company_phone || '');
        setCompanyEmail(profile.companyEmail || profile.company_email || '');
        setInvoiceBccEmail(profile.invoiceBccEmail || profile.invoice_bcc_email || '');
        setInvoicePrefix(profile.invoicePrefix || profile.invoice_prefix || '');
        const terms = profile.defaultPaymentTerms ?? profile.default_payment_terms;
        setDefaultPaymentTerms(terms != null ? String(terms) : '');
        setDefaultNotes(profile.defaultNotes || profile.default_notes || '');
        setIsGstRegistered(
          Boolean(profile.isGstRegistered ?? profile.is_gst_registered)
        );
        setGstNumber(profile.gstNumber || profile.gst_number || '');
      }
    } catch (error) {
      console.error('Failed to load business profile:', error);
      Alert.alert('Error', 'Failed to load business profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);

    try {
      const paymentTerms = defaultPaymentTerms
        ? parseInt(defaultPaymentTerms, 10)
        : undefined;

      if (defaultPaymentTerms && isNaN(paymentTerms as number)) {
        Alert.alert('Error', 'Payment terms must be a valid number');
        setIsSubmitting(false);
        return;
      }

      await businessProfileApi.update({
        companyName: companyName.trim() || undefined,
        tradingAs: tradingAs.trim() || undefined,
        irdNumber: irdNumber.trim() || undefined,
        companyAddress: companyAddress.trim() || undefined,
        companyPhone: companyPhone.trim() || undefined,
        companyEmail: companyEmail.trim() || undefined,
        invoiceBccEmail: invoiceBccEmail.trim() || undefined,
        invoicePrefix: invoicePrefix.trim() || undefined,
        defaultPaymentTerms: paymentTerms,
        defaultNotes: defaultNotes.trim() || undefined,
        isGstRegistered,
        gstNumber: isGstRegistered ? gstNumber.trim() || undefined : undefined,
      });

      Alert.alert('Success', 'Business profile updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Failed to update business profile:', error);
      Alert.alert('Error', 'Failed to update business profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/settings" />
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading profile...</Text>
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
        <InContentBack fallback="/settings" />
        {/* Company Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Company Name</Text>
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Your registered company name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Trading As</Text>
            <TextInput
              style={styles.input}
              value={tradingAs}
              onChangeText={setTradingAs}
              placeholder="Trading name (if different)"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>IRD Number</Text>
            <TextInput
              style={styles.input}
              value={irdNumber}
              onChangeText={setIrdNumber}
              placeholder="e.g., 12-345-678"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>Your Inland Revenue Department number</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Company Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={companyAddress}
              onChangeText={setCompanyAddress}
              placeholder="Street address, suburb, city"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={companyPhone}
              onChangeText={setCompanyPhone}
              placeholder="e.g., 09 123 4567"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={companyEmail}
              onChangeText={setCompanyEmail}
              placeholder="accounts@yourbusiness.co.nz"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Invoice BCC Email</Text>
            <TextInput
              style={styles.input}
              value={invoiceBccEmail}
              onChangeText={setInvoiceBccEmail}
              placeholder="accounts@yourbusiness.co.nz"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.hint}>
              Silent copy of every emailed invoice (business mailbox). If blank, uses
              company email, then your login email.
            </Text>
          </View>
        </View>

        {/* Invoice Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Settings</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Invoice Prefix</Text>
            <TextInput
              style={styles.input}
              value={invoicePrefix}
              onChangeText={(text) =>
                setInvoicePrefix(text.slice(0, 10))
              }
              placeholder="e.g., INV"
              placeholderTextColor="#9CA3AF"
              maxLength={10}
              autoCapitalize="characters"
            />
            <Text style={styles.hint}>
              Appears before invoice numbers (max 10 characters)
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Default Payment Terms (days)</Text>
            <TextInput
              style={styles.input}
              value={defaultPaymentTerms}
              onChangeText={setDefaultPaymentTerms}
              placeholder="e.g., 14"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>
              Number of days until payment is due
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Default Invoice Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={defaultNotes}
              onChangeText={setDefaultNotes}
              placeholder="e.g., Thank you for your business. Please pay by the due date."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
            />
            <Text style={styles.hint}>
              Appears at the bottom of every invoice
            </Text>
          </View>

          {/* GST Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>GST Registered</Text>
              <Text style={styles.toggleDescription}>
                Enable if your business is registered for GST
              </Text>
            </View>
            <Switch
              value={isGstRegistered}
              onValueChange={setIsGstRegistered}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isGstRegistered ? '#FF6B35' : '#9CA3AF'}
            />
          </View>

          {isGstRegistered && (
            <View style={[styles.inputGroup, styles.gstNumberGroup]}>
              <Text style={styles.label}>GST Number</Text>
              <TextInput
                style={styles.input}
                value={gstNumber}
                onChangeText={setGstNumber}
                placeholder="e.g., 12-345-678"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
              />
              <Text style={styles.hint}>
                Your GST registration number from IRD
              </Text>
            </View>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Saving...' : 'Save Business Profile'}
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
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
  gstNumberGroup: {
    marginTop: 16,
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
    marginBottom: 0,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
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
