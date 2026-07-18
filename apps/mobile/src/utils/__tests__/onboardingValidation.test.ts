import {
  isValidEmail,
  isValidNzBankAccountNumber,
  normalizeNzBankAccountNumber,
  validateOnboardingFields,
  formatApiStepError,
} from '../onboardingValidation';

describe('onboardingValidation', () => {
  describe('isValidEmail', () => {
    it('allows empty', () => {
      expect(isValidEmail('')).toBe(true);
      expect(isValidEmail('  ')).toBe(true);
    });
    it('accepts normal emails', () => {
      expect(isValidEmail('apple-review@instilligent.com')).toBe(true);
    });
    it('rejects garbage', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('a@')).toBe(false);
    });
  });

  describe('NZ bank account', () => {
    it('allows empty', () => {
      expect(isValidNzBankAccountNumber('')).toBe(true);
    });
    it('accepts dashed NZ format', () => {
      expect(isValidNzBankAccountNumber('01-1234-5678901-00')).toBe(true);
    });
    it('accepts 15 plain digits (video case length)', () => {
      expect(isValidNzBankAccountNumber('125488545521245')).toBe(true);
    });
    it('rejects too short', () => {
      expect(isValidNzBankAccountNumber('12345')).toBe(false);
      expect(isValidNzBankAccountNumber('01-1234-567')).toBe(false);
    });
    it('normalizes plain digits to dashed', () => {
      expect(normalizeNzBankAccountNumber('011234567890100')).toBe('01-1234-5678901-00');
    });
  });

  describe('validateOnboardingFields', () => {
    it('returns field errors for bad email and bank', () => {
      const e = validateOnboardingFields({
        companyEmail: 'nope',
        bankAccountNumber: '12',
      });
      expect(e.companyEmail).toBeTruthy();
      expect(e.bankAccountNumber).toBeTruthy();
    });
    it('clean for demo-like payload', () => {
      const e = validateOnboardingFields({
        companyEmail: 'apple-review@instilligent.com',
        bankAccountNumber: '125488545521245',
      });
      expect(e).toEqual({});
    });
  });

  describe('formatApiStepError', () => {
    it('formats ApiError-like objects', () => {
      const err = Object.assign(new Error('Invalid email format'), {
        name: 'ApiError',
        status: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(formatApiStepError(err, 'Business profile')).toContain('Invalid email format');
      expect(formatApiStepError(err, 'Business profile')).toContain('400');
    });
  });
});
