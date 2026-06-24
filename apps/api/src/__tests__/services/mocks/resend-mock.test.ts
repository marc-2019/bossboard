/**
 * Resend Mock Tests
 *
 * Exercises installResendMock() and the in-memory outbox helpers, covering
 * recipient normalisation (array / single string / missing), present-vs-absent
 * optional fields (from/subject/html/text), and attachment name extraction
 * (named / unnamed / no attachments array).
 */

import {
  installResendMock,
  getCapturedEmails,
  clearCapturedEmails,
} from '../../../services/mocks/resend-mock.js';

function makeFakeResend(): any {
  return { emails: { send: async () => ({ data: null, error: null }) } };
}

describe('installResendMock', () => {
  beforeEach(() => clearCapturedEmails());

  it('returns the same client for chaining', () => {
    const resend = makeFakeResend();
    expect(installResendMock(resend)).toBe(resend);
  });

  it('captures a fully-populated email and returns a synthetic id', async () => {
    const resend = makeFakeResend();
    installResendMock(resend);
    const res = await resend.emails.send({
      from: 'noreply@bossboard.app',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Your invoice',
      html: '<p>hi</p>',
      text: 'hi',
      attachments: [{ filename: 'invoice.pdf' }, { filename: 'receipt.pdf' }],
    });
    expect(res.error).toBeNull();
    expect(res.data?.id).toMatch(/^[0-9a-f-]{36}$/);

    const captured = getCapturedEmails();
    expect(captured).toHaveLength(1);
    const e = captured[0];
    expect(e.from).toBe('noreply@bossboard.app');
    expect(e.to).toEqual(['a@example.com', 'b@example.com']);
    expect(e.subject).toBe('Your invoice');
    expect(e.html).toBe('<p>hi</p>');
    expect(e.text).toBe('hi');
    expect(e.attachmentNames).toEqual(['invoice.pdf', 'receipt.pdf']);
    expect(e.sentAt).toEqual(expect.any(String));
  });

  it('normalises a single string recipient to an array', async () => {
    const resend = makeFakeResend();
    installResendMock(resend);
    await resend.emails.send({ from: 'x@y.z', to: 'solo@example.com', subject: 'Hi' });
    expect(getCapturedEmails()[0].to).toEqual(['solo@example.com']);
  });

  it('defaults missing fields and yields an empty recipient list', async () => {
    const resend = makeFakeResend();
    installResendMock(resend);
    await resend.emails.send({});
    const e = getCapturedEmails()[0];
    expect(e.to).toEqual([]);
    expect(e.from).toBe('');
    expect(e.subject).toBe('');
    expect(e.html).toBeUndefined();
    expect(e.text).toBeUndefined();
    expect(e.attachmentNames).toEqual([]);
  });

  it('falls back to "attachment" for attachments without a filename', async () => {
    const resend = makeFakeResend();
    installResendMock(resend);
    await resend.emails.send({
      to: 'c@example.com',
      attachments: [{}, { filename: 'named.pdf' }],
    });
    expect(getCapturedEmails()[0].attachmentNames).toEqual(['attachment', 'named.pdf']);
  });

  it('clearCapturedEmails resets the outbox between scenarios', async () => {
    const resend = makeFakeResend();
    installResendMock(resend);
    await resend.emails.send({ to: 'd@example.com', subject: 'one' });
    expect(getCapturedEmails()).toHaveLength(1);
    clearCapturedEmails();
    expect(getCapturedEmails()).toHaveLength(0);
  });
});
