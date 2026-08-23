/**
 * Create Job Log (Clock In) Screen
 * Quick clock-in form with job description, site address, and notes
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
import { jobLogsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';
import { JobLogKeyboardDismissChrome } from '../../src/components/JobLogKeyboardDismissChrome';
import {
  jobLogScrollKeyboard,
  jobLogTextFieldKeyboard,
} from '../../src/utils/jobLogKeyboard';

export default function CreateJobLogScreen() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleClockIn() {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a job description');
      return;
    }

    setIsSaving(true);
    try {
      await jobLogsApi.create({
        description: description.trim(),
        siteAddress: siteAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      router.back();
    } catch (error: any) {
      const message = error?.response?.data?.message || error.message || 'Failed to clock in';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  }

  const now = new Date();
  const timeString = now.toLocaleTimeString('en-NZ', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateString = now.toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        {...jobLogScrollKeyboard}
      >
        <InContentBack fallback="/(tabs)" color="#0D9488" />
        <JobLogKeyboardDismissChrome>
          <View style={styles.clockHeader}>
            <View style={styles.clockIconWrap}>
              <Ionicons name="timer" size={32} color="#0D9488" />
            </View>
            <Text style={styles.clockTime}>{timeString}</Text>
            <Text style={styles.clockDate}>{dateString}</Text>
          </View>
        </JobLogKeyboardDismissChrome>

        <View style={styles.section}>
          <JobLogKeyboardDismissChrome>
            <Text style={styles.sectionLabel}>Job Description *</Text>
          </JobLogKeyboardDismissChrome>
          <TextInput
            style={styles.textInput}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Bathroom renovation, Wiring install"
            placeholderTextColor="#9CA3AF"
            autoFocus
            {...jobLogTextFieldKeyboard}
          />
        </View>

        <View style={styles.section}>
          <JobLogKeyboardDismissChrome>
            <Text style={styles.sectionLabel}>Site Address</Text>
          </JobLogKeyboardDismissChrome>
          <TextInput
            style={styles.textInput}
            value={siteAddress}
            onChangeText={setSiteAddress}
            placeholder="e.g. 42 Queen St, Auckland"
            placeholderTextColor="#9CA3AF"
            {...jobLogTextFieldKeyboard}
          />
        </View>

        <View style={styles.section}>
          <JobLogKeyboardDismissChrome>
            <Text style={styles.sectionLabel}>Notes (optional)</Text>
          </JobLogKeyboardDismissChrome>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any details about this job..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            {...jobLogTextFieldKeyboard}
          />
        </View>

        <TouchableOpacity
          style={[styles.clockInButton, isSaving && styles.clockInButtonDisabled]}
          onPress={handleClockIn}
          disabled={isSaving}
        >
          <Ionicons name="play" size={22} color="#fff" />
          <Text style={styles.clockInButtonText}>
            {isSaving ? 'Clocking In...' : 'Clock In'}
          </Text>
        </TouchableOpacity>

        <JobLogKeyboardDismissChrome>
          <Text style={styles.hint}>
            You can clock out from the job detail screen when you're done.
          </Text>
        </JobLogKeyboardDismissChrome>
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
  clockHeader: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  clockIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clockTime: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
  },
  clockDate: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  clockInButton: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  clockInButtonDisabled: {
    opacity: 0.6,
  },
  clockInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 16,
  },
});
