/**
 * Edit Invoice Screen (draft only)
 * Loads existing invoice fields, saves via PUT, always has header back.
 */

import { useCallback, useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { invoicesApi } from '../../../src/services/api';
import { safeGoBack } from '../../../src/utils/navigation';

interface LineItem {
  id: string;
  description: string;
  amount: string;
}

function centsToDollars(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2);
}

function parseAmount(value: string): number {
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().split('T')[0];
}

export default function EditInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detailFallback = `/invoices/${id}`;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notEditable, setNotEditable] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: '', amount: '' },
  ]);
  const [includeGst, setIncludeGst] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const loadInvoice = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(false);
    setNotEditable(false);
    try {
      const response = await invoicesApi.get(id);
      if (!response.data.success) {
        setLoadError(true);
        Alert.alert('Error', 'Failed to load invoice');
        return;
      }
      const inv = response.data.data.invoice as {
        invoice_number?: string;
        status?: string;
        client_name?: string;
        client_email?: string | null;
        client_phone?: string | null;
        job_description?: string | null;
        line_items?: { id?: string; description?: string; amount?: number }[];
        include_gst?: boolean;
        due_date?: string | null;
        notes?: string | null;
      };

      setInvoiceNumber(inv.invoice_number || '');
      if (inv.status !== 'draft') {
        setNotEditable(true);
        return;
      }

      setClientName(inv.client_name || '');
      setClientEmail(inv.client_email || '');
      setClientPhone(inv.client_phone || '');
      setJobDescription(inv.job_description || '');
      setIncludeGst(inv.include_gst !== false);
      setDueDate(toDateInput(inv.due_date));
      setNotes(inv.notes || '');

      const lines = (inv.line_items || []).map((li, idx) => ({
        id: li.id || String(idx + 1),
        description: li.description || '',
        amount: centsToDollars(Number(li.amount || 0)),
      }));
      setLineItems(
        lines.length > 0 ? lines : [{ id: '1', description: '', amount: '' }]
      );
    } catch (error) {
      console.error('Failed to load invoice for edit:', error);
      setLoadError(true);
      Alert.alert('Error', 'Failed to load invoice');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  function updateLineItem(lineId: string, field: 'description' | 'amount', value: string) {
    setLineItems((rows) =>
      rows.map((r) => (r.id === lineId ? { ...r, [field]: value } : r))
    );
  }

  function addLineItem() {
    setLineItems((rows) => [
      ...rows,
      { id: String(Date.now()), description: '', amount: '' },
    ]);
  }

  function removeLineItem(lineId: string) {
    setLineItems((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== lineId) : rows));
  }

  function calculateSubtotal(): number {
    return lineItems.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  }

  function calculateGst(): number {
    return includeGst ? Math.round(calculateSubtotal() * 0.15) : 0;
  }

  function formatCurrency(cents: number): string {
    return (
      '$' +
      (cents / 100).toLocaleString('en-NZ', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  async function handleSubmit() {
    if (!clientName.trim()) {
      Alert.alert('Error', 'Please enter a client name');
      return;
    }

    const validLineItems = lineItems.filter(
      (item) => item.description.trim() && parseAmount(item.amount) > 0
    );

    if (validLineItems.length === 0) {
      Alert.alert('Error', 'Please add at least one line item with a description and amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await invoicesApi.update(id, {
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || '',
        clientPhone: clientPhone.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
        lineItems: validLineItems.map((item) => ({
          description: item.description.trim(),
          amount: parseAmount(item.amount),
        })),
        includeGst,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });

      if (response.data.success) {
        Alert.alert('Saved', 'Invoice updated', [
          {
            text: 'OK',
            onPress: () => router.replace(`/invoices/${id}` as any),
          },
        ]);
      } else {
        Alert.alert('Error', response.data.message || 'Failed to update invoice');
      }
    } catch (error: unknown) {
      console.error('Failed to update invoice:', error);
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to update invoice. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading invoice…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.emptyTitle}>Could not load invoice</Text>
        <Text style={styles.emptySubtitle}>
          Nothing was changed. Go back and try again — the form is not shown so
          a bad save cannot wipe a draft.
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeGoBack(router, detailFallback)}
          testID="edit-invoice-back-load-error"
        >
          <Text style={styles.backButtonText}>Back to invoice</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={loadInvoice}
          testID="edit-invoice-retry-load"
        >
          <Text style={styles.cancelButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (notEditable) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={48} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Invoice locked</Text>
        <Text style={styles.emptySubtitle}>
          Only draft invoices can be edited.
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeGoBack(router, detailFallback)}
          testID="edit-invoice-back-locked"
        >
          <Text style={styles.backButtonText}>Back to invoice</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.inContentBack}
          onPress={() => safeGoBack(router, detailFallback)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="edit-invoice-in-content-back"
        >
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
          <Text style={styles.inContentBackText}>
            Back{invoiceNumber ? ` · ${invoiceNumber}` : ''}
          </Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Edit invoice</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Client name *</Text>
          <TextInput
            style={styles.input}
            value={clientName}
            onChangeText={setClientName}
            placeholder="Client or company name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Client email</Text>
          <TextInput
            style={styles.input}
            value={clientEmail}
            onChangeText={setClientEmail}
            placeholder="client@example.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Client phone</Text>
          <TextInput
            style={styles.input}
            value={clientPhone}
            onChangeText={setClientPhone}
            placeholder="021 123 4567"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-07-31"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Job description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={jobDescription}
            onChangeText={setJobDescription}
            placeholder="Brief description of the work"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Line items</Text>
            <TouchableOpacity onPress={addLineItem} style={styles.addLineBtn}>
              <Ionicons name="add" size={18} color="#2563EB" />
              <Text style={styles.addLineText}>Add</Text>
            </TouchableOpacity>
          </View>

          {lineItems.map((item) => (
            <View key={item.id} style={styles.lineRow}>
              <TextInput
                style={[styles.input, styles.lineDesc]}
                value={item.description}
                onChangeText={(t) => updateLineItem(item.id, 'description', t)}
                placeholder="Description"
                placeholderTextColor="#9CA3AF"
              />
              <TextInput
                style={[styles.input, styles.lineAmount]}
                value={item.amount}
                onChangeText={(t) => updateLineItem(item.id, 'amount', t)}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                onPress={() => removeLineItem(item.id)}
                disabled={lineItems.length === 1}
                style={styles.removeLine}
                accessibilityLabel="Remove line item"
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={lineItems.length === 1 ? '#D1D5DB' : '#EF4444'}
                />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.gstRow}>
            <Text style={styles.gstLabel}>Include 15% GST</Text>
            <Switch
              value={includeGst}
              onValueChange={setIncludeGst}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={includeGst ? '#2563EB' : '#F3F4F6'}
            />
          </View>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(calculateSubtotal())}</Text>
            </View>
            {includeGst && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>GST (15%)</Text>
                <Text style={styles.totalValue}>{formatCurrency(calculateGst())}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalStrong]}>
              <Text style={styles.totalStrongLabel}>Total</Text>
              <Text style={styles.totalStrongValue}>
                {formatCurrency(calculateSubtotal() + calculateGst())}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Payment terms, thank-you message…"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isSubmitting && styles.primaryDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          testID="edit-invoice-save"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Save changes</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => safeGoBack(router, detailFallback)}
          disabled={isSubmitting}
          testID="edit-invoice-cancel"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  backButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  inContentBack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  inContentBackText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 2,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lineDesc: { flex: 1 },
  lineAmount: { width: 88 },
  removeLine: { padding: 6 },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLineText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
  gstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  gstLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  totals: { marginTop: 12 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: { fontSize: 14, color: '#6B7280' },
  totalValue: { fontSize: 14, color: '#374151' },
  totalStrong: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalStrongLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  totalStrongValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#6B7280', fontSize: 15, fontWeight: '500' },
});
