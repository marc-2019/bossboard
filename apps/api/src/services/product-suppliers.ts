/**
 * Product supplier costs.
 * Every statement is scoped by user_id. The product must belong to that user.
 * Nothing in this module contacts a supplier.
 */

import { v4 as uuidv4 } from 'uuid';
import type { QueryResultRow } from 'pg';
import db from './database.js';
import { createError } from '../middleware/error.js';
import { priceFromCost, PricingError } from './pricing.js';

export type SourceTaxFlag = 'inclusive' | 'exclusive' | 'unknown';
export type SupplierCostSource = 'manual' | 'file';

export interface SupplierCostWriteFields {
  supplierName?: string | null;
  supplierUrl?: string | null;
  supplierSku?: string | null;
  gtin?: string | null;
  costCents?: number;
  priceIncludesGst?: boolean;
  sourceTaxFlag?: SourceTaxFlag;
  source?: SupplierCostSource;
  checkedAt?: string | null;
  isPreferred?: boolean;
  currency?: string;
}

export interface SupplierCostRecord {
  id: string;
  user_id: string;
  product_id: string;
  supplier_name: string | null;
  supplier_url: string | null;
  supplier_sku: string | null;
  gtin: string | null;
  cost_ex_gst_cents: number | null;
  currency: string;
  source_tax_flag: string | null;
  source: string;
  checked_at: string | null;
  is_preferred: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProductCostSnapshot {
  id: string;
  unit_cost: number | null;
  unit_price: number;
  default_margin_percent: number | null;
}

export interface SupplierCostWriteResult {
  supplier: SupplierCostRecord;
  /** Set when this write copied a preferred cost onto the product. */
  product: ProductCostSnapshot | null;
}

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

interface ProductLockRow extends QueryResultRow {
  id: string;
  unit_cost: number | null;
  unit_price: number;
  default_margin_percent: string | number | null;
  unit_cost_is_annual: boolean;
}

const MAX_COST_CENTS = 1_000_000_000_000;

function mathError(error: unknown): never {
  if (error instanceof PricingError) {
    throw createError(error.message, 400, 'VALIDATION_ERROR');
  }
  throw error;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dateOnly(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function assertCurrency(currency: string | undefined): void {
  if (currency != null && currency.trim().toUpperCase() !== 'NZD') {
    throw createError('Currency must be NZD', 400, 'VALIDATION_ERROR');
  }
}

function assertGtin(gtin: string | null): void {
  if (gtin != null && !/^\d{8,14}$/.test(gtin)) {
    throw createError('GTIN must be 8 to 14 digits', 400, 'VALIDATION_ERROR');
  }
}

function assertCheckedAt(checkedAt: string | null): void {
  if (checkedAt != null && !isIsoDate(checkedAt)) {
    throw createError('Enter a real date, like 2026-11-19.', 400, 'VALIDATION_ERROR');
  }
}

/**
 * Convert a newly typed cost once. Does not read or rewrite a stored ex-GST value.
 * Rejects source_tax_flag "unknown" for manual entry, and for file rows until confirmed.
 */
export function resolveEnteredCost(input: {
  costCents: number;
  priceIncludesGst?: boolean;
  sourceTaxFlag?: SourceTaxFlag;
  source?: SupplierCostSource;
}): { costExGstCents: number; sourceTaxFlag: 'inclusive' | 'exclusive' } {
  const source = input.source ?? 'manual';
  let flag = input.sourceTaxFlag;

  if (input.priceIncludesGst !== undefined) {
    const fromToggle: 'inclusive' | 'exclusive' = input.priceIncludesGst
      ? 'inclusive'
      : 'exclusive';
    if (flag && flag !== 'unknown' && flag !== fromToggle) {
      throw createError(
        "The GST answers don't match. Choose whether the price includes GST.",
        400,
        'VALIDATION_ERROR',
      );
    }
    flag = fromToggle;
  }

  if (!flag) {
    throw createError(
      'Tick whether the price includes GST.',
      400,
      'VALIDATION_ERROR',
    );
  }

  if (flag === 'unknown') {
    const message =
      source === 'manual'
        ? 'Say whether this price includes GST before saving.'
        : 'Confirm whether GST is included before saving this cost.';
    throw createError(message, 400, 'VALIDATION_ERROR');
  }

  if (!Number.isInteger(input.costCents) || input.costCents < 0 || input.costCents > MAX_COST_CENTS) {
    throw createError(
      input.costCents > MAX_COST_CENTS
        ? 'That cost is too large to save.'
        : 'Enter the cost in whole cents, zero or more.',
      400,
      'VALIDATION_ERROR',
    );
  }

  if (flag === 'inclusive') {
    try {
      return {
        costExGstCents: priceFromCost({
          costCents: input.costCents,
          gstTreatment: 'inclusive',
          unitBasis: 'per_unit',
          markupPercent: 0,
        }).exGstSellCents,
        sourceTaxFlag: 'inclusive',
      };
    } catch (error) {
      mathError(error);
    }
  }

  return { costExGstCents: input.costCents, sourceTaxFlag: 'exclusive' };
}

function transformSupplier(row: Record<string, unknown>): SupplierCostRecord {
  const cost = row.cost_ex_gst_cents;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    product_id: String(row.product_id),
    supplier_name: (row.supplier_name as string | null) ?? null,
    supplier_url: (row.supplier_url as string | null) ?? null,
    supplier_sku: (row.supplier_sku as string | null) ?? null,
    gtin: (row.gtin as string | null) ?? null,
    cost_ex_gst_cents: cost == null ? null : Number(cost),
    currency: String(row.currency ?? 'NZD').trim(),
    source_tax_flag: (row.source_tax_flag as string | null) ?? null,
    source: String(row.source ?? 'manual'),
    checked_at: dateOnly(row.checked_at),
    is_preferred: Boolean(row.is_preferred),
    created_at: row.created_at as Date | string,
    updated_at: row.updated_at as Date | string,
  };
}

function transformProductCost(row: Record<string, unknown>): ProductCostSnapshot {
  const marginRaw = row.default_margin_percent;
  const margin =
    marginRaw == null || marginRaw === ''
      ? null
      : Number(marginRaw);
  return {
    id: String(row.id),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    unit_price: Number(row.unit_price),
    default_margin_percent: margin != null && Number.isFinite(margin) ? margin : null,
  };
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505'
  );
}

function conflictFromUnique(error: { constraint?: string }): never {
  if (error.constraint === 'uq_product_supplier_costs_one_preferred') {
    throw createError(
      'Another supplier cost is already preferred for this product',
      409,
      'CONFLICT',
    );
  }
  throw createError(
    'A cost for this supplier and SKU already exists',
    409,
    'CONFLICT',
  );
}

async function lockProduct(
  client: Queryable,
  productId: string,
  userId: string,
): Promise<ProductLockRow> {
  const result = await client.query<ProductLockRow>(
    `SELECT id, unit_cost, unit_price, default_margin_percent, unit_cost_is_annual
     FROM products_services
     WHERE id = $1 AND user_id = $2
     FOR UPDATE`,
    [productId, userId],
  );
  if (result.rows.length === 0) {
    throw createError('Product not found', 404, 'NOT_FOUND');
  }
  return result.rows[0];
}

async function assertProductOwned(productId: string, userId: string): Promise<void> {
  const result = await db.query(
    `SELECT id FROM products_services WHERE id = $1 AND user_id = $2`,
    [productId, userId],
  );
  if (result.rows.length === 0) {
    throw createError('Product not found', 404, 'NOT_FOUND');
  }
}

async function clearOtherPreferred(
  client: Queryable,
  productId: string,
  userId: string,
  keepId: string | null,
): Promise<void> {
  await client.query(
    `UPDATE product_supplier_costs
     SET is_preferred = false, updated_at = NOW()
     WHERE product_id = $1 AND user_id = $2 AND is_preferred = true
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [productId, userId, keepId],
  );
}

async function copyPreferredCost(
  client: Queryable,
  userId: string,
  productId: string,
  costExGstCents: number,
  marginRaw: string | number | null,
  unitCostIsAnnual: boolean,
): Promise<ProductCostSnapshot> {
  const margin =
    marginRaw == null || marginRaw === ''
      ? null
      : Number(marginRaw);
  if (margin != null && Number.isFinite(margin)) {
    let unitPrice: number;
    try {
      // costExGstCents is already ex-GST. Pass exclusive so GST is not removed again.
      // An annual catalogue cost is divided by 12 once inside priceFromCost.
      unitPrice = priceFromCost({
        costCents: costExGstCents,
        gstTreatment: 'exclusive',
        unitBasis: unitCostIsAnnual ? 'annual' : 'per_unit',
        markupPercent: margin,
      }).exGstSellCents;
    } catch (error) {
      mathError(error);
    }
    const result = await client.query(
      `UPDATE products_services
       SET unit_cost = $1, unit_price = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, unit_cost, unit_price, default_margin_percent`,
      [costExGstCents, unitPrice, productId, userId],
    );
    if (result.rows.length === 0) {
      throw createError('Product not found', 404, 'NOT_FOUND');
    }
    return transformProductCost(result.rows[0]);
  }

  const result = await client.query(
    `UPDATE products_services
     SET unit_cost = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING id, unit_cost, unit_price, default_margin_percent`,
    [costExGstCents, productId, userId],
  );
  if (result.rows.length === 0) {
    throw createError('Product not found', 404, 'NOT_FOUND');
  }
  return transformProductCost(result.rows[0]);
}

function validatedIdentity(input: SupplierCostWriteFields, partial: boolean): {
  supplierName: string | null;
  supplierUrl: string | null;
  supplierSku: string | null;
  gtin: string | null;
  checkedAt: string | null;
} {
  assertCurrency(input.currency);
  const supplierName =
    input.supplierName === undefined ? null : emptyToNull(input.supplierName);
  if (!partial && !supplierName) {
    throw createError('Supplier name is required', 400, 'VALIDATION_ERROR');
  }
  if (supplierName != null && supplierName.length > 120) {
    throw createError('Supplier name must be 120 characters or fewer', 400, 'VALIDATION_ERROR');
  }
  const supplierUrl = input.supplierUrl === undefined ? null : emptyToNull(input.supplierUrl);
  if (supplierUrl != null && supplierUrl.length > 2000) {
    throw createError('Supplier URL must be 2000 characters or fewer', 400, 'VALIDATION_ERROR');
  }
  const supplierSku = input.supplierSku === undefined ? null : emptyToNull(input.supplierSku);
  if (supplierSku != null && supplierSku.length > 80) {
    throw createError('Supplier SKU must be 80 characters or fewer', 400, 'VALIDATION_ERROR');
  }
  const gtin = input.gtin === undefined ? null : emptyToNull(input.gtin);
  assertGtin(gtin);
  const checkedAt = input.checkedAt === undefined ? null : emptyToNull(input.checkedAt);
  assertCheckedAt(checkedAt);
  return { supplierName, supplierUrl, supplierSku, gtin, checkedAt };
}

export async function listSupplierCosts(
  userId: string,
  productId: string,
): Promise<SupplierCostRecord[]> {
  await assertProductOwned(productId, userId);
  const result = await db.query(
    `SELECT * FROM product_supplier_costs
     WHERE product_id = $1 AND user_id = $2
     ORDER BY is_preferred DESC, supplier_name ASC NULLS LAST, created_at ASC
     LIMIT 200`,
    [productId, userId],
  );
  return result.rows.map((row) => transformSupplier(row));
}

export async function getSupplierCost(
  userId: string,
  productId: string,
  supplierId: string,
): Promise<SupplierCostRecord> {
  await assertProductOwned(productId, userId);
  const result = await db.query(
    `SELECT * FROM product_supplier_costs
     WHERE id = $1 AND product_id = $2 AND user_id = $3`,
    [supplierId, productId, userId],
  );
  if (result.rows.length === 0) {
    throw createError('Supplier cost not found', 404, 'NOT_FOUND');
  }
  return transformSupplier(result.rows[0]);
}

export async function createSupplierCost(
  userId: string,
  productId: string,
  input: SupplierCostWriteFields,
): Promise<SupplierCostWriteResult> {
  if (input.costCents === undefined) {
    throw createError('Cost is required', 400, 'VALIDATION_ERROR');
  }
  const identity = validatedIdentity(input, false);
  const resolved = resolveEnteredCost({
    costCents: input.costCents,
    priceIncludesGst: input.priceIncludesGst,
    sourceTaxFlag: input.sourceTaxFlag,
    source: input.source,
  });
  const source = input.source ?? 'manual';
  const isPreferred = Boolean(input.isPreferred);
  const id = uuidv4();

  try {
    return await db.transaction(async (client) => {
      const product = await lockProduct(client, productId, userId);
      if (isPreferred) {
        await clearOtherPreferred(client, productId, userId, null);
      }
      const inserted = await client.query(
        `INSERT INTO product_supplier_costs (
           id, user_id, product_id, supplier_name, supplier_url, supplier_sku, gtin,
           cost_ex_gst_cents, currency, source_tax_flag, source, checked_at, is_preferred
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'NZD', $9, $10, $11, $12)
         RETURNING *`,
        [
          id,
          userId,
          productId,
          identity.supplierName,
          identity.supplierUrl,
          identity.supplierSku,
          identity.gtin,
          resolved.costExGstCents,
          resolved.sourceTaxFlag,
          source,
          identity.checkedAt,
          isPreferred,
        ],
      );
      const supplier = transformSupplier(inserted.rows[0]);
      const copied = isPreferred
        ? await copyPreferredCost(
            client,
            userId,
            productId,
            resolved.costExGstCents,
            product.default_margin_percent,
            Boolean(product.unit_cost_is_annual),
          )
        : null;
      return { supplier, product: copied };
    });
  } catch (error) {
    if (isUniqueViolation(error)) conflictFromUnique(error);
    throw error;
  }
}

export async function updateSupplierCost(
  userId: string,
  productId: string,
  supplierId: string,
  input: SupplierCostWriteFields,
): Promise<SupplierCostWriteResult> {
  assertCurrency(input.currency);
  const taxTouched =
    input.costCents !== undefined ||
    input.priceIncludesGst !== undefined ||
    input.sourceTaxFlag !== undefined;
  if (taxTouched && input.costCents === undefined) {
    throw createError(
      'Enter the cost when you say whether GST is included.',
      400,
      'VALIDATION_ERROR',
    );
  }

  try {
    return await db.transaction(async (client) => {
      const product = await lockProduct(client, productId, userId);
      const existingResult = await client.query(
        `SELECT * FROM product_supplier_costs
         WHERE id = $1 AND product_id = $2 AND user_id = $3
         FOR UPDATE`,
        [supplierId, productId, userId],
      );
      if (existingResult.rows.length === 0) {
        throw createError('Supplier cost not found', 404, 'NOT_FOUND');
      }
      const existing = transformSupplier(existingResult.rows[0]);

      const supplierName =
        input.supplierName !== undefined
          ? emptyToNull(input.supplierName)
          : existing.supplier_name;
      if (!supplierName) {
        throw createError('Supplier name is required', 400, 'VALIDATION_ERROR');
      }
      if (supplierName.length > 120) {
        throw createError('Supplier name must be 120 characters or fewer', 400, 'VALIDATION_ERROR');
      }
      const supplierUrl =
        input.supplierUrl !== undefined ? emptyToNull(input.supplierUrl) : existing.supplier_url;
      if (supplierUrl != null && supplierUrl.length > 2000) {
        throw createError('Supplier URL must be 2000 characters or fewer', 400, 'VALIDATION_ERROR');
      }
      const supplierSku =
        input.supplierSku !== undefined ? emptyToNull(input.supplierSku) : existing.supplier_sku;
      if (supplierSku != null && supplierSku.length > 80) {
        throw createError('Supplier SKU must be 80 characters or fewer', 400, 'VALIDATION_ERROR');
      }
      const gtin = input.gtin !== undefined ? emptyToNull(input.gtin) : existing.gtin;
      assertGtin(gtin);
      const checkedAt =
        input.checkedAt !== undefined ? emptyToNull(input.checkedAt) : existing.checked_at;
      assertCheckedAt(checkedAt);

      const source = input.source ?? (existing.source as SupplierCostSource);
      // A cost is converted only from the cents in this request, never from the stored ex-GST figure.
      const resolved =
        input.costCents !== undefined
          ? resolveEnteredCost({
              costCents: input.costCents,
              priceIncludesGst: input.priceIncludesGst,
              sourceTaxFlag: input.sourceTaxFlag,
              source,
            })
          : null;
      const costExGstCents = resolved ? resolved.costExGstCents : existing.cost_ex_gst_cents;
      const sourceTaxFlag = resolved ? resolved.sourceTaxFlag : existing.source_tax_flag;
      const isPreferred =
        input.isPreferred !== undefined ? input.isPreferred : existing.is_preferred;

      if (isPreferred) {
        await clearOtherPreferred(client, productId, userId, supplierId);
      }

      const updated = await client.query(
        `UPDATE product_supplier_costs
         SET supplier_name = $1,
             supplier_url = $2,
             supplier_sku = $3,
             gtin = $4,
             cost_ex_gst_cents = $5,
             source_tax_flag = $6,
             source = $7,
             checked_at = $8,
             is_preferred = $9,
             updated_at = NOW()
         WHERE id = $10 AND product_id = $11 AND user_id = $12
         RETURNING *`,
        [
          supplierName,
          supplierUrl,
          supplierSku,
          gtin,
          costExGstCents,
          sourceTaxFlag,
          source,
          checkedAt,
          isPreferred,
          supplierId,
          productId,
          userId,
        ],
      );
      if (updated.rows.length === 0) {
        throw createError('Supplier cost not found', 404, 'NOT_FOUND');
      }
      const supplier = transformSupplier(updated.rows[0]);
      const shouldCopy = supplier.is_preferred && supplier.cost_ex_gst_cents != null;
      const copied = shouldCopy
        ? await copyPreferredCost(
            client,
            userId,
            productId,
            supplier.cost_ex_gst_cents as number,
            product.default_margin_percent,
            Boolean(product.unit_cost_is_annual),
          )
        : null;
      return { supplier, product: copied };
    });
  } catch (error) {
    if (isUniqueViolation(error)) conflictFromUnique(error);
    throw error;
  }
}

export async function deleteSupplierCost(
  userId: string,
  productId: string,
  supplierId: string,
): Promise<void> {
  await assertProductOwned(productId, userId);
  const result = await db.query(
    `DELETE FROM product_supplier_costs
     WHERE id = $1 AND product_id = $2 AND user_id = $3
     RETURNING id`,
    [supplierId, productId, userId],
  );
  if ((result.rowCount ?? result.rows.length) === 0) {
    throw createError('Supplier cost not found', 404, 'NOT_FOUND');
  }
}

export default {
  listSupplierCosts,
  getSupplierCost,
  createSupplierCost,
  updateSupplierCost,
  deleteSupplierCost,
  resolveEnteredCost,
};
