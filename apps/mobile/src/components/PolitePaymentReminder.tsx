/**
 * Preview-only polite payment reminder for an unpaid invoice.
 * Does not call the invoice email API. Copy goes through the share sheet
 * and email opens a mailto draft only after the tradie confirms.
 */

import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  buildPoliteReminderMailto,
  formatPoliteReminderClipboard,
  isUnpaidInvoiceStatus,
  politeReminderFromInvoice,
  reminderLocalCalendarKey,
  type PoliteReminderInvoiceLike,
} from '@bossboard/shared';

type ReminderInvoice = PoliteReminderInvoiceLike & {
  clientEmail?: string | null;
  client_email?: string | null;
};

export default function PolitePaymentReminder({ invoice }: { invoice: ReminderInvoice }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (!isUnpaidInvoiceStatus(invoice.status)) return null;

  const openPreview = () => {
    const draft = politeReminderFromInvoice(invoice, { asOf: reminderLocalCalendarKey() });
    setSubject(draft.subject);
    setBody(draft.body);
    setNotice(null);
    setOpen(true);
  };

  const onCopy = async () => {
    const text = formatPoliteReminderClipboard(subject, body);
    try {
      const result = await Share.share({ title: 'Polite payment reminder', message: text });
      if (result.action === Share.dismissedAction) {
        setNotice('Closed without sharing. Nothing was sent.');
        return;
      }
      setNotice('Share sheet opened. Nothing was sent by BossBoard.');
    } catch {
      Alert.alert(
        'Could not open the share sheet',
        'Select the message and copy it. Nothing was sent.',
      );
    }
  };

  const onMailto = () => {
    const href = buildPoliteReminderMailto({
      to: invoice.clientEmail || invoice.client_email || null,
      subject,
      body,
    });
    Alert.alert(
      'Open email draft?',
      'This opens your email app with the reminder filled in. BossBoard does not send it — you send it from your mail app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open draft',
          onPress: () => {
            void Linking.openURL(href).then(
              () => setNotice('Email draft opened. BossBoard did not send it.'),
              () => Alert.alert('Could not open email', 'Copy the reminder and paste it into your mail app.'),
            );
          },
        },
      ],
    );
  };

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={openPreview}
        accessibilityRole="button"
        accessibilityLabel="Send polite reminder"
      >
        <Ionicons name="mail-outline" size={20} color="#1D4ED8" />
        <Text style={styles.buttonText}>Send polite reminder</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        accessibilityViewIsModal
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Polite payment reminder</Text>
            <Text style={styles.help}>
              Preview only. Nothing is emailed until you copy it or open a draft and send it
              yourself.
            </Text>

            <Text style={styles.label}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={180}
              style={styles.input}
              accessibilityLabel="Reminder subject"
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={4000}
              textAlignVertical="top"
              style={[styles.input, styles.body]}
              accessibilityLabel="Reminder message"
            />

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <TouchableOpacity
              style={styles.primary}
              onPress={() => void onCopy()}
              accessibilityRole="button"
              accessibilityLabel="Copy polite reminder"
            >
              <Text style={styles.primaryText}>Copy polite reminder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondary}
              onPress={onMailto}
              accessibilityRole="button"
              accessibilityLabel="Open email draft"
            >
              <Text style={styles.secondaryText}>Open email draft</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.close}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close polite reminder"
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
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
  buttonText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '90%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  help: {
    marginTop: 6,
    marginBottom: 12,
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  body: {
    minHeight: 220,
  },
  notice: {
    color: '#065F46',
    fontSize: 13,
    marginBottom: 10,
  },
  primary: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondary: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563EB',
    marginBottom: 8,
  },
  secondaryText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 16,
  },
  close: {
    alignItems: 'center',
    padding: 10,
  },
  closeText: {
    color: '#6B7280',
    fontSize: 15,
  },
});
