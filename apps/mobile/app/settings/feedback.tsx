/**
 * Send Feedback Screen
 * Minimal in-app feedback form posting to POST /api/v1/feedback.
 * Replaces the old "email us" Alert; keeps an email fallback link.
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
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { feedbackApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

type Category = 'bug' | 'idea' | 'other';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: "Something's broken" },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Other' },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('bug');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await feedbackApi.submit({
        category,
        message: message.trim(),
        ...(rating ? { rating } : {}),
        pageContext: 'settings/feedback',
        appVersion: `${Platform.OS}-${Constants.expoConfig?.version || 'unknown'}`,
      });
      Alert.alert('Thanks — we got it', 'Your message is with the team. You can keep using the app as usual.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Could not send feedback. Please try again, or email support@instilligent.com.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <InContentBack fallback="/settings" />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What is it about?</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, category === c.value && styles.chipActive]}
              onPress={() => setCategory(c.value)}
            >
              <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <TextInput
          style={styles.textarea}
          value={message}
          onChangeText={setMessage}
          placeholder="What happened, or what would help?"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={5}
          maxLength={5000}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rate BossBoard so far (optional)</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setRating(rating === n ? null : n)}
              style={styles.starButton}
            >
              <Ionicons
                name={rating !== null && n <= rating ? 'star' : 'star-outline'}
                size={28}
                color={rating !== null && n <= rating ? '#F59E0B' : '#D1D5DB'}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, (!message.trim() || sending) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!message.trim() || sending}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.submitButtonText}>Send Feedback</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.emailFallback}
        onPress={() => Linking.openURL('mailto:support@instilligent.com')}
      >
        <Text style={styles.emailFallbackText}>Prefer email? support@instilligent.com</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
  },
  textarea: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 120,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 4,
  },
  starButton: {
    padding: 4,
  },
  submitButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emailFallback: {
    marginTop: 16,
    alignItems: 'center',
  },
  emailFallbackText: {
    fontSize: 14,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
});
