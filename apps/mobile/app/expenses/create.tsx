/**
 * Create Expense Screen
 * Quick expense entry with category selection and GST toggle
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
import { expensesApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

const CATEGORIES = [
  { key: 'materials', label: 'Materials', icon: 'construct', color: '#FF6B35' },
  { key: 'fuel', label: 'Fuel', icon: 'car', color: '#F59E0B' },
  { key: 'tools', label: 'Tools', icon: 'hammer', color: '#8B5CF6' },
  { key: 'subcontractor', label: 'Subcontractor', icon: 'people', color: '#EC4899' },
  { key: 'vehicle', label: 'Vehicle', icon: 'car-sport', color: '#10B981' },
  { key: 'office', label: 'Office', icon: 'desktop', color: '#6366F1' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#6B7280' },
];

// Strip everything except digits and a single decimal point so non-numeric paste/IME input
// can't reach parseFloat. decimal-pad keyboard alone doesn't guarantee numeric input on web/Android.
function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

function parseAmountDollars(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : NaN;
}

export default function CreateExpenseScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('materials');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGstClaimable, setIsGstClaimable] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    const dollars = parseAmountDollars(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      Alert.alert('Error', 'Please enter a valid amount greater than zero');
      return;
    }

    setIsSaving(true);
    try {
      const amountCents = Math.round(dollars * 100);

      await expensesApi.create({
        date,
        amount: amountCents,
        category,
        description: description || undefined,
        vendor: vendor || undefined,
        isGstClaimable,
        notes: notes || undefined,
      });

      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save expense');
    } finally {
      setIsSaving(false);
    }
  }

  function formatDateDisplay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Calculate GST preview
  const parsedDollars = parseAmountDollars(amount);
  const amountCents = Number.isFinite(parsedDollars) && parsedDollars > 0
    ? Math.round(parsedDollars * 100)
    : 0;
  const gstAmount = isGstClaimable && amountCents > 0
    ? Math.round(amountCents * 0.15 / 1.15)
    : 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <InContentBack fallback="/(tabs)/money" color="#F59E0B" />
        {/* Amount Input */}
        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(text) => setAmount(sanitizeAmountInput(text))}
              placeholder="0.00"
              placeholderTextColor="#D1D5DB"
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>
          {isGstClaimable && gstAmount > 0 && (
            <Text style={styles.gstPreview}>
              GST component: ${(gstAmount / 100).toFixed(2)}
            </Text>
          )}
        </View>

        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryItem,
                  category === cat.key && styles.categoryItemActive,
                  category === cat.key && { borderColor: cat.color },
                ]}
                onPress={() => setCategory(cat.key)}
              >
                <View style={[styles.categoryIconWrap, { backgroundColor: cat.color + '15' }]}>
                  <Ionicons name={cat.icon as any} size={20} color={cat.color} />
                </View>
                <Text
                  style={[
                    styles.categoryLabel,
                    category === cat.key && { color: cat.color, fontWeight: '600' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            style={styles.textInput}
            value={description}
            onChangeText={setDescription}
            placeholder="What was this expense for?"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Vendor */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Vendor / Supplier</Text>
          <TextInput
            style={styles.textInput}
            value={vendor}
            onChangeText={setVendor}
            placeholder="e.g. Bunnings, Repco"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Date</Text>
          <TextInput
            style={styles.textInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.datePreview}>{formatDateDisplay(date)}</Text>
        </View>

        {/* GST Toggle */}
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setIsGstClaimable(!isGstClaimable)}
        >
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>GST Claimable</Text>
            <Text style={styles.toggleHint}>Amount includes 15% GST</Text>
          </View>
          <View style={[styles.toggle, isGstClaimable && styles.toggleActive]}>
            <View style={[styles.toggleKnob, isGstClaimable && styles.toggleKnobActive]} />
          </View>
        </TouchableOpacity>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Expense'}
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
  amountSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dollarSign: {
    fontSize: 36,
    fontWeight: '300',
    color: '#9CA3AF',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 42,
    fontWeight: '700',
    color: '#111827',
    minWidth: 120,
    textAlign: 'center',
  },
  gstPreview: {
    fontSize: 13,
    color: '#10B981',
    marginTop: 8,
    fontWeight: '500',
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  categoryItemActive: {
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
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
  datePreview: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    marginLeft: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  toggleHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: '#10B981',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  saveButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
