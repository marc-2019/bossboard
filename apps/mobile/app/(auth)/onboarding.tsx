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
import { businessProfileApi, api, ApiError } from '../../src/services/api';
import {
  validateOnboardingFields,
  formatApiStepError,
  normalizeNzBankAccountNumber,
  type OnboardingFieldErrors,
} from '../../src/utils/onboardingValidation';

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
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});

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

  async function finishWithoutProfile() {
    await completeOnboarding();
    await refreshUser();
  }

  function showSetupError(detail: string) {
    Alert.alert(
      'Setup Error',
      `${detail}\n\nYou can update company details later in Settings, or skip setup to use the app now.`,
      [
        { text: 'Try Again', style: 'cancel' },
        {
          text: 'Skip for Now',
          onPress: async () => {
            try {
              await finishWithoutProfile();
            } catch (e) {
              Alert.alert(
                'Error',
                formatApiStepError(e, 'Complete setup')
              );
            }
          },
        },
      ]
    );
  }

  async function handleNext() {
    if (step < TOTAL_STEPS) {
      // Validate company email when leaving step 2
      if (step === 2) {
        const errs = validateOnboardingFields({
          companyEmail,
          bankAccountNumber: '',
        });
        if (errs.companyEmail) {
          setFieldErrors(errs);
          return;
        }
        setFieldErrors({});
      }
      setStep(step + 1);
      return;
    }

    // Final step — client validation first (App Review recording 2026-07-18)
    const errs = validateOnboardingFields({ companyEmail, bankAccountNumber });
    if (errs.companyEmail || errs.bankAccountNumber) {
      setFieldErrors(errs);
      const msg = [errs.companyEmail, errs.bankAccountNumber].filter(Boolean).join('\n');
      Alert.alert('Check your details', msg);
      return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    const bankNumber = bankAccountNumber.trim()
      ? normalizeNzBankAccountNumber(bankAccountNumber)
      : undefined;

    try {
      // Step A — business profile (may fail independently)
      try {
        const profileRes = await businessProfileApi.update({
          companyName: businessName.trim() || undefined,
          companyAddress: companyAddress.trim() || undefined,
          companyPhone: companyPhone.trim() || undefined,
          companyEmail: companyEmail.trim() || undefined,
          bankAccountName: bankAccountName.trim() || undefined,
          bankAccountNumber: bankNumber,
          bankName: bankName.trim() || undefined,
        });
        if (profileRes.data && profileRes.data.success === false) {
          throw new ApiError(
            profileRes.data.message || 'Business profile save failed',
            profileRes.status || 400,
            profileRes.data.error || 'PROFILE_SAVE_FAILED'
          );
        }
      } catch (e) {
        console.error('Onboarding profile step:', e);
        showSetupError(formatApiStepError(e, 'Business profile'));
        return;
      }

      // Step B — trade / business name on user
      if (tradeType) {
        try {
          const meRes = await api.put('/api/v1/auth/me', {
            tradeType,
            businessName: businessName.trim() || undefined,
          });
          if (meRes.data && meRes.data.success === false) {
            throw new Error(meRes.data.message || 'Profile update failed');
          }
        } catch (e) {
          console.error('Onboarding auth/me step:', e);
          showSetupError(formatApiStepError(e, 'Trade / business name'));
          return;
        }
      }

      // Step C — mark onboarding complete
      try {
        await completeOnboarding();
        await refreshUser();
      } catch (e) {
        console.error('Onboarding complete step:', e);
        showSetupError(formatApiStepError(e, 'Finish setup'));
      }
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
          <Text style={styles.subtitle}>Let's get your account set up</Text>
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
                This helps us customise your SWMS templates and hazard suggestions.
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
                  style={[styles.input, fieldErrors.companyEmail ? styles.inputError : null]}
                  value={companyEmail}
                  onChangeText={(t) => {
                    setCompanyEmail(t);
                    if (fieldErrors.companyEmail) {
                      setFieldErrors((e) => ({ ...e, companyEmail: undefined }));
                    }
                  }}
                  placeholder="accounts@yourbusiness.co.nz"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {fieldErrors.companyEmail ? (
                  <Text style={styles.fieldError}>{fieldErrors.companyEmail}</Text>
                ) : (
                  <Text style={styles.hint}>Used as the reply-to on emailed invoices</Text>
                )}
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
                  style={[styles.input, fieldErrors.bankAccountNumber ? styles.inputError : null]}
                  value={bankAccountNumber}
                  onChangeText={(t) => {
                    setBankAccountNumber(t);
                    if (fieldErrors.bankAccountNumber) {
                      setFieldErrors((e) => ({ ...e, bankAccountNumber: undefined }));
                    }
                  }}
                  placeholder="00-0000-0000000-00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                />
                {fieldErrors.bankAccountNumber ? (
                  <Text style={styles.fieldError}>{fieldErrors.bankAccountNumber}</Text>
                ) : (
                  <Text style={styles.hint}>NZ format: 01-1234-5678901-00 (or leave blank)</Text>
                )}
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
            {/* Final step: allow finishing without saving profile (App Review / flaky network) */}
            {step === TOTAL_STEPS && !isSubmitting && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={async () => {
                  try {
                    setIsSubmitting(true);
                    await finishWithoutProfile();
                  } catch (e) {
                    Alert.alert('Error', formatApiStepError(e, 'Complete setup'));
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                <Text style={styles.skipButtonText}>Skip setup</Text>
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
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  fieldError: {
    fontSize: 13,
    color: '#DC2626',
    marginTop: 6,
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
