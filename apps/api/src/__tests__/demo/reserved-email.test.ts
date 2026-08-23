import { isReservedTestEmail } from '../../demo/reserved-email.js';

describe('isReservedTestEmail', () => {
  it('accepts @example.test and other reserved hosts', () => {
    expect(isReservedTestEmail('mike.tane@example.test')).toBe(true);
    expect(isReservedTestEmail('admin@tewhanautrust.example.test')).toBe(true);
    expect(isReservedTestEmail('user@example.com')).toBe(true);
  });

  it('rejects live-looking mailboxes', () => {
    expect(isReservedTestEmail('someone@gmail.com')).toBe(false);
    expect(isReservedTestEmail('test@bossboard.nz')).toBe(false);
    expect(isReservedTestEmail(undefined)).toBe(false);
    expect(isReservedTestEmail('')).toBe(false);
  });
});
