/**
 * Bank Details Screen
 * Form for editing NZD and international bank account details
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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { businessProfileApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

export default function BankDetailsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // NZD Bank Account (Wise Local)
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');

  // International Bank (Wise)
  const [intlBankAccountName, setIntlBankAccountName] = useState('');
  const [intlIban, setIntlIban] = useState('');
  const [intlSwiftBic, setIntlSwiftBic] = useState('');
  const [intlBankName, setIntlBankName] = useState('');
  const [intlBankAddress, setIntlBankAddress] = useState('');
  const [intlRoutingNumber, setIntlRoutingNumber] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const response = await businessProfileApi.get();
      const profile = (response.data as any).data;
      if (profile) {
        setBankAccountName(profile.bankAccountName || '');
        setBankAccountNumber(profile.bankAccountNumber || '');
        setBankName(profile.bankName || '');
        setIntlBankAccountName(profile.intlBankAccountName || '');
        setIntlIban(profile.intlIban || '');
        setIntlSwiftBic(profile.intlSwiftBic || '');
        setIntlBankName(profile.intlBankName || '');
        setIntlBankAddress(profile.intlBankAddress || '');
        setIntlRoutingNumber(profile.intlRoutingNumber || '');
      }
    } catch (error) {
      console.error('Failed to load bank details:', error);
      Alert.alert('Error', 'Failed to load bank details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);

    try {
      await businessProfileApi.update({
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
        intlBankAccountName: intlBankAccountName.trim() || undefined,
        intlIban: intlIban.trim() || undefined,
        intlSwiftBic: intlSwiftBic.trim() || undefined,
        intlBankName: intlBankName.trim() || undefined,
        intlBankAddress: intlBankAddress.trim() || undefined,
        intlRoutingNumber: intlRoutingNumber.trim() || undefined,
      });

      Alert.alert('Success', 'Bank details updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Failed to update bank details:', error);
      Alert.alert('Error', 'Failed to update bank details. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <InContentBack fallback="/settings" />
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading bank details...</Text>
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
        {/* NZD Bank Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NZD Bank Account (Wise Local)</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Name</Text>
            <TextInput
              style={styles.input}
              value={bankAccountName}
              onChangeText={setBankAccountName}
              placeholder="Your business or personal name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Number</Text>
            <TextInput
              style={styles.input}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              placeholder="00-0000-0000000-00"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>NZ bank account format</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bank Name</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="e.g., Wise, ANZ, ASB"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* International Bank */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>International Bank (Wise)</Text>

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
              placeholder="e.g., BE12 3456 7890 1234"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>SWIFT / BIC</Text>
            <TextInput
              style={styles.input}
              value={intlSwiftBic}
              onChangeText={setIntlSwiftBic}
              placeholder="e.g., TRWIBEB1XXX"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bank Name</Text>
            <TextInput
              style={styles.input}
              value={intlBankName}
              onChangeText={setIntlBankName}
              placeholder="e.g., Wise Europe SA"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bank Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={intlBankAddress}
              onChangeText={setIntlBankAddress}
              placeholder="Full bank address"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Routing Number</Text>
            <TextInput
              style={styles.input}
              value={intlRoutingNumber}
              onChangeText={setIntlRoutingNumber}
              placeholder="e.g., 026073008"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>
              Required for USD transfers
            </Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Saving...' : 'Save Bank Details'}
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
