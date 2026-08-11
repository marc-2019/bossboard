/**
 * Field-level encryption for sensitive PII at rest (AES-256-GCM).
 *
 * Format: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * Legacy plaintext rows decrypt as pass-through (no prefix).
 *
 * Key: FIELD_ENCRYPTION_KEY (32-byte secret as base64 or 64-char hex).
 * Production requires an explicit key. Development may derive from JWT_SECRET.
 */

import crypto from 'crypto';
import { config } from '../config/index.js';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

let cachedKey: Buffer | null | undefined;

function resolveKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = (config.fieldEncryptionKey || '').trim();
  if (!raw) {
    if (config.isDevelopment && config.jwt.secret) {
      cachedKey = crypto.createHash('sha256').update(`bb-dev-field:${config.jwt.secret}`).digest();
      console.warn(
        '[field-crypto] FIELD_ENCRYPTION_KEY unset — using dev key derived from JWT_SECRET. Set FIELD_ENCRYPTION_KEY in production.',
      );
      return cachedKey;
    }
    cachedKey = null;
    if (!config.isDevelopment) {
      console.error(
        '[field-crypto] FIELD_ENCRYPTION_KEY is required in production for PII field encryption.',
      );
    }
    return null;
  }

  // 64 hex chars → 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, 'hex');
    return cachedKey;
  }
  // base64 (standard) 32 bytes
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) {
      cachedKey = buf;
      return cachedKey;
    }
  } catch {
    /* fall through */
  }
  // utf8 passphrase → hash
  cachedKey = crypto.createHash('sha256').update(raw).digest();
  return cachedKey;
}

/** True when encryption is available (key present). */
export function isFieldEncryptionEnabled(): boolean {
  return resolveKey() !== null;
}

export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a string field. Returns null for null/empty.
 * Throws in production if key missing and value is non-empty.
 */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  if (isEncryptedValue(plain)) return plain;

  const key = resolveKey();
  if (!key) {
    if (!config.isDevelopment) {
      throw new Error(
        'FIELD_ENCRYPTION_KEY is required to store sensitive customer data in production',
      );
    }
    return plain;
  }

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    iv.toString('base64') +
    ':' +
    tag.toString('base64') +
    ':' +
    encrypted.toString('base64')
  );
}

/**
 * Decrypt a field. Pass-through for legacy plaintext (no prefix).
 * Never returns ciphertext — customer-facing surfaces must not show enc:v1:…
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return null;
  if (!isEncryptedValue(stored)) return stored;

  const key = resolveKey();
  if (!key) {
    console.error('[field-crypto] Cannot decrypt: key missing');
    return null;
  }

  try {
    const body = stored.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
    // Defense in depth: never bubble ciphertext if nested/corrupt
    if (isEncryptedValue(plain)) return null;
    return plain;
  } catch (err) {
    console.error('[field-crypto] Decrypt failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * For display on invoices/PDF/email: decrypt, or null if still looks encrypted.
 */
export function decryptForDisplay(stored: string | null | undefined): string | null {
  const v = decryptField(stored);
  if (v && isEncryptedValue(v)) return null;
  return v;
}

/** Blind index for equality search (email). Not reversible. */
export function blindIndex(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const key = resolveKey();
  const material = key ? Buffer.concat([key, Buffer.from(normalized, 'utf8')]) : Buffer.from(normalized, 'utf8');
  return crypto.createHash('sha256').update(material).digest('hex');
}

/**
 * Detect NZ bank account patterns (and similar) so we don't store
 * payment credentials in free-text client notes.
 */
export function looksLikeBankAccountDetails(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.replace(/\s+/g, ' ');
  // NZ format 00-0000-0000000-000 or without dashes
  if (/\b\d{2}[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d{2,3}\b/.test(t)) return true;
  // IBAN-like
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i.test(t)) return true;
  // Explicit bank keywords + digits
  if (
    /\b(account\s*(number|no\.?|#)|bank\s*account|bsb|sort\s*code)\b/i.test(t) &&
    /\d{6,}/.test(t)
  ) {
    return true;
  }
  return false;
}

export const BANK_DETAILS_IN_NOTES_MESSAGE =
  'Do not put bank account numbers in client notes. Save your payment details once under Settings → Business / Bank details so they appear on all invoices.';

/** Reset cached key (tests only). */
export function _resetFieldCryptoForTests(): void {
  cachedKey = undefined;
}
