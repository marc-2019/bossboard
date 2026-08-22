/**
 * Email Service Unit Tests
 *
 * Covers:
 *   - isEmailConfigured: returns true/false based on resendApiKey
 *   - send: throws when Resend returns error, returns messageId on success, fallback messageId when data.id missing
 *   - getResend: throws when RESEND_API_KEY not configured
 *   - sendVerificationEmail: correct subject, HTML contains code, attachment-free
 *   - sendPasswordResetEmail: correct subject includes code, HTML contains code
 *   - sendInvoiceEmail: correct subject, PDF attached with right filename, amounts formatted
 *   - sendTradeConfirmation: correct subject, optional fields omitted when absent
 *   - sendPortfolioAlert: urgent vs non-urgent subject, expired vs days-left label
 *   - sendPaymentFailedEmail: with/without userName greeting
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports so Jest hoisting works correctly
// ---------------------------------------------------------------------------

const mockEmailsSend = jest.fn();

jest.mock('resend', () => {
  const MockResend = jest.fn().mockImplementation(() => ({
    emails: {
      send: (...args: unknown[]) => mockEmailsSend(...args),
    },
  }));
  return { __esModule: true, Resend: MockResend };
});

const mockConfig = {
  resendApiKey: 'test-resend-key',
  appName: 'BossBoard',
  smtp: {
    fromName: '',
    fromEmail: '',
  },
};

jest.mock('../../config/index.js', () => ({
  __esModule: true,
  config: mockConfig,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  isEmailConfigured,
  isSmtpConfigured,
  isResendConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvoiceEmail,
  resolveInvoiceBcc,
  sendTradeConfirmation,
  sendPortfolioAlert,
  sendPaymentFailedEmail,
} from '../../services/email.js';
import type { Invoice } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid Invoice for testing */
function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    userId: 'user-1',
    invoiceNumber: 'INV-001',
    clientName: 'Acme Corp',
    clientEmail: 'client@acme.com',
    clientPhone: null,
    swmsId: null,
    jobDescription: 'Plumbing repairs',
    lineItems: [
      { id: 'li-1', description: 'Labour', amount: 20000 },
    ],
    subtotal: 20000,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    discountLabel: null,
    gstAmount: 3000,
    total: 23000,
    status: 'draft' as any,
    dueDate: '2026-05-01',
    paidAt: null,
    bankAccountName: 'Test Trading Ltd',
    bankAccountNumber: '12-3456-7890123-00',
    notes: null,
    internalMemo: null,
    customerId: null,
    recurringInvoiceId: null,
    includeGst: true,
    intlBankAccountName: null,
    intlIban: null,
    intlSwiftBic: null,
    intlBankName: null,
    intlBankAddress: null,
    companyName: 'Test Trading Ltd',
    companyAddress: null,
    irdNumber: null,
    gstNumber: null,
    shareToken: null,
    paymentProvider: null,
    paymentReference: null,
    paymentLinkUrl: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Reset module-level resendClient singleton between tests
  mockConfig.resendApiKey = 'test-resend-key';
  mockEmailsSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });
});

// Reset the module between describe blocks that change resendApiKey to empty,
// because the singleton `resendClient` is module-level state.
// We use jest.isolateModules where needed.

describe('isEmailConfigured / aliases', () => {
  it('returns true when resendApiKey is set', () => {
    mockConfig.resendApiKey = 'some-key';
    expect(isEmailConfigured()).toBe(true);
  });

  it('returns false when resendApiKey is empty string', () => {
    mockConfig.resendApiKey = '';
    expect(isEmailConfigured()).toBe(false);
  });

  it('isSmtpConfigured is an alias for isEmailConfigured', () => {
    mockConfig.resendApiKey = 'key';
    expect(isSmtpConfigured()).toBe(isEmailConfigured());
  });

  it('isResendConfigured is an alias for isEmailConfigured', () => {
    mockConfig.resendApiKey = 'key';
    expect(isResendConfigured()).toBe(isEmailConfigured());
  });
});

