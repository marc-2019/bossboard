import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildPolitePaymentReminder,
  buildPoliteReminderMailto,
  formatPoliteReminderClipboard,
  isUnpaidInvoiceStatus,
  politeReminderFromInvoice,
  sanitizeReminderField,
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

  it('uses past-due wording only when the due date is before as-of', () => {
    const future = buildPolitePaymentReminder({
      customerName: 'Sam',
      amountCents: 2500,
      invoiceNumber: 'INV-9',
      dueDate: '2026-11-02',
      asOf: AS_OF,
    });
    expect(future.body).toContain(
      'Invoice INV-9 for NZ$25.00 is still outstanding (due 2 Nov 2026).',
    );
    expect(future.body).not.toContain('was due on');

    const pastDue = buildPolitePaymentReminder({
      customerName: 'Sam',
      amountCents: 2500,
      invoiceNumber: 'INV-9',
      dueDate: '2026-03-21',
      asOf: AS_OF,
    });
    expect(pastDue.body).toContain('was due on 21 Mar 2026 and is still unpaid.');
    expect(pastDue.body).not.toContain('still outstanding (due');
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
    expect(body).toContain('Hi AliceBcc: attacker@evil.exampleCc: other@evil.example,');
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

  it('drops enc:v1 blobs hidden by a leading space or control character', () => {
    expect(sanitizeReminderField('  enc:v1:abcdef')).toBe('');
    expect(sanitizeReminderField('\u0001enc:v1:abcdef')).toBe('');
    expect(sanitizeReminderField(' \u0007enc:v1:supersecretciphertext')).toBe('');
    expect(sanitizeReminderField('account enc:v1:tail')).toBe('');
    expect(sanitizeReminderField('\u0085enc:v1:nextline')).toBe('');
  });

  it('strips soft hyphen, U+061C, and U+180E before the enc:v1 check', () => {
    expect(sanitizeReminderField('enc:\u00ADv1:secret')).toBe('');
    expect(sanitizeReminderField('\u061Cenc:v1:secret')).toBe('');
    expect(sanitizeReminderField('\u180Eenc:v1:secret')).toBe('');
    expect(sanitizeReminderField('Pa\u00ADt\u061C\u180E')).toBe('Pat');

    const { body } = buildPolitePaymentReminder({
      customerName: 'Pa\u00ADt\u061C\u180E',
      invoiceNumber: 'INV-1',
      asOf: AS_OF,
    });
    expect(body).toContain('Hi Pat,');
    expect(body).not.toContain('\u00AD');
    expect(body).not.toContain('\u061C');
    expect(body).not.toContain('\u180E');
  });

  it('strips U+0085 from the greeting so it cannot start a new line', () => {
    const { body } = buildPolitePaymentReminder({
      customerName: 'Pat\u0085Bcc: hidden@evil.example',
      invoiceNumber: 'INV-1',
      asOf: AS_OF,
    });
    expect(body).not.toContain('\u0085');
    expect(body.split('\n').some((line) => /^bcc:/i.test(line.trim()))).toBe(false);
    expect(body).toContain('Hi PatBcc: hidden@evil.example,');
  });
});

describe('politeReminderFromInvoice staff fields and Stripe ids', () => {
  it('does not copy notes, internal memos, or the customer email', () => {
    const invoice = {
      clientName: 'Sam',
      invoiceNumber: 'INV-2',
      status: 'sent',
      notes: 'NOTE-LEAK-should-not-appear',
      internalMemo: 'SECRET-MEMO-9f3a',
      internal_memo: 'SECRET-MEMO-SNAKE',
      clientEmail: 'sam@example.com',
    };
    const { subject, body } = politeReminderFromInvoice(invoice, { asOf: AS_OF });
    const rendered = `${subject}\n${body}`;
    expect(rendered).not.toContain('NOTE-LEAK-should-not-appear');
    expect(rendered).not.toContain('SECRET-MEMO-9f3a');
    expect(rendered).not.toContain('SECRET-MEMO-SNAKE');
    expect(rendered).not.toContain('sam@example.com');
  });

  it('never copies a Stripe id, and does include the customer Checkout pay link', () => {
    // The pay link is the customer's payment URL. Stripe Checkout URLs contain
    // cs_… and are included on purpose. pi_ / cs_ values that are not that URL
    // (payment_reference, notes) must not appear.
    const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_SessionInLink';
    const invoiceWithStripeIds = {
      clientName: 'Sam',
      invoiceNumber: 'INV-20',
      status: 'overdue',
      dueDate: '2026-12-01',
      paymentLinkUrl: checkoutUrl,
      paymentReference: 'pi_3AbcSecretIntent',
      payment_reference: 'cs_test_SessionSecret',
      notes: 'please quote pi_3FromNotes and cs_test_FromNotes',
    };
    const fromInvoice = politeReminderFromInvoice(invoiceWithStripeIds, { asOf: AS_OF });
    const fromInput = buildPolitePaymentReminder(
      Object.assign(
        {
          customerName: 'Sam',
          invoiceNumber: 'INV-20',
          asOf: AS_OF,
          dueDate: '2026-12-01',
          paymentLinkUrl: checkoutUrl,
        },
        {
          paymentReference: 'pi_3FromInput',
          payment_reference: 'cs_test_FromInput',
        },
      ),
    );

    for (const reminder of [fromInvoice, fromInput]) {
      const text = `${reminder.subject}\n${reminder.body}`;
      expect(text).toContain(`Pay online: ${checkoutUrl}`);
      expect(text).not.toMatch(/pi_/);
      const withoutPayLink = text.split(checkoutUrl).join('');
      expect(withoutPayLink).not.toMatch(/cs_/);
    }
    expect(fromInvoice.body).toContain('Payment reference: INV-20');
    expect(fromInvoice.body).toContain('is still outstanding (due 1 Dec 2026)');
    expect(fromInvoice.body).not.toContain('was due on');
    expect(fromInvoice.body).not.toContain('pi_3AbcSecretIntent');
    expect(fromInvoice.body).not.toContain('cs_test_SessionSecret');
    expect(fromInvoice.body).not.toContain('cs_test_FromNotes');
  });
});

