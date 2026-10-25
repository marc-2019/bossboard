import {
  buildPolitePaymentReminder,
  buildPoliteReminderMailto,
  formatPoliteReminderClipboard,
  isUnpaidInvoiceStatus,
  politeReminderFromInvoice,
} from '@bossboard/shared';

const AS_OF = '2026-10-25';

describe('buildPolitePaymentReminder', () => {
  it('fills customer, amount, invoice, due date, business, and how to pay', () => {
    const { subject, body } = buildPolitePaymentReminder({
      customerName: 'Sarah Ngata',
      amountCents: 15000,
      invoiceNumber: 'INV-0042',
      dueDate: '2026-11-02',
      businessName: 'Acme Plumbing',
      bankAccountName: 'Acme Plumbing Ltd',
      bankAccountNumber: '12-3456-7890123-00',
      paymentLinkUrl: 'https://pay.example.com/inv-0042',
      paymentReference: 'INV-0042',
      asOf: AS_OF,
    });

    expect(subject).toBe('Friendly reminder: invoice INV-0042');
    expect(body).toContain('Hi Sarah Ngata,');
    expect(body).toContain('Invoice INV-0042 for NZ$150.00 is still outstanding (due 2 Nov 2026).');
    expect(body).toContain('Account name: Acme Plumbing Ltd');
    expect(body).toContain('Account number: 12-3456-7890123-00');
    expect(body).toContain('Pay online: https://pay.example.com/inv-0042');
    expect(body).toContain('Payment reference: INV-0042');
    expect(body).toContain('Thanks,\nAcme Plumbing');
    expect(body).not.toMatch(/internal memo/i);
  });

  it('uses overdue wording when status is overdue or the due date has passed', () => {
    const overdue = buildPolitePaymentReminder({
      customerName: 'Sam',
      amountCents: 2500,
      invoiceNumber: 'INV-9',
      dueDate: '2026-11-02',
      overdue: true,
      asOf: AS_OF,
    });
    expect(overdue.body).toContain('Invoice INV-9 for NZ$25.00 was due on 2 Nov 2026 and is still unpaid.');

    const pastDue = buildPolitePaymentReminder({
      customerName: 'Sam',
      amountCents: 2500,
      invoiceNumber: 'INV-9',
      dueDate: '2026-03-21',
      asOf: AS_OF,
    });
    expect(pastDue.body).toContain('was due on 21 Mar 2026 and is still unpaid.');
  });

  it('falls back politely when fields are missing', () => {
    const { subject, body } = buildPolitePaymentReminder({ asOf: AS_OF });

    expect(subject).toBe('Friendly reminder about your invoice');
    expect(body).toContain('Hi there,');
    expect(body).toContain('Your invoice is still outstanding.');
    expect(body).toContain('If you need our payment details, reply to this note');
    expect(body.endsWith('Thanks,\nus')).toBe(true);
    expect(body).not.toContain('NZ$');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('null');
  });

  it('omits a zero-width or blank customer name and a negative amount', () => {
    const { body } = buildPolitePaymentReminder({
      customerName: '   ',
      amountCents: -100,
      invoiceNumber: 'INV-1',
      asOf: AS_OF,
    });
    expect(body.startsWith('Hi there,')).toBe(true);
    expect(body).not.toContain('NZ$');
  });

  it('includes international pay details when that is what the invoice has', () => {
    const { body } = buildPolitePaymentReminder({
      customerName: 'Pat',
      invoiceNumber: 'INV-7',
      intlIban: 'GB82WEST12345698765432',
      intlSwiftBic: 'WESTGB2L',
      intlBankName: 'Example Bank',
      asOf: '2026-01-01',
      dueDate: '2026-02-01',
    });
    expect(body).toContain('IBAN: GB82WEST12345698765432');
    expect(body).toContain('SWIFT/BIC: WESTGB2L');
    expect(body).toContain('Bank: Example Bank');
  });

  it('drops encrypted bank blobs instead of pasting ciphertext', () => {
    const { body } = buildPolitePaymentReminder({
      customerName: 'Pat',
      invoiceNumber: 'INV-3',
      bankAccountName: 'enc:v1:abcdef',
      bankAccountNumber: 'enc:v1:supersecretciphertext',
      asOf: AS_OF,
    });
    expect(body).not.toContain('enc:v1:');
    expect(body).not.toContain('supersecretciphertext');
    expect(body).toContain('If you need our payment details');
  });

  it('strips HTML and email-header injection from every interpolated field', () => {
    const evilName = 'Alice\r\nBcc: attacker@evil.example\nCc: other@evil.example';
    const evilInvoice = 'INV-1<script>alert(1)</script>';
    const evilBusiness = 'Acme</h1><img src=x onerror=alert(1)>';
    const { subject, body } = buildPolitePaymentReminder({
      customerName: evilName,
      amountCents: 100,
      invoiceNumber: evilInvoice,
      dueDate: '2026-11-02\r\nBcc: hidden@evil.example',
      businessName: evilBusiness,
      bankAccountName: 'Name\r\nBcc: bank@evil.example',
      bankAccountNumber: '12<script>',
      paymentReference: 'REF\nBcc: ref@evil.example',
      paymentLinkUrl: 'javascript:alert(1)',
      asOf: AS_OF,
    });

    const combined = `${subject}\n${body}`;
    expect(combined).not.toMatch(/[<>]/);
    expect(combined).not.toMatch(/\r/);
    expect(combined).not.toContain('<script>');
    expect(combined).not.toContain('javascript:');
    expect(body.split('\n').some((line) => /^(bcc|cc|to|from|subject):/i.test(line.trim()))).toBe(
      false,
    );
    expect(subject.split('\n')).toHaveLength(1);
    expect(body).toContain('Hi Alice Bcc: attacker@evil.example Cc: other@evil.example,');
    expect(body).not.toContain('hidden@evil.example');
    expect(body).not.toContain('javascript:');
    expect(body).not.toContain('Pay online:');
  });

  it('rejects payment URLs that are not http(s) or that carry userinfo', () => {
    const javascriptUrl = buildPolitePaymentReminder({
      customerName: 'Pat',
      paymentLinkUrl: 'javascript:alert(document.domain)',
      asOf: AS_OF,
    });
    expect(javascriptUrl.body).not.toContain('javascript:');

    const userinfo = buildPolitePaymentReminder({
      customerName: 'Pat',
      paymentLinkUrl: 'https://user:secret@pay.example/path',
      asOf: AS_OF,
    });
    expect(userinfo.body).not.toContain('secret');
    expect(userinfo.body).not.toContain('pay.example');

    const broken = buildPolitePaymentReminder({
      customerName: 'Pat',
      paymentLinkUrl: 'https://pay.example.com/inv\r\nBcc: x@evil.example',
      asOf: AS_OF,
    });
    expect(broken.body).not.toContain('Bcc:');
    expect(broken.body).not.toContain('pay.example.com');

    const encodedBreak = buildPolitePaymentReminder({
      customerName: 'Pat',
      paymentLinkUrl: 'https://pay.example.com/inv%0ABcc:x@evil.example',
      asOf: AS_OF,
    });
    expect(encodedBreak.body).not.toContain('pay.example.com');
    expect(encodedBreak.body).not.toContain('%0A');
  });

  it('ignores staff-only fields that are not part of the reminder input', () => {
    const input = Object.assign(
      {
        customerName: 'Sam',
        invoiceNumber: 'INV-2',
        asOf: AS_OF,
      },
      {
        internalMemo: 'SECRET-MEMO-9f3a',
        notes: 'NOTE-LEAK-should-not-appear',
        clientEmail: 'sam@example.com',
      },
    );
    const rendered = JSON.stringify(buildPolitePaymentReminder(input));
    expect(rendered).not.toContain('SECRET-MEMO-9f3a');
    expect(rendered).not.toContain('NOTE-LEAK');
    expect(rendered).not.toContain('sam@example.com');
  });
});