describe('sendVerificationEmail', () => {
  it('sends email with verification code in subject and body', async () => {
    const result = await sendVerificationEmail('user@example.com', '123456');

    expect(result).toEqual({ messageId: 'msg-123' });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toContain('user@example.com');
    expect(call.subject).toContain('Verify Your Email');
    expect(call.html).toContain('123456');
    expect(call.text).toContain('123456');
    expect(call.attachments).toBeUndefined();
  });

  it('uses appName in subject', async () => {
    await sendVerificationEmail('user@example.com', '999');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain('BossBoard');
  });

  it('mentions 30-minute expiry', async () => {
    await sendVerificationEmail('user@example.com', '000000');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('30 minutes');
  });
});

describe('sendPasswordResetEmail', () => {
  it('sends email with reset code in subject and body', async () => {
    const result = await sendPasswordResetEmail('user@example.com', '654321');

    expect(result).toEqual({ messageId: 'msg-123' });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toContain('user@example.com');
    expect(call.subject).toContain('Password Reset');
    expect(call.subject).toContain('654321');
    expect(call.html).toContain('654321');
    expect(call.text).toContain('654321');
  });

  it('mentions 30-minute expiry', async () => {
    await sendPasswordResetEmail('user@example.com', '111111');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('30 minutes');
  });
});

describe('sendInvoiceEmail', () => {
  it('sends email with PDF attachment named after invoice number', async () => {
    const invoice = makeInvoice();
    const pdf = Buffer.from('fake-pdf');

    const result = await sendInvoiceEmail(invoice, pdf, 'client@acme.com', 'Bob Builder');

    expect(result).toEqual({ messageId: 'msg-123' });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toContain('client@acme.com');
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].filename).toBe('Invoice-INV-001.pdf');
    expect(call.attachments[0].content).toBe(pdf);
  });

  it('puts the optional client message in the body, not the subject', async () => {
    const invoice = makeInvoice();
    await sendInvoiceEmail(invoice, Buffer.from(''), 'client@acme.com', 'Bob', 'Thanks for your business');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toBe('Invoice INV-001 from Bob');
    expect(call.subject).not.toContain('Thanks for your business');
    expect(call.html).toContain('Thanks for your business');
    expect(call.text).toContain('Thanks for your business');
  });

  it('does not put newlines in the subject when the client message is multiline', async () => {
    // Production: Resend 500 "The `\n` is not allowed in the `subject` field."
    // INV-0002 2026-08-22 — UI "Message" is a textarea; it used to be concatenated into subject.
    const invoice = makeInvoice({ invoiceNumber: 'INV-0002' });
    const message = 'Hi Client,\n\nPlease find this invoice attached.\n\nCheers,\nSender';
    await sendInvoiceEmail(invoice, Buffer.from(''), 'client@example.com', 'Marc', message);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).not.toMatch(/[\r\n]/);
    expect(call.subject).toBe('Invoice INV-0002 from Marc');
    expect(call.html).toContain('Hi Client,');
    expect(call.html).toContain('Cheers,');
    expect(call.text).toContain('Hi Client,');
    expect(call.text).toContain('Please find this invoice attached.');
  });

  it('uses invoice number and sender name in subject when no custom message', async () => {
    const invoice = makeInvoice();
    await sendInvoiceEmail(invoice, Buffer.from(''), 'client@acme.com', 'Bob Builder');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain('INV-001');
    expect(call.subject).toContain('Bob Builder');
  });

  it('includes formatted dollar amounts in HTML', async () => {
    const invoice = makeInvoice({ subtotal: 20000, gstAmount: 3000, total: 23000 });
    await sendInvoiceEmail(invoice, Buffer.from(''), 'c@c.com', 'Sender');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('$200.00');  // subtotal
    expect(call.html).toContain('$230.00');  // total
  });

  it('includes GST line when includeGst is true', async () => {
    const invoice = makeInvoice({ includeGst: true, gstAmount: 3000 });
    await sendInvoiceEmail(invoice, Buffer.from(''), 'c@c.com', 'Sender');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('GST (15%)');
    expect(call.text).toContain('GST (15%)');
  });

  it('omits GST line when includeGst is false', async () => {
    const invoice = makeInvoice({ includeGst: false });
    await sendInvoiceEmail(invoice, Buffer.from(''), 'c@c.com', 'Sender');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).not.toContain('GST (15%)');
  });

  it('includes bank details when present', async () => {
    const invoice = makeInvoice({ bankAccountName: 'My Business', bankAccountNumber: '00-0000-0000000-00' });
    await sendInvoiceEmail(invoice, Buffer.from(''), 'c@c.com', 'Sender');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('My Business');
    expect(call.html).toContain('00-0000-0000000-00');
    expect(call.text).toContain('My Business');
  });

  it('omits payment details section when no bank info', async () => {
    const invoice = makeInvoice({ bankAccountName: null, bankAccountNumber: null });
    await sendInvoiceEmail(invoice, Buffer.from(''), 'c@c.com', 'Sender');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).not.toContain('Payment Details');
  });

  it('includes notes when present', async () => {
    const invoice = makeInvoice({ notes: 'Please pay within 7 days' });
    await sendInvoiceEmail(invoice, Buffer.from(''), 'c@c.com', 'Sender');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Please pay within 7 days');
    expect(call.text).toContain('Please pay within 7 days');
  });

  it('includes bcc when provided and different from recipient', async () => {
    const invoice = makeInvoice();
    await sendInvoiceEmail(invoice, Buffer.from(''), 'client@acme.com', 'Bob', undefined, {
      bcc: 'accounts@business.co.nz',
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.bcc).toEqual(['accounts@business.co.nz']);
  });

  it('omits bcc when same as recipient', async () => {
    const invoice = makeInvoice();
    await sendInvoiceEmail(invoice, Buffer.from(''), 'client@acme.com', 'Bob', undefined, {
      bcc: 'client@acme.com',
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.bcc).toBeUndefined();
  });
});

