/**
 * Generate SWMS Screen
 * Form to create a new SWMS document
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
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { swmsApi } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { safeGoBack } from '../../src/utils/navigation';
import { BackButton } from '../../src/components/BackButton';

interface Template {
  id: string;
  name: string;
  trade_type: string;
}

const TRADE_OPTIONS = [
  { id: 'electrician', label: 'Electrician', icon: 'flash' },
  { id: 'plumber', label: 'Plumber', icon: 'water' },
  { id: 'builder', label: 'Builder', icon: 'hammer' },
  { id: 'landscaper', label: 'Landscaper', icon: 'leaf' },
  { id: 'painter', label: 'Painter', icon: 'color-palette' },
];

export default function GenerateSWMSScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [tradeType, setTradeType] = useState(user?.tradeType || '');
  const [jobDescription, setJobDescription] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [duration, setDuration] = useState('');
  const [useAI, setUseAI] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  async function handleGenerate() {
    if (!tradeType) {
      Alert.alert('Error', 'Please select a trade type');
      return;
    }
    if (!jobDescription) {
      Alert.alert('Error', 'Please describe the job');
      return;
    }

    setIsLoading(true);
    try {
      const response = await swmsApi.generate({
        tradeType,
        jobDescription,
        siteAddress: siteAddress || undefined,
        clientName: clientName || undefined,
        expectedDuration: duration || undefined,
        useAI,
      });

      if (response.data.success) {
        const docId = response.data.data.document.id;
        // Use push (not replace) so the stack keeps Generate → Detail history.
        // replace left canGoBack() false and trapped users on detail with no native back
        // (App Review walk 2026-07-18). safeGoBack still falls back to tabs if needed.
        Alert.alert('Success', 'SWMS document generated!', [
          {
            text: 'View Document',
            onPress: () => router.push(`/swms/${docId}` as any),
          },
          {
            text: 'Done',
            style: 'cancel',
            onPress: () => safeGoBack(router, '/(tabs)'),
          },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed';
      Alert.alert('Generation Failed', message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoid}
    >
    {/* Always supply headerLeft — native back can be missing when stack has no history */}
    <Stack.Screen
      options={{
        title: 'Generate SWMS',
        headerShown: true,
        headerBackVisible: false,
        headerLeft: () => <BackButton />,
      }}
    />
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* In-content fallback if native header is hidden on some navigators */}
      <View style={styles.inContentNav}>
        <TouchableOpacity
          onPress={() => safeGoBack(router)}
          style={styles.inContentBack}
          accessibilityLabel="Go back"
          testID="generate-swms-back"
        >
          <Ionicons name="chevron-back" size={22} color="#FF6B35" />
          <Text style={styles.inContentBackText}>Home</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>Trade Type *</Text>
      <View style={styles.tradeGrid}>
        {TRADE_OPTIONS.map((trade) => (
          <TouchableOpacity
            key={trade.id}
            style={[
              styles.tradeCard,
              tradeType === trade.id && styles.tradeCardSelected,
            ]}
            onPress={() => setTradeType(trade.id)}
          >
            <Ionicons
              name={trade.icon as any}
              size={24}
              color={tradeType === trade.id ? '#FF6B35' : '#6B7280'}
            />
            <Text
              style={[
                styles.tradeLabel,
                tradeType === trade.id && styles.tradeLabelSelected,
              ]}
            >
              {trade.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Job Description *</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Describe the work to be performed..."
        value={jobDescription}
        onChangeText={setJobDescription}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Text style={styles.sectionTitle}>Site Address</Text>
      <TextInput
        style={styles.input}
        placeholder="123 Main Street, Auckland"
        value={siteAddress}
        onChangeText={setSiteAddress}
      />

      <Text style={styles.sectionTitle}>Client Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Client or company name"
        value={clientName}
        onChangeText={setClientName}
      />

      <Text style={styles.sectionTitle}>Expected Duration</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., 2 days, 1 week"
        value={duration}
        onChangeText={setDuration}
      />

      <View style={styles.aiToggle}>
        <View style={styles.aiToggleInfo}>
          <Ionicons name="sparkles" size={20} color="#8B5CF6" />
          <View style={styles.aiToggleText}>
            <Text style={styles.aiToggleLabel}>AI-Powered Generation</Text>
            <Text style={styles.aiToggleHint}>
              {useAI
                ? 'On: trade, job description, and site details you enter are sent to our AI provider (Anthropic) only to suggest hazards and controls for this SWMS. Not used for ads. Turn off to generate without third-party AI.'
                : 'Off: uses template hazards only — no third-party AI call. Turn on for smart suggestions (limited use as described when enabled).'}
            </Text>
          </View>
        </View>
        <Switch
          value={useAI}
          onValueChange={setUseAI}
          trackColor={{ false: '#D1D5DB', true: '#C4B5FD' }}
          thumbColor={useAI ? '#8B5CF6' : '#F3F4F6'}
          accessibilityLabel="AI-powered SWMS generation"
          accessibilityHint="When on, job details are sent to Anthropic for hazard suggestions only"
        />
      </View>

      <TouchableOpacity
        style={[styles.generateButton, isLoading && styles.buttonDisabled]}
        onPress={handleGenerate}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="document-text" size={20} color="#fff" />
            <Text style={styles.generateButtonText}>Generate SWMS</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
        <Text style={styles.disclaimerText}>
          Generated documents are designed to align with the NZ Health and Safety at Work Act 2015. This app is not affiliated with WorkSafe NZ or any government agency.
          Always review and customise for your specific situation.
        </Text>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  inContentNav: {
    marginBottom: 4,
  },
  inContentBack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
    gap: 2,
  },
  inContentBackText: {
    fontSize: 16,
    color: '#FF6B35',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  tradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tradeCard: {
    width: '31%',
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
  tradeCardSelected: {
    borderColor: '#FF6B35',
    backgroundColor: '#EFF6FF',
  },
  tradeLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  tradeLabelSelected: {
    color: '#FF6B35',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  aiToggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  aiToggleText: {
    flex: 1,
  },
  aiToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  aiToggleHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  generateButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
});
