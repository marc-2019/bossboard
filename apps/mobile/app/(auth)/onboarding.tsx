/**
 * Onboarding Wizard Screen
 * 3-step setup after email verification:
 * 1. Trade type + business name
 * 2. Company details (address, phone, email)
 * 3. Bank details for invoicing
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { businessProfileApi } from '../../src/services/api';

const TRADE_TYPES = [
  { id: 'electrician', label: '⚡ Electrician' },
  { id: 'plumber', label: '🔧 Plumber' },
  { id: 'builder', label: '🏗️ Builder' },
  { id: 'landscaper', label: '🌿 Landscaper' },
  { id: 'painter', label: '🎨 Painter' },
  { id: 'other', label: '🔨 Other' },
];

const TOTAL_STEPS = 3;

export default function OnboardingScreen() {
  const { user, completeOnboarding, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Trade & Business
  const [tradeType, setTradeType] = useState(user?.tradeType || '');
  const [businessName, setBusinessName] = useState(user?.businessName || '');

  // Step 2: Company Details
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState(user?.phone || '');
  const [companyEmail, setCompanyEmail] = useState(user?.email || '');

  // Step 3: Bank Details
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return !!tradeType;
      case 2:
        return true; // All fields optional
      case 3:
        return true; // All fields optional
      default:
        return false;
    }
  }

  async function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }

    // Final step - save profile and complete onboarding
    setIsSubmitting(true);
    try {
      // Save business profile with all collected data
      await businessProfileApi.update({
        companyName: businessName.trim() || undefined,
        companyAddress: companyAddress.trim() || undefined,
        companyPhone: companyPhone.trim() || undefined,
        companyEmail: companyEmail.trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
      });

      // Update user profile with trade type if changed
      if (tradeType) {
        const { api } = await import('../../src/services/api');
        await api.put('/api/v1/auth/me', {
          tradeType,
          businessName: businessName.trim() || undefined,
        });
      }

      // Mark onboarding complete
      await completeOnboarding();
      await refreshUser();
    } catch (error) {
      console.error('Onboarding error:', error);
      Alert.alert(
        'Setup Error',
        'There was an issue saving your details. You can update them later in Settings.',
        [
          { text: 'Try Again', style: 'cancel' },
          {
            text: 'Skip for Now',
            onPress: async () => {
              try {
                await completeOnboarding();
                await refreshUser();
              } catch {
                Alert.alert('Error', 'Failed to complete setup. Please try again.');
              }
            },
          },
        ]
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1);
    }
  }

  function handleSkip() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>BossBoard</Text>
          <Text style={styles.welcome}>
            Welcome{user?.name ? `, ${user.name}` : ''}! 👋
          </Text>
          <Text style={styles.subtitle}>
            Built for small NZ crews — SWMS, invoices, less paperwork after the job
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i + 1 <= step ? styles.progressDotActive : null,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepLabel}>Step {step} of {TOTAL_STEPS}</Text>

        {/* Step Content */}
        <View style={styles.stepContent}>
          {step === 1 && (
            <>
              <Text style={styles.stepTitle}>What's your trade?</Text>
              <Text style={styles.stepDescription}>
                For tradie crews who need invoices and SWMS without enterprise job software.
                We customise templates for your trade.
              </Text>
              <View style={styles.tradeGrid}>
                {TRADE_TYPES.map((trade) => (
                  <TouchableOpacity
                    key={trade.id}
                    style={[
                      styles.tradeButton,
                      tradeType === trade.id && styles.tradeButtonSelected,
                    ]}
                    onPress={() => setTradeType(trade.id)}
                  >
                    <Text
                      style={[
                        styles.tradeButtonText,
                        tradeType === trade.id && styles.tradeButtonTextSelected,
                      ]}
                    >
                      {trade.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Business Name</Text>
                <TextInput
                  style={styles.input}
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g., Smith Electrical Ltd"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.hint}>This appears on your invoices and quotes</Text>
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.stepTitle}>Company Details</Text>
              <Text style={styles.stepDescription}>
                These details appear on your invoices. You can update them later in Settings.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Business Address</Text>
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
                  placeholder="e.g., 021 123 4567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Business Email</Text>
                <TextInput
                  style={styles.input}
                  value={companyEmail}
                  onChangeText={setCompanyEmail}
                  placeholder="accounts@yourbusiness.co.nz"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.hint}>Used as the reply-to on emailed invoices</Text>
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.stepTitle}>Bank Details</Text>
              <Text style={styles.stepDescription}>
                So your clients know where to pay you. This appears on your invoices.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Account Name</Text>
                <TextInput
                  style={styles.input}
                  value={bankAccountName}
                  onChangeText={setBankAccountName}
                  placeholder="e.g., Smith Electrical Ltd"
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
                  placeholder="e.g., ANZ, ASB, Westpac"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </>
          )}
        </View>

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          <View style={styles.rightButtons}>
            {step > 1 && step < TOTAL_STEPS && (
              <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.nextButton,
                (!canProceed() || isSubmitting) && styles.nextButtonDisabled,
              ]}
              onPress={handleNext}
              disabled={!canProceed() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.nextButtonText}>
                  {step === TOTAL_STEPS ? 'Get Started' : 'Next'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FF6B35',
    marginBottom: 16,
  },
  welcome: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressDot: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  progressDotActive: {
    backgroundColor: '#FF6B35',
  },
  stepLabel: {
    textAlign: 'center',
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 24,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 24,
  },
  tradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  tradeButton: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
  },
  tradeButtonSelected: {
    borderColor: '#FF6B35',
    backgroundColor: '#EFF6FF',
  },
  tradeButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },
  tradeButtonTextSelected: {
    color: '#FF6B35',
    fontWeight: '600',
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
    backgroundColor: '#F9FAFB',
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
    color: '#9CA3AF',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    paddingBottom: 20,
  },
  backButton: {
    padding: 16,
  },
  backButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 'auto',
  },
  skipButton: {
    padding: 16,
  },
  skipButtonText: {
    color: '#9CA3AF',
    fontSize: 15,
  },
  nextButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 120,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