describe('resolveInvoiceBcc', () => {
  it('prefers dedicated invoice BCC over company and user email', () => {
    expect(
      resolveInvoiceBcc({
        invoiceBccEmail: 'accounts@co.nz',
        companyEmail: 'office@co.nz',
        userEmail: 'me@co.nz',
        recipientEmail: 'client@example.com',
      })
    ).toBe('accounts@co.nz');
  });

  it('falls back to company email when dedicated BCC unset', () => {
    expect(
      resolveInvoiceBcc({
        invoiceBccEmail: null,
        companyEmail: 'office@co.nz',
        userEmail: 'me@co.nz',
        recipientEmail: 'client@example.com',
      })
    ).toBe('office@co.nz');
  });

  it('falls back to user email when company email unset', () => {
    expect(
      resolveInvoiceBcc({
        invoiceBccEmail: '',
        companyEmail: null,
        userEmail: 'me@co.nz',
        recipientEmail: 'client@example.com',
      })
    ).toBe('me@co.nz');
  });

  it('skips addresses that match the recipient', () => {
    expect(
      resolveInvoiceBcc({
        invoiceBccEmail: 'client@example.com',
        companyEmail: 'client@example.com',
        userEmail: 'me@co.nz',
        recipientEmail: 'client@example.com',
      })
    ).toBe('me@co.nz');
  });

  it('returns null when no distinct address is available', () => {
    expect(
      resolveInvoiceBcc({
        invoiceBccEmail: null,
        companyEmail: null,
        userEmail: 'client@example.com',
        recipientEmail: 'client@example.com',
      })
    ).toBeNull();
  });
});

