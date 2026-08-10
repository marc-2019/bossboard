/**
 * Invoice Detail Screen
 * View invoice details with actions to send, mark paid, edit, delete
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { invoicesApi, getAuthToken } from '../../src/services/api';
import PhotoAttachments from '../../src/components/PhotoAttachments';
import { safeGoBack } from '../../src/utils/navigation';

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  job_description: string | null;
  line_items: { id: string; description: string; amount: number }[];
  subtotal: number;
  discount_type?: string;
  discount_value?: number;
  discount_amount?: number;
  discount_label?: string | null;
  gst_amount: number;
  total: number;
  include_gst: boolean;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  due_date: string | null;
  paid_at: string | null;
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
  internalMemo?: string | null;
  created_at: string;
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [id]);

  async function loadInvoice() {
    try {
      const response = await invoicesApi.get(id);
      if (response.data.success) {
        setInvoice(response.data.data.invoice);
      }
    } catch (error) {
      console.error('Failed to load invoice:', error);
      Alert.alert('Error', 'Failed to load invoice');
    } finally {
      setIsLoading(false);
    }
  }

  function formatCurrency(cents: number): string {
    return '$' + (cents / 100).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'paid':
        return '#10B981';
      case 'sent':
        return '#2563EB';
      case 'overdue':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'paid':
        return 'Paid';
      case 'sent':
        return 'Sent';
      case 'overdue':
        return 'Overdue';
      default:
        return 'Draft';
    }
  }

  async function handleMarkAsSent() {
    Alert.alert(
      'Send Invoice',
      'Mark this invoice as sent to the client?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Sent',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await invoicesApi.markAsSent(id);
              if (response.data.success) {
                setInvoice(response.data.data.invoice);
                Alert.alert('Success', 'Invoice marked as sent');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update invoice');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  async function handleMarkAsPaid() {
    Alert.alert(
      'Mark as Paid',
      'Confirm this invoice has been paid?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Paid',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await invoicesApi.markAsPaid(id);
              if (response.data.success) {
                setInvoice(response.data.data.invoice);
                Alert.alert('Success', 'Invoice marked as paid');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update invoice');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Invoice',
      'Are you sure you want to delete this invoice? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const response = await invoicesApi.delete(id);
              if (response.data.success) {
                Alert.alert('Success', 'Invoice deleted');
                router.back();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete invoice');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  async function handleDownloadPDF() {
    if (!invoice) return;
    setIsProcessing(true);
    try {
      const token = getAuthToken();
      const pdfUrl = invoicesApi.getPdfUrl(id);
      const fileUri = FileSystem.cacheDirectory + `Invoice-${invoice.invoice_number}.pdf`;

      const download = await FileSystem.downloadAsync(pdfUrl, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (download.status !== 200) {
        throw new Error('Download failed');
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(download.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${invoice.invoice_number}`,
        });
      } else {
        Alert.alert('Success', 'PDF saved to ' + download.uri);
      }
    } catch (error) {
      console.error('Failed to download PDF:', error);
      Alert.alert('Error', 'Failed to download invoice PDF');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleEmailInvoice() {
    if (!invoice) return;

    const defaultEmail = invoice.client_email || '';

    Alert.prompt(
      'Email Invoice',
      'Enter recipient email address:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async (email?: string) => {
            const recipientEmail = email?.trim();
            if (!recipientEmail) {
              Alert.alert('Error', 'Please enter an email address');
              return;
            }

            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(recipientEmail)) {
              Alert.alert('Error', 'Please enter a valid email address');
              return;
            }

            setIsProcessing(true);
            try {
              const response = await invoicesApi.emailInvoice(id, recipientEmail);
              if (response.data.success) {
                if (response.data.data?.invoice) {
                  setInvoice(response.data.data.invoice);
                }
                const bcc = response.data.data?.bccEmail as string | null | undefined;
                const successMsg = bcc
                  ? `Invoice emailed to ${recipientEmail}\n\nA copy was BCC’d to ${bcc}`
                  : response.data.message || `Invoice emailed to ${recipientEmail}`;
                Alert.alert('Success', successMsg);
              }
            } catch (error: unknown) {
              const apiError = error as { code?: string; message?: string };
              if (apiError.code === 'EMAIL_NOT_CONFIGURED') {
                Alert.alert('Not Available', 'Email sending is not configured yet. Use Download PDF and share it manually.');
              } else {
                Alert.alert('Error', apiError.message || 'Failed to send email');
              }
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ],
      'plain-text',
      defaultEmail
    );
  }

  async function handleShareLink() {
    if (!invoice) return;

    setIsProcessing(true);
    try {
      const response = await invoicesApi.generateShareLink(id);
      if (response.data.success) {
        const { shareUrl } = response.data.data;
        const message = `Invoice ${invoice.invoice_number} from ${invoice.company_name || 'BossBoard'}\nTotal: ${formatCurrency(invoice.total)}\n\nView invoice: ${shareUrl}`;

        await Share.share({
          message,
          url: shareUrl,
        });
      }
    } catch (error) {
      console.error('Failed to generate share link:', error);
      Alert.alert('Error', 'Failed to generate share link');
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Invoice not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeGoBack(router, '/(tabs)/money')}
          testID="invoice-detail-not-found-back"
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.inContentBack}
        onPress={() => safeGoBack(router, '/(tabs)/money')}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        testID="invoice-detail-in-content-back"
      >
        <Ionicons name="chevron-back" size={20} color="#2563EB" />
        <Text style={styles.inContentBackText}>Back to invoices</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(invoice.status) + '20' },
            ]}
          >
            <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
              {getStatusLabel(invoice.status)}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerShareButton} onPress={handleShareLink}>
          <Ionicons name="share-outline" size={24} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Client Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Client</Text>
        <Text style={styles.clientName}>{invoice.client_name}</Text>
        {invoice.client_email && (
          <View style={styles.contactRow}>
            <Ionicons name="mail-outline" size={16} color="#6B7280" />
            <Text style={styles.contactText}>{invoice.client_email}</Text>
          </View>
        )}
        {invoice.client_phone && (
          <View style={styles.contactRow}>
            <Ionicons name="call-outline" size={16} color="#6B7280" />
            <Text style={styles.contactText}>{invoice.client_phone}</Text>
          </View>
        )}
      </View>

      {/* Job Description */}
      {invoice.job_description && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Job Description</Text>
          <Text style={styles.jobDescription}>{invoice.job_description}</Text>
        </View>
      )}

      {/* Line Items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Items</Text>
        {invoice.line_items.map((item) => (
          <View key={item.id} style={styles.lineItem}>
            <Text style={styles.lineItemDescription}>{item.description}</Text>
            <Text style={styles.lineItemAmount}>{formatCurrency(item.amount)}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
        </View>

        {(invoice.discount_amount ?? 0) > 0 && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: '#059669' }]}>
              {invoice.discount_label || 'Discount'}
              {invoice.discount_type === 'percent' && invoice.discount_value
                ? ` (${invoice.discount_value}%)`
                : ''}
            </Text>
            <Text style={[styles.totalValue, { color: '#059669' }]}>
              -{formatCurrency(invoice.discount_amount || 0)}
            </Text>
          </View>
        )}

        {invoice.gst_amount > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST (15%)</Text>
            <Text style={styles.totalValue}>{formatCurrency(invoice.gst_amount)}</Text>
          </View>
        )}

        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(invoice.total)}</Text>
        </View>
      </View>

      {/* Company Details (if populated) */}
      {invoice.company_name && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>From</Text>
          <Text style={styles.clientName}>{invoice.company_name}</Text>
          {invoice.company_address && (
            <Text style={styles.companyDetail}>{invoice.company_address}</Text>
          )}
          {invoice.ird_number && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>IRD Number</Text>
              <Text style={styles.paymentValue}>{invoice.ird_number}</Text>
            </View>
          )}
          {invoice.gst_number && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>GST Number</Text>
              <Text style={styles.paymentValue}>{invoice.gst_number}</Text>
            </View>
          )}
        </View>
      )}

      {/* Payment Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment</Text>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Due Date</Text>
          <Text style={styles.paymentValue}>{formatDate(invoice.due_date)}</Text>
        </View>
        {invoice.bank_account_name && (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>NZD Account Name</Text>
            <Text style={styles.paymentValue}>{invoice.bank_account_name}</Text>
          </View>
        )}
        {invoice.bank_account_number && (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>NZD Account Number</Text>
            <Text style={styles.paymentValue}>{invoice.bank_account_number}</Text>
          </View>
        )}
        {invoice.intl_iban && (
          <>
            <View style={styles.intlDivider}>
              <Text style={styles.intlDividerText}>International Payment</Text>
            </View>
            {invoice.intl_bank_account_name && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Account Name</Text>
                <Text style={styles.paymentValue}>{invoice.intl_bank_account_name}</Text>
              </View>
            )}
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>IBAN</Text>
              <Text style={styles.paymentValue}>{invoice.intl_iban}</Text>
            </View>
            {invoice.intl_swift_bic && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>SWIFT/BIC</Text>
                <Text style={styles.paymentValue}>{invoice.intl_swift_bic}</Text>
              </View>
            )}
            {invoice.intl_bank_name && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Bank Name</Text>
                <Text style={styles.paymentValue}>{invoice.intl_bank_name}</Text>
              </View>
            )}
          </>
        )}
        {invoice.paid_at && (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Paid On</Text>
            <Text style={[styles.paymentValue, { color: '#10B981' }]}>
              {formatDate(invoice.paid_at)}
            </Text>
          </View>
        )}
      </View>

      {(invoice.internal_memo || invoice.internalMemo) && (
        <View style={[styles.card, { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.cardTitle, { color: '#92400E' }]}>
            Internal memo (private)
          </Text>
          <Text style={styles.notes}>
            {invoice.internal_memo || invoice.internalMemo}
          </Text>
        </View>
      )}

      {/* Customer notes — same text appears on PDF & email */}
      {invoice.notes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer notes (PDF & email)</Text>
          <Text style={styles.notes}>{invoice.notes}</Text>
        </View>
      )}

      <PhotoAttachments entityType="invoice" entityId={id} editable={invoice.status === 'draft'} />

      {/* Actions */}
      <View style={styles.actionsContainer}>
        {invoice.status === 'draft' && (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleMarkAsSent}
              disabled={isProcessing}
            >
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Mark as Sent</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push(`/invoices/edit/${id}` as any)}
              disabled={isProcessing}
            >
              <Ionicons name="create-outline" size={20} color="#2563EB" />
              <Text style={styles.secondaryButtonText}>Edit Invoice</Text>
            </TouchableOpacity>
          </>
        )}

        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: '#10B981' }]}
            onPress={handleMarkAsPaid}
            disabled={isProcessing}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Mark as Paid</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.pdfButton}
          onPress={handleDownloadPDF}
          disabled={isProcessing}
        >
          <Ionicons name="document-outline" size={20} color="#374151" />
          <Text style={styles.pdfButtonText}>Download PDF</Text>
        </TouchableOpacity>

        {invoice.status !== 'paid' && (
          <TouchableOpacity
            style={styles.emailButton}
            onPress={handleEmailInvoice}
            disabled={isProcessing}
          >
            <Ionicons name="mail-outline" size={20} color="#2563EB" />
            <Text style={styles.emailButtonText}>Email Invoice</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareLink}
          disabled={isProcessing}
        >
          <Ionicons name="link-outline" size={20} color="#7C3AED" />
          <Text style={styles.shareButtonText}>Share Link</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={isProcessing}
        >
          <Text style={styles.deleteButtonText}>Delete Invoice</Text>
        </TouchableOpacity>
      </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#374151',
    marginTop: 12,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  invoiceNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerShareButton: {
    padding: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  contactText: {
    fontSize: 15,
    color: '#374151',
  },
  jobDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  lineItemDescription: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  lineItemAmount: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  divider: {
    height: 2,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 15,
    color: '#374151',
  },
  grandTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  paymentLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  companyDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  intlDivider: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    paddingTop: 8,
    marginBottom: 4,
  },
  intlDividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notes: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  actionsContainer: {
    marginTop: 12,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563EB',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  pdfButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 8,
  },
  pdfButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  emailButton: {
    backgroundColor: '#EFF6FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  emailButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: '#F5F3FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 8,
  },
  shareButtonText: {
    color: '#7C3AED',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    alignItems: 'center',
    padding: 12,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '500',
  },
});
