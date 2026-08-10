/**
 * Business Profile Service
 * Company details, bank info, and invoice defaults management
 */

import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import {
  BusinessProfile,
  BusinessProfileUpsertInput,
} from '../types/index.js';
import { encryptField, decryptField } from '../utils/field-crypto.js';
import { recordDataAccess } from './data-access-audit.js';

/** Decrypt sensitive business-profile columns (legacy plaintext pass-through). */
function d(v: unknown): string | null {
  return decryptField((v as string | null) ?? null);
}

/**
 * Transform DB row to BusinessProfile type with proper casing
 */
function transformProfile(row: Record<string, unknown>): BusinessProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    companyName: row.company_name as string | null,
    tradingAs: row.trading_as as string | null,
    irdNumber: d(row.ird_number),
    gstNumber: d(row.gst_number),
    isGstRegistered: row.is_gst_registered as boolean,
    companyAddress: d(row.company_address),
    companyPhone: d(row.company_phone),
    companyEmail: d(row.company_email),
    invoiceBccEmail: d(row.invoice_bcc_email),
    bankAccountName: d(row.bank_account_name),
    bankAccountNumber: d(row.bank_account_number),
    bankName: d(row.bank_name),
    intlBankAccountName: d(row.intl_bank_account_name),
    intlIban: d(row.intl_iban),
    intlSwiftBic: d(row.intl_swift_bic),
    intlBankName: d(row.intl_bank_name),
    intlBankAddress: d(row.intl_bank_address),
    intlRoutingNumber: d(row.intl_routing_number),
    defaultPaymentTerms: row.default_payment_terms as number,
    defaultNotes: d(row.default_notes),
    invoicePrefix: row.invoice_prefix as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(profile: BusinessProfile): Record<string, unknown> {
  return {
    id: profile.id,
    user_id: profile.userId,
    company_name: profile.companyName,
    trading_as: profile.tradingAs,
    ird_number: profile.irdNumber,
    gst_number: profile.gstNumber,
    is_gst_registered: profile.isGstRegistered,
    company_address: profile.companyAddress,
    company_phone: profile.companyPhone,
    company_email: profile.companyEmail,
    invoice_bcc_email: profile.invoiceBccEmail,
    bank_account_name: profile.bankAccountName,
    bank_account_number: profile.bankAccountNumber,
    bank_name: profile.bankName,
    intl_bank_account_name: profile.intlBankAccountName,
    intl_iban: profile.intlIban,
    intl_swift_bic: profile.intlSwiftBic,
    intl_bank_name: profile.intlBankName,
    intl_bank_address: profile.intlBankAddress,
    intl_routing_number: profile.intlRoutingNumber,
    default_payment_terms: profile.defaultPaymentTerms,
    default_notes: profile.defaultNotes,
    invoice_prefix: profile.invoicePrefix,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

/**
 * Get business profile for user
 */
export async function getBusinessProfile(
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM business_profiles WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  await recordDataAccess({
    entityType: 'business_profile',
    entityId: result.rows[0].id as string,
    action: 'read',
    actorUserId: userId,
  });

  return transformForMobile(transformProfile(result.rows[0]));
}

/**
 * Upsert business profile (INSERT ON CONFLICT DO UPDATE)
 */
export async function upsertBusinessProfile(
  userId: string,
  input: BusinessProfileUpsertInput
): Promise<Record<string, unknown>> {
  const profileId = uuidv4();

  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO business_profiles (
      id, user_id,
      company_name, trading_as, ird_number, gst_number, is_gst_registered,
      company_address, company_phone, company_email, invoice_bcc_email,
      bank_account_name, bank_account_number, bank_name,
      intl_bank_account_name, intl_iban, intl_swift_bic, intl_bank_name, intl_bank_address, intl_routing_number,
      default_payment_terms, default_notes, invoice_prefix
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    ON CONFLICT (user_id) DO UPDATE SET
      company_name = COALESCE(EXCLUDED.company_name, business_profiles.company_name),
      trading_as = COALESCE(EXCLUDED.trading_as, business_profiles.trading_as),
      ird_number = COALESCE(EXCLUDED.ird_number, business_profiles.ird_number),
      gst_number = COALESCE(EXCLUDED.gst_number, business_profiles.gst_number),
      is_gst_registered = COALESCE(EXCLUDED.is_gst_registered, business_profiles.is_gst_registered),
      company_address = COALESCE(EXCLUDED.company_address, business_profiles.company_address),
      company_phone = COALESCE(EXCLUDED.company_phone, business_profiles.company_phone),
      company_email = COALESCE(EXCLUDED.company_email, business_profiles.company_email),
      invoice_bcc_email = COALESCE(EXCLUDED.invoice_bcc_email, business_profiles.invoice_bcc_email),
      bank_account_name = COALESCE(EXCLUDED.bank_account_name, business_profiles.bank_account_name),
      bank_account_number = COALESCE(EXCLUDED.bank_account_number, business_profiles.bank_account_number),
      bank_name = COALESCE(EXCLUDED.bank_name, business_profiles.bank_name),
      intl_bank_account_name = COALESCE(EXCLUDED.intl_bank_account_name, business_profiles.intl_bank_account_name),
      intl_iban = COALESCE(EXCLUDED.intl_iban, business_profiles.intl_iban),
      intl_swift_bic = COALESCE(EXCLUDED.intl_swift_bic, business_profiles.intl_swift_bic),
      intl_bank_name = COALESCE(EXCLUDED.intl_bank_name, business_profiles.intl_bank_name),
      intl_bank_address = COALESCE(EXCLUDED.intl_bank_address, business_profiles.intl_bank_address),
      intl_routing_number = COALESCE(EXCLUDED.intl_routing_number, business_profiles.intl_routing_number),
      default_payment_terms = COALESCE(EXCLUDED.default_payment_terms, business_profiles.default_payment_terms),
      default_notes = COALESCE(EXCLUDED.default_notes, business_profiles.default_notes),
      invoice_prefix = COALESCE(EXCLUDED.invoice_prefix, business_profiles.invoice_prefix),
      updated_at = NOW()
    RETURNING *`,
    [
      profileId,
      userId,
      input.companyName || null,
      input.tradingAs || null,
      encryptField(input.irdNumber || null),
      encryptField(input.gstNumber || null),
      input.isGstRegistered ?? false,
      encryptField(input.companyAddress || null),
      encryptField(input.companyPhone || null),
      encryptField(input.companyEmail || null),
      encryptField(input.invoiceBccEmail || null),
      encryptField(input.bankAccountName || null),
      encryptField(input.bankAccountNumber || null),
      encryptField(input.bankName || null),
      encryptField(input.intlBankAccountName || null),
      encryptField(input.intlIban || null),
      encryptField(input.intlSwiftBic || null),
      encryptField(input.intlBankName || null),
      encryptField(input.intlBankAddress || null),
      encryptField(input.intlRoutingNumber || null),
      input.defaultPaymentTerms ?? 20,
      encryptField(input.defaultNotes || null),
      input.invoicePrefix || 'INV',
    ]
  );

  const profile = transformForMobile(transformProfile(result.rows[0]));
  await recordDataAccess({
    entityType: 'business_profile',
    entityId: result.rows[0].id as string,
    action: 'update',
    actorUserId: userId,
    metadata: { upsert: true },
  });
  return profile;
}

/** Bank details shape returned for invoice/quote auto-population */
export interface BankDetailsForInvoice {
  companyName: string | null;
  companyAddress: string | null;
  irdNumber: string | null;
  gstNumber: string | null;
  isGstRegistered: boolean | undefined;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  intlBankAccountName: string | null;
  intlIban: string | null;
  intlSwiftBic: string | null;
  intlBankName: string | null;
  intlBankAddress: string | null;
  defaultPaymentTerms: number;
  defaultNotes: string | null;
  invoicePrefix: string;
}

/**
 * Get bank and company details for auto-populating invoices
 */
export async function getBankDetailsForInvoice(
  userId: string
): Promise<BankDetailsForInvoice | null> {
  const result = await db.query(
    `SELECT
      company_name, company_address, ird_number, gst_number, is_gst_registered,
      bank_account_name, bank_account_number,
      intl_bank_account_name, intl_iban, intl_swift_bic, intl_bank_name, intl_bank_address,
      default_payment_terms, default_notes, invoice_prefix
    FROM business_profiles WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    companyName: row.company_name as string | null,
    companyAddress: d(row.company_address),
    irdNumber: d(row.ird_number),
    gstNumber: d(row.gst_number),
    isGstRegistered: row.is_gst_registered as boolean | undefined,
    bankAccountName: d(row.bank_account_name),
    bankAccountNumber: d(row.bank_account_number),
    intlBankAccountName: d(row.intl_bank_account_name),
    intlIban: d(row.intl_iban),
    intlSwiftBic: d(row.intl_swift_bic),
    intlBankName: d(row.intl_bank_name),
    intlBankAddress: d(row.intl_bank_address),
    defaultPaymentTerms: row.default_payment_terms as number,
    defaultNotes: d(row.default_notes),
    invoicePrefix: row.invoice_prefix as string,
  };
}

export default {
  getBusinessProfile,
  upsertBusinessProfile,
  getBankDetailsForInvoice,
};