describe('sendTradeConfirmation', () => {
  it('sends confirmation with job description in subject', async () => {
    const result = await sendTradeConfirmation('client@example.com', {
      clientName: 'Jane',
      jobDescription: 'Hot water cylinder replacement',
      senderName: 'Bob Builder',
    });

    expect(result).toEqual({ messageId: 'msg-123' });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain('Hot water cylinder replacement');
    expect(call.html).toContain('Jane');
  });

  it('includes scheduled date when provided', async () => {
    await sendTradeConfirmation('client@example.com', {
      clientName: 'Jane',
      jobDescription: 'Drain unblock',
      scheduledDate: '2026-05-15T09:00:00Z',
      senderName: 'Bob',
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Scheduled');
    expect(call.text).toContain('Scheduled');
  });

  it('omits scheduled date when not provided', async () => {
    await sendTradeConfirmation('client@example.com', {
      clientName: 'Jane',
      jobDescription: 'Drain unblock',
      senderName: 'Bob',
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).not.toContain('Scheduled');
  });

  it('includes trade type when provided', async () => {
    await sendTradeConfirmation('client@example.com', {
      clientName: 'Jane',
      jobDescription: 'Fix tap',
      tradeType: 'Plumber',
      senderName: 'Bob',
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Plumber');
    expect(call.text).toContain('Plumber');
  });
});

describe('sendPortfolioAlert', () => {
  it('uses urgent subject when any cert expires within 7 days', async () => {
    await sendPortfolioAlert('user@example.com', {
      userName: 'Alice',
      alerts: [
        { name: 'First Aid', expiryDate: '2026-04-16', daysLeft: 1 },
        { name: 'Working at Heights', expiryDate: '2026-05-01', daysLeft: 16 },
      ],
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain('1 certification(s) expiring soon');
  });

  it('uses general reminder subject when no cert is urgent', async () => {
    await sendPortfolioAlert('user@example.com', {
      userName: 'Alice',
      alerts: [
        { name: 'Working at Heights', expiryDate: '2026-05-20', daysLeft: 35 },
      ],
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain('Certification expiry reminder');
  });

  it('shows EXPIRED label for daysLeft <= 0', async () => {
    await sendPortfolioAlert('user@example.com', {
      userName: 'Alice',
      alerts: [{ name: 'First Aid', expiryDate: '2026-04-01', daysLeft: 0 }],
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('EXPIRED');
    expect(call.text).toContain('EXPIRED');
  });

  it('shows days remaining for active certs', async () => {
    await sendPortfolioAlert('user@example.com', {
      userName: 'Alice',
      alerts: [{ name: 'Forklift', expiryDate: '2026-05-30', daysLeft: 45 }],
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('45 day(s) left');
  });

  it('uses singular "day" label for exactly 1 day left', async () => {
    await sendPortfolioAlert('user@example.com', {
      userName: 'Alice',
      alerts: [{ name: 'First Aid', expiryDate: '2026-04-16', daysLeft: 1 }],
    });
    const call = mockEmailsSend.mock.calls[0][0];
    // HTML label: "1 day left" (not "1 days left")
    expect(call.html).toContain('1 day left');
  });
});

describe('sendPaymentFailedEmail', () => {
  it('sends payment failed email without userName', async () => {
    const result = await sendPaymentFailedEmail('user@example.com');

    expect(result).toEqual({ messageId: 'msg-123' });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toContain('user@example.com');
    expect(call.subject).toContain('payment failed');
    expect(call.html).toContain('Hi there,');
  });

  it('personalises greeting when userName provided', async () => {
    await sendPaymentFailedEmail('user@example.com', { userName: 'Bob' });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Hi Bob,');
  });

  it('mentions subscription and payment update', async () => {
    await sendPaymentFailedEmail('user@example.com');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('payment');
    expect(call.text).toContain('payment method');
  });
});

describe('Resend error handling', () => {
  it('throws when Resend returns an error', async () => {
    mockEmailsSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });

    await expect(sendVerificationEmail('user@example.com', '000000')).rejects.toThrow(
      'Resend error: Invalid API key'
    );
  });

  it('returns fallback messageId when data.id is missing', async () => {
    mockEmailsSend.mockResolvedValue({ data: null, error: null });

    const result = await sendVerificationEmail('user@example.com', '111111');
    // Fallback format: "resend-<timestamp>"
    expect(result.messageId).toMatch(/^resend-\d+$/);
  });
});

describe('from address construction', () => {
  it('uses smtp.fromName when set', async () => {
    mockConfig.smtp.fromName = 'My App';
    await sendVerificationEmail('u@e.com', '123');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toContain('My App');
    mockConfig.smtp.fromName = '';
  });

  it('falls back to appName when smtp.fromName is empty', async () => {
    mockConfig.smtp.fromName = '';
    await sendVerificationEmail('u@e.com', '123');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toContain('BossBoard');
  });

  it('uses smtp.fromEmail when set', async () => {
    mockConfig.smtp.fromEmail = 'custom@myapp.com';
    await sendVerificationEmail('u@e.com', '123');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toContain('custom@myapp.com');
    mockConfig.smtp.fromEmail = '';
  });

  it('falls back to noreply@instilligent.com when smtp.fromEmail is empty', async () => {
    mockConfig.smtp.fromEmail = '';
    await sendVerificationEmail('u@e.com', '123');
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toContain('noreply@instilligent.com');
  });
});