describe('politeReminderFromInvoice', () => {
  it('reads the web camelCase invoice', () => {
    const { body } = politeReminderFromInvoice(
      {
        clientName: 'Aroha',
        total: 1999,
        invoiceNumber: 'INV-10',
        dueDate: '2026-12-01',
        companyName: 'North Build',
        bankAccountNumber: '01-1234-5678901-00',
        status: 'sent',
        paymentLinkUrl: 'https://pay.example.com/10',
      },
      { asOf: AS_OF },
    );
    expect(body).toContain('Hi Aroha,');
    expect(body).toContain('NZ$19.99');
    expect(body).toContain('still outstanding (due 1 Dec 2026)');
    expect(body).toContain('Account number: 01-1234-5678901-00');
    expect(body).toContain('https://pay.example.com/10');
    expect(body).toContain('North Build');
  });

  it('reads the mobile snake_case invoice and treats overdue status as overdue', () => {
    const { body } = politeReminderFromInvoice(
      {
        client_name: 'Aroha',
        total: 500,
        invoice_number: 'INV-11',
        due_date: '2026-12-01',
        company_name: 'North Build',
        status: 'overdue',
      },
      { asOf: AS_OF },
    );
    expect(body).toContain('Invoice INV-11 for NZ$5.00 was due on 1 Dec 2026 and is still unpaid.');
  });
});

