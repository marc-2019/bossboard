/**
 * Client-side onboarding field checks.
 * Keep soft: optional fields must not block "Skip", but invalid email/bank
 * should fail fast with a clear message before hitting the API.
 */

/** Basic email shape (API is source of truth; this matches common invalid input). */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return true; // empty = omit
  // pragmatic; server uses Zod email
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * NZ bank account: bank(2) + branch(4) + account(7) + suffix(2–3) = 15–16 digits.
 * Accepts dashed or plain digits. Empty is OK (optional).
 */
export function isValidNzBankAccountNumber(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 15 && digits.length <= 16;
}

export function normalizeNzBankAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 15) return value.trim();
  // Format XX-XXXX-XXXXXXX-XX (suffix 2) or XX-XXXX-XXXXXXX-XXX (suffix 3)
  const bank = digits.slice(0, 2);
  const branch = digits.slice(2, 6);
  const account = digits.slice(6, 13);
  const suffix = digits.slice(13);
  return `${bank}-${branch}-${account}-${suffix}`;
}

export type OnboardingFieldErrors = {
  companyEmail?: string;
  bankAccountNumber?: string;
};

export function validateOnboardingFields(input: {
  companyEmail: string;
  bankAccountNumber: string;
}): OnboardingFieldErrors {
  const errors: OnboardingFieldErrors = {};
  if (!isValidEmail(input.companyEmail)) {
    errors.companyEmail = 'Enter a valid email (or leave blank).';
  }
  if (!isValidNzBankAccountNumber(input.bankAccountNumber)) {
    errors.bankAccountNumber =
      'NZ bank accounts need 15–16 digits (e.g. 01-1234-5678901-00), or leave blank.';
  }
  return errors;
}

export function formatApiStepError(error: unknown, step: string): string {
  if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ApiError') {
    const e = error as { message?: string; status?: number; code?: string };
    const parts = [step, e.message || 'API request failed'];
    if (e.status) parts.push(`(HTTP ${e.status}${e.code ? ` ${e.code}` : ''})`);
    return parts.join(': ');
  }
  if (error instanceof Error) {
    return `${step}: ${error.message}`;
  }
  return `${step}: unexpected error`;
}
