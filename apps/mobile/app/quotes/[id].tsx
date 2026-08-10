/**
 * Quote Detail Screen
 * Adapted from invoices/[id].tsx with purple theme and quote-specific actions
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { quotesApi, getAuthToken } from '../../src/services/api';
import PhotoAttachments from '../../src/components/PhotoAttachments';

interface QuoteLineItem {
  id: string;
  description: string;
  amount: number;
}

interface Quote {
  id: string;
  quote_number: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  job_description: string | null;
  line_items: QuoteLineItem[];
  subtotal: number;
  gst_amount: number;
  total: number;
  include_gst: boolean;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted';
  valid_until: string | null;
  converted_invoice_id: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  intl_bank_account_name: string | null;
  intl_iban: string | null;
  intl_swift_bic: string | null;
  intl_bank_name: string | null;
  intl_bank_address: string | null;
  company_name: string | null;
  company_address: string | null;
  ird_number: string | null;
  gst_number: string | null;
  notes: string | null;
  internal_memo?: string | null;
  created_at: string;
}

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQuote();
  }, [id]);

  async function loadQuote() {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await quotesApi.get(id);
      const data = (response.data as any).data?.quote;
      if (data) {
        setQuote(data);
      } else {
        setError('Quote not found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quote');
    }
    setIsLoading(false);
  }

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'accepted': return '#10B981';
      case 'sent': return '#8B5CF6';
      case 'declined': return '#EF4444';
      case 'expired': return '#F59E0B';
      case 'converted': return '#6B7280';
      case 'draft':
      default: return '#6B7280';
    }
  }

  function getStatusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  async function handleMarkAsSent() {
    if (!quote) return;
    Alert.alert('Mark as Sent', 'Mark this quote as sent to the client?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Sent',
        onPress: async () => {
          try {
            const response = await quotesApi.markAsSent(quote.id);
            const updated = (response.data as any).data?.quote;
            if (updated) setQuote(updated);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update quote');
          }
        },
      },
    ]);
  }

  async function handleMarkAsAccepted() {
    if (!quote) return;
    Alert.alert('Accept Quote', 'Mark this quote as accepted by the client?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          try {
            const response = await quotesApi.markAsAccepted(quote.id);
            const updated = (response.data as any).data?.quote;
            if (updated) setQuote(updated);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update quote');
          }
        },
      },
    ]);
  }

  async function handleMarkAsDeclined() {
    if (!quote) return;
    Alert.alert('Decline Quote', 'Mark this quote as declined by the client?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await quotesApi.markAsDeclined(quote.id);
            const updated = (response.data as any).data?.quote;
            if (updated) setQuote(updated);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update quote');
          }
        },
      },
    ]);
  }

  async function handleConvertToInvoice() {
    if (!quote) return;
    Alert.alert(
      'Convert to Invoice',
      'This will create a new invoice from this quote. The quote will be marked as converted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            try {
              const response = await quotesApi.convertToInvoice(quote.id);
              const invoiceId = (response.data as any).data?.invoice?.id;
              Alert.alert('Success', 'Quote converted to invoice!', [
                {
                  text: 'View Invoice',
                  onPress: () => {
                    if (invoiceId) {
                      router.push(`/invoices/${invoiceId}` as any);
                    }
                  },
                },
                { text: 'Stay Here', onPress: () => loadQuote() },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to convert quote');
            }
          },
        },
      ]
    );
  }

  async function handleDelete() {
    if (!quote) return;
    Alert.alert('Delete Quote', 'Are you sure you want to delete this quote? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await quotesApi.delete(quote.id);
            router.back();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete quote');
          }
        },
      },
    ]);
  }

  async function handleDownloadPDF() {
    if (!quote) return;
    try {
      const token = getAuthToken();
      const pdfUrl = quotesApi.getPdfUrl(quote.id);
      const fileUri = `${FileSystem.documentDirectory}Quote-${quote.quote_number}.pdf`;

      const result = await FileSystem.downloadAsync(pdfUrl, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (result.status === 200) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Quote ${quote.quote_number}`,
        });
      } else {
        Alert.alert('Error', 'Failed to download PDF');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to download PDF');
    }
  }

  async function handleShare() {
    if (!quote) return;
    try {
      await Share.share({
        message: `Quote ${quote.quote_number}\nClient: ${quote.client_name}\nTotal: ${formatCurrency(quote.total)}${quote.valid_until ? `\nValid Until: ${formatDate(quote.valid_until)}` : ''}`,
        title: `Quote ${quote.quote_number}`,
      });
    } catch (err) {
      // User cancelled
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading quote...</Text>
      </View>
    );
  }

  if (error || !quote) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error || 'Quote not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadQuote}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = getStatusColor(quote.status);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{quote.quote_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusLabel(quote.status)}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
            <Ionicons name="share-outline" size={22} color="#1F2937" />
          </TouchableOpacity>
        </View>

        {/* Client Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-outline" size={18} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Client</Text>
          </View>
          <Text style={styles.clientName}>{quote.client_name}</Text>
          {quote.client_email && (
            <Text style={styles.clientDetail}>{quote.client_email}</Text>
          )}
          {quote.client_phone && (
            <Text style={styles.clientDetail}>{quote.client_phone}</Text>
          )}
        </View>

        {/* Job Description */}
        {quote.job_description && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="construct-outline" size={18} color="#8B5CF6" />
              <Text style={styles.cardTitle}>Job Description</Text>
            </View>
            <Text style={styles.jobDescription}>{quote.job_description}</Text>
          </View>
        )}

        {/* Line Items & Totals */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="list-outline" size={18} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Items</Text>
          </View>

          {quote.line_items.map((item, index) => (
            <View key={item.id || index} style={styles.lineItem}>
              <Text style={styles.lineDescription}>{item.description}</Text>
              <Text style={styles.lineAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(quote.subtotal)}</Text>
          </View>

          {quote.include_gst && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST (15%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(quote.gst_amount)}</Text>
            </View>
          )}

          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(quote.total)}</Text>
          </View>
        </View>

        {/* Company Details */}
        {quote.company_name && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="business-outline" size={18} color="#8B5CF6" />
              <Text style={styles.cardTitle}>From</Text>
            </View>
            <Text style={styles.companyName}>{quote.company_name}</Text>
            {quote.company_address && (
              <Text style={styles.companyDetail}>{quote.company_address}</Text>
            )}
            {quote.ird_number && (
              <Text style={styles.companyDetail}>IRD: {quote.ird_number}</Text>
            )}
            {quote.gst_number && (
              <Text style={styles.companyDetail}>GST: {quote.gst_number}</Text>
            )}
          </View>
        )}

        {/* Payment / Dates */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Details</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailValue}>{formatDate(quote.created_at)}</Text>
          </View>

          {quote.valid_until && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Valid Until</Text>
              <Text style={styles.detailValue}>{formatDate(quote.valid_until)}</Text>
            </View>
          )}

          {/* Bank Details */}
          {(quote.bank_account_name || quote.bank_account_number) && (
            <>
              <View style={styles.divider} />
              <Text style={styles.subTitle}>Bank Details</Text>
              {quote.bank_account_name && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Name</Text>
                  <Text style={styles.detailValue}>{quote.bank_account_name}</Text>
                </View>
              )}
              {quote.bank_account_number && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Number</Text>
                  <Text style={styles.detailValue}>{quote.bank_account_number}</Text>
                </View>
              )}
            </>
          )}

          {/* International Bank */}
          {(quote.intl_bank_account_name || quote.intl_iban) && (
            <>
              <View style={styles.divider} />
              <Text style={styles.subTitle}>International Payments</Text>
              {quote.intl_bank_account_name && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Name</Text>
                  <Text style={styles.detailValue}>{quote.intl_bank_account_name}</Text>
                </View>
              )}
              {quote.intl_iban && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>IBAN</Text>
                  <Text style={styles.detailValue}>{quote.intl_iban}</Text>
                </View>
              )}
              {quote.intl_swift_bic && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>SWIFT/BIC</Text>
                  <Text style={styles.detailValue}>{quote.intl_swift_bic}</Text>
                </View>
              )}
            </>
          )}

          {/* Converted Invoice Link */}
          {quote.converted_invoice_id && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.convertedLink}
                onPress={() => router.push(`/invoices/${quote.converted_invoice_id}` as any)}
              >
                <Ionicons name="document-text" size={18} color="#8B5CF6" />
                <Text style={styles.convertedLinkText}>View Converted Invoice</Text>
                <Ionicons name="chevron-forward" size={18} color="#8B5CF6" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {quote.internal_memo ? (
          <View style={[styles.card, { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="lock-closed-outline" size={18} color="#92400E" />
              <Text style={[styles.cardTitle, { color: '#92400E' }]}>
                Internal memo (private)
              </Text>
            </View>
            <Text style={styles.notesText}>{quote.internal_memo}</Text>
          </View>
        ) : null}

        {/* Customer notes (PDF) */}
        {quote.notes && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={18} color="#8B5CF6" />
              <Text style={styles.cardTitle}>Customer notes (PDF)</Text>
            </View>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* Photos */}
        <View style={styles.card}>
          <PhotoAttachments
            entityType="quote"
            entityId={id!}
            editable={quote.status === 'draft'}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {/* Draft: Send + Edit */}
          {quote.status === 'draft' && (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={handleMarkAsSent}>
                <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Mark as Sent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => Alert.alert('Edit', 'Edit functionality coming soon')}
              >
                <Ionicons name="create-outline" size={18} color="#8B5CF6" />
                <Text style={styles.secondaryButtonText}>Edit Quote</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Sent: Accept + Decline */}
          {(quote.status === 'sent' || quote.status === 'expired') && (
            <>
              <TouchableOpacity style={styles.acceptButton} onPress={handleMarkAsAccepted}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Mark as Accepted</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineButton} onPress={handleMarkAsDeclined}>
                <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                <Text style={styles.declineButtonText}>Mark as Declined</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Accepted: Convert to Invoice */}
          {quote.status === 'accepted' && !quote.converted_invoice_id && (
            <TouchableOpacity style={styles.convertButton} onPress={handleConvertToInvoice}>
              <Ionicons name="swap-horizontal-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Convert to Invoice</Text>
            </TouchableOpacity>
          )}

          {/* Converted: View Invoice */}
          {quote.status === 'converted' && quote.converted_invoice_id && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push(`/invoices/${quote.converted_invoice_id}` as any)}
            >
              <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>View Invoice</Text>
            </TouchableOpacity>
          )}

          {/* Always: PDF + Delete */}
          <TouchableOpacity style={styles.pdfButton} onPress={handleDownloadPDF}>
            <Ionicons name="download-outline" size={18} color="#6B7280" />
            <Text style={styles.pdfButtonText}>Download PDF</Text>
          </TouchableOpacity>

          {quote.status !== 'converted' && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete Quote</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
  },
  clientDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  jobDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  lineDescription: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    paddingRight: 12,
  },
  lineAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 10,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  companyName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  companyDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    textAlign: 'right',
    maxWidth: '60%',
  },
  subTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  convertedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  convertedLinkText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#8B5CF6',
  },
  notesText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  actions: {
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#8B5CF6',
    fontSize: 15,
    fontWeight: '600',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  declineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    gap: 8,
  },
  declineButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  convertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 8,
  },
  pdfButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '500',
  },
});