describe('due today under Pacific/Auckland and UTC', () => {
  it('never says a SQL DATE of today was due', () => {
    const reminderPath = path.resolve(
      __dirname,
      '../../../../../packages/shared/src/utils/payment-reminder.ts',
    );
    const tsxBin = path.resolve(__dirname, '../../../../../node_modules/.bin/tsx');
    const script = `
      import { buildPolitePaymentReminder, reminderLocalCalendarKey } from ${JSON.stringify(reminderPath)};
      const due = new Date(2026, 9, 25, 0, 0, 0, 0);
      const asOf = reminderLocalCalendarKey(new Date(2026, 9, 25, 15, 0, 0));
      const { body } = buildPolitePaymentReminder({
        customerName: 'Sam',
        amountCents: 100,
        invoiceNumber: 'INV-TZ',
        dueDate: due,
        asOf,
      });
      const payload = {
        tz: process.env.TZ,
        iso: due.toISOString(),
        asOf,
        wasDue: body.includes('was due'),
        outstanding: body.includes('still outstanding (due 25 Oct 2026)'),
      };
      console.log(JSON.stringify(payload));
      if (payload.wasDue || !payload.outstanding || payload.asOf !== '2026-10-25') process.exit(1);
    `;

    for (const tz of ['Pacific/Auckland', 'UTC']) {
      const result = spawnSync(tsxBin, ['-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `tsx exited ${result.status}`);
      }
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout.trim().split('\n').pop() as string) as {
        tz: string;
        iso: string;
        wasDue: boolean;
        outstanding: boolean;
      };
      expect(payload.tz).toBe(tz);
      expect(payload.wasDue).toBe(false);
      expect(payload.outstanding).toBe(true);
      if (tz === 'Pacific/Auckland') {
        expect(payload.iso.startsWith('2026-10-24T11:00:00.000Z')).toBe(true);
      } else {
        expect(payload.iso.startsWith('2026-10-25T00:00:00.000Z')).toBe(true);
      }
    }
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

  it('keeps a future due date neutral even when status is overdue', () => {
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
    expect(body).toContain('Invoice INV-11 for NZ$5.00 is still outstanding (due 1 Dec 2026).');
    expect(body).not.toContain('was due on');
  });
});

describe('formatPoliteReminderClipboard and mailto', () => {
  it('keeps an edited subject on one line and strips tags from the body', () => {
    const text = formatPoliteReminderClipboard(
      'Hello\r\nBcc: attacker@evil.example',
      'Please pay <b>today</b>\r\nThanks',
    );
    expect(text.startsWith('Subject: HelloBcc: attacker@evil.example\n\n')).toBe(true);
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

  it('rejects percent-encoded header injection, including a sync client_email', () => {
    // routes/sync.ts stores client_email as a free string, not an email schema.
    const syncClientEmail = 'victim%0D%0ABcc%3Aattacker@evil.com';
    const encoded = buildPoliteReminderMailto({
      to: syncClientEmail,
      subject: 'Friendly reminder',
      body: 'Please pay.',
    });
    expect(encoded.startsWith('mailto:?subject=')).toBe(true);
    expect(encoded.toLowerCase()).not.toContain('%0d');
    expect(encoded.toLowerCase()).not.toContain('%0a');
    expect(encoded).not.toContain('attacker@evil.com');
    expect(encoded).not.toContain('victim');

    for (const to of [
      'victim%0d%0aBcc%3Aattacker@evil.com',
      'user%0A@evil.com',
      'a%2Cb@evil.com',
      'a%3Bb@evil.com',
      'name%3Aextra@evil.com',
    ]) {
      const bad = buildPoliteReminderMailto({ to, subject: 'Hi', body: 'Pay' });
      expect(bad.startsWith('mailto:?')).toBe(true);
      expect(decodeURIComponent(bad)).not.toMatch(/[\r\n]/);
      expect(bad.toLowerCase()).not.toContain('attacker');
      expect(bad).not.toContain('%2C');
      expect(bad).not.toContain('%3B');
      expect(bad).not.toContain('%3A');
    }

    const plus = buildPoliteReminderMailto({
      to: 'user+tag@example.com',
      subject: 'Hi',
      body: 'Pay',
    });
    expect(plus.startsWith('mailto:user+tag@example.com?')).toBe(true);
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
