/**
 * Add Certification Screen
 * Form for adding new trade licenses and certifications
 */

import { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { certificationsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

const CERT_TYPES = [
  { id: 'electrical', label: 'Electrical', icon: 'flash' },
  { id: 'gas', label: 'Gas', icon: 'flame' },
  { id: 'plumbing', label: 'Plumbing', icon: 'water' },
  { id: 'lpg', label: 'LPG', icon: 'flame' },
  { id: 'first_aid', label: 'First Aid', icon: 'medkit' },
  { id: 'site_safe', label: 'Site Safe', icon: 'shield-checkmark' },
  { id: 'other', label: 'Other', icon: 'ribbon' },
] as const;

type CertType = typeof CERT_TYPES[number]['id'];

export default function AddCertificationScreen() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [certType, setCertType] = useState<CertType | null>(null);
  const [name, setName] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [issuingBody, setIssuingBody] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  function getDefaultName(type: CertType): string {
    const typeInfo = CERT_TYPES.find((t) => t.id === type);
    if (!typeInfo) return '';

    switch (type) {
      case 'electrical':
        return 'Electrical Registration';
      case 'gas':
        return 'Gasfitter Registration';
      case 'plumbing':
        return 'Plumber Registration';
      case 'lpg':
        return 'LPG Fitter Certificate';
      case 'first_aid':
        return 'First Aid Certificate';
      case 'site_safe':
        return 'Site Safe Passport';
      default:
        return '';
    }
  }

  function getDefaultIssuingBody(type: CertType): string {
    switch (type) {
      case 'electrical':
        return 'Electrical Workers Registration Board';
      case 'gas':
      case 'plumbing':
        return 'Plumbers, Gasfitters and Drainlayers Board';
      case 'lpg':
        return 'Energy Safety';
      case 'first_aid':
        return 'St John';
      case 'site_safe':
        return 'Site Safe NZ';
      default:
        return '';
    }
  }

  function handleTypeSelect(type: CertType) {
    setCertType(type);
    if (!name) setName(getDefaultName(type));
    if (!issuingBody) setIssuingBody(getDefaultIssuingBody(type));
  }

  async function handleSubmit() {
    // Validation
    if (!certType) {
      Alert.alert('Error', 'Please select a certification type');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a certification name');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await certificationsApi.create({
        type: certType,
        name: name.trim(),
        certNumber: certNumber.trim() || undefined,
        issuingBody: issuingBody.trim() || undefined,
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
      });

      if (response.data.success) {
        Alert.alert('Success', 'Certification added successfully', [
          {
            text: 'Done',
            onPress: () => router.back(),
          },
          {
            text: 'Add Another',
            onPress: () => {
              // Reset form
              setCertType(null);
              setName('');
              setCertNumber('');
              setIssuingBody('');
              setIssueDate('');
              setExpiryDate('');
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to create certification:', error);
      Alert.alert('Error', 'Failed to add certification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
        <InContentBack fallback="/(tabs)/people" />
        {/* Certification Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Certification Type *</Text>
          <View style={styles.typeGrid}>
            {CERT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeCard,
                  certType === type.id && styles.typeCardSelected,
                ]}
                onPress={() => handleTypeSelect(type.id)}
              >
                <View
                  style={[
                    styles.typeIcon,
                    certType === type.id && styles.typeIconSelected,
                  ]}
                >
                  <Ionicons
                    name={type.icon as keyof typeof Ionicons.glyphMap}
                    size={24}
                    color={certType === type.id ? '#fff' : '#FF6B35'}
                  />
                </View>
                <Text
                  style={[
                    styles.typeLabel,
                    certType === type.id && styles.typeLabelSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Certification Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Certification Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Electrical Registration"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Certificate Number</Text>
            <TextInput
              style={styles.input}
              value={certNumber}
              onChangeText={setCertNumber}
              placeholder="e.g., EW12345"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Issuing Body</Text>
            <TextInput
              style={styles.input}
              value={issuingBody}
              onChangeText={setIssuingBody}
              placeholder="e.g., Electrical Workers Registration Board"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dates</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Issue Date</Text>
            <TextInput
              style={styles.input}
              value={issueDate}
              onChangeText={setIssueDate}
              placeholder="YYYY-MM-DD (e.g., 2024-01-15)"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Expiry Date</Text>
            <TextInput
              style={styles.input}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD (e.g., 2026-01-15)"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.hint}>
              We'll remind you before it expires
            </Text>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#FF6B35" />
          <Text style={styles.infoText}>
            Track your certifications to stay compliant and get reminders before
            they expire. Under NZ law, you must hold a current practising licence
            for regulated trades.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Adding...' : 'Add Certification'}
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  typeCardSelected: {
    borderColor: '#FF6B35',
    backgroundColor: '#EFF6FF',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  typeIconSelected: {
    backgroundColor: '#FF6B35',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  typeLabelSelected: {
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
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
