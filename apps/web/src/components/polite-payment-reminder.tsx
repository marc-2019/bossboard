'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  buildPoliteReminderMailto,
  formatPoliteReminderClipboard,
  isUnpaidInvoiceStatus,
  politeReminderFromInvoice,
  type PoliteReminderInvoiceLike,
} from '@bossboard/shared';
import { Copy, Mail, X } from 'lucide-react';

type ReminderInvoice = PoliteReminderInvoiceLike & {
  clientEmail?: string | null;
  client_email?: string | null;
};

/**
 * Preview-only polite reminder for an unpaid invoice.
 * Nothing is emailed from this component. Copy, mailto, and the existing
 * invoice-email form all wait for a separate explicit click.
 */
export function PolitePaymentReminder({
  invoice,
  onUseInEmail,
}: {
  invoice: ReminderInvoice;
  onUseInEmail?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (!isUnpaidInvoiceStatus(invoice.status)) return null;

  const openPreview = () => {
    const draft = politeReminderFromInvoice(invoice);
    setSubject(draft.subject);
    setBody(draft.body);
    setNotice(null);
    setOpen(true);
  };

  const onCopy = async () => {
    const text = formatPoliteReminderClipboard(subject, body);
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Reminder copied. Nothing was sent.');
    } catch {
      setNotice('Clipboard was blocked. Select the message and copy it yourself. Nothing was sent.');
    }
  };

  const onMailto = () => {
    const confirmed = window.confirm(
      'This opens your email app with the reminder filled in. BossBoard does not send it — you send it from your mail app.',
    );
    if (!confirmed) return;
    const href = buildPoliteReminderMailto({
      to: invoice.clientEmail || invoice.client_email || null,
      subject,
      body,
    });
    window.location.assign(href);
    setNotice('Email draft opened in your mail app. BossBoard did not send it.');
  };

  const onFillEmailForm = () => {
    if (!onUseInEmail) return;
    const confirmed = window.confirm(
      'This only fills the invoice email form. Nothing is sent until you click Send email.',
    );
    if (!confirmed) return;
    const text = formatPoliteReminderClipboard(subject, body);
    const message = text.replace(/^Subject:[^\n]*\n\n/, '');
    onUseInEmail(message);
    setOpen(false);
  };

  return (
    <div id="polite-reminder" className="mt-3 space-y-3">
      <Button
        type="button"
        onClick={openPreview}
        variant="secondary"
        size="md"
        data-testid="polite-reminder-open"
      >
        <Mail size={14} className="mr-2" />
        Send polite reminder
      </Button>

      {open && (
        <div
          className="p-4 rounded-lg border border-border-light bg-gray-50 space-y-3"
          data-testid="polite-reminder-preview"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Polite payment reminder</h2>
              <p className="text-xs text-gray-600 mt-1">
                Preview only. BossBoard will not email your customer from this panel.
                Copy the note, open a mail draft, or fill the invoice email form — then
                you confirm before anything leaves your hands.
              </p>
            </div>
            <button
              type="button"
              className="text-gray-500 hover:text-gray-800"
              onClick={() => setOpen(false)}
              aria-label="Close reminder preview"
            >
              <X size={16} />
            </button>
          </div>

          <div>
            <label htmlFor="polite-reminder-subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              id="polite-reminder-subject"
              data-testid="polite-reminder-subject"
              value={subject}
              maxLength={180}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="polite-reminder-body" className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              id="polite-reminder-body"
              data-testid="polite-reminder-body"
              value={body}
              rows={12}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={() => void onCopy()} data-testid="polite-reminder-copy">
              <Copy size={14} className="mr-2" />
              Copy polite reminder
            </Button>
            <Button type="button" variant="secondary" onClick={onMailto} data-testid="polite-reminder-mailto">
              <Mail size={14} className="mr-2" />
              Open email draft
            </Button>
            {onUseInEmail && (
              <Button type="button" variant="ghost" onClick={onFillEmailForm} data-testid="polite-reminder-use-email">
                Use in invoice email
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            The invoice email keeps its usual subject and still needs Send email.
            Opening a draft does not send.
          </p>
          {notice && (
            <p className="text-sm text-gray-800" role="status">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
