/**
 * Field encryption unit tests
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-field-crypto';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.NODE_ENV = 'test';

import {
  encryptField,
  decryptField,
  isEncryptedValue,
  blindIndex,
  looksLikeBankAccountDetails,
  _resetFieldCryptoForTests,
  isFieldEncryptionEnabled,
} from '../../utils/field-crypto.js';

beforeEach(() => {
  _resetFieldCryptoForTests();
});

describe('field-crypto', () => {
  it('encrypts and decrypts round-trip', () => {
    expect(isFieldEncryptionEnabled()).toBe(true);
    const enc = encryptField('021 123 4567');
    expect(enc).toBeTruthy();
    expect(isEncryptedValue(enc!)).toBe(true);
    expect(decryptField(enc)).toBe('021 123 4567');
  });

  it('pass-through for legacy plaintext on decrypt', () => {
    expect(decryptField('plain legacy')).toBe('plain legacy');
  });

  it('null/empty stays null', () => {
    expect(encryptField(null)).toBeNull();
    expect(encryptField('')).toBeNull();
    expect(decryptField(null)).toBeNull();
  });

  it('blind index is stable and case-insensitive for email', () => {
    expect(blindIndex('Joan@Example.com')).toBe(blindIndex('joan@example.com'));
    expect(blindIndex('a@b.com')).not.toBe(blindIndex('c@d.com'));
  });

  it('detects NZ bank account patterns', () => {
    expect(looksLikeBankAccountDetails('Please pay 04-2021-0210321-06')).toBe(true);
    expect(looksLikeBankAccountDetails('Thanks for the work this week')).toBe(false);
  });
});