describe('formatPoliteReminderClipboard and mailto', () => {
  it('keeps an edited subject on one line and strips tags from the body', () => {
    const text = formatPoliteReminderClipboard(
      'Hello\r\nBcc: attacker@evil.example',
      'Please pay <b>today</b>\r\nThanks',
    );
    expect(text.startsWith('Subject: Hello Bcc: attacker@evil.example\n\n')).toBe(true);
    expect(text).not.toMatch(/[<>]/);
    expect(text).not.toMatch(/\r/);
    expect(text.split('\n').filter((line) => /^bcc:/i.test(line))).toHaveLength(0);
  });

  it('builds a mailto draft and drops a poisoned recipient', () => {
    const safe = buildPoliteReminderMailto({
      to: 'client@example.com',
      subject: 'Friendly reminder: invoice INV-1',
      body: 'Hi there,\nPlease pay.',
    });
    expect(safe.startsWith('mailto:client@example.com?')).toBe(true);
    expect(safe).toContain('subject=Friendly%20reminder%3A%20invoice%20INV-1');
    expect(safe).not.toMatch(/%0D/i);
    expect(decodeURIComponent(safe)).toContain('Hi there,\nPlease pay.');

    const poisoned = buildPoliteReminderMailto({
      to: 'client@example.com\r\nBcc: attacker@evil.example',
      subject: 'Hi\r\nBcc: attacker@evil.example',
      body: '<script>alert(1)</script>',
    });
    expect(poisoned.startsWith('mailto:?subject=')).toBe(true);
    expect(poisoned).not.toContain('attacker@evil.example');
    expect(poisoned).not.toContain('<');
    expect(decodeURIComponent(poisoned)).not.toMatch(/\r/);
    expect(decodeURIComponent(poisoned).split('\n').some((line) => /^bcc:/i.test(line))).toBe(false);
  });
});

describe('isUnpaidInvoiceStatus', () => {
  it('is true only for sent and overdue invoices', () => {
    expect(isUnpaidInvoiceStatus('sent')).toBe(true);
    expect(isUnpaidInvoiceStatus('overdue')).toBe(true);
    expect(isUnpaidInvoiceStatus(' OVERDUE ')).toBe(true);
    expect(isUnpaidInvoiceStatus('draft')).toBe(false);
    expect(isUnpaidInvoiceStatus('paid')).toBe(false);
    expect(isUnpaidInvoiceStatus(null)).toBe(false);
    expect(isUnpaidInvoiceStatus(undefined)).toBe(false);
  });
});
