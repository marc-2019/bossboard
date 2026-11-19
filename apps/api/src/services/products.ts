/**
 * Products/Services Service
 * Product and service catalog management for invoicing
 */

import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import { createError } from '../middleware/error.js';
import { priceFromCost, PricingError } from './pricing.js';
import {
  ProductService,
  ProductType,
  ProductServiceCreateInput,
  ProductServiceUpdateInput,
} from '../types/index.js';

/**
 * Transform DB row to ProductService type with proper casing
 */
function transformProduct(row: Record<string, unknown>): ProductService {
  const marginRaw = row.default_margin_percent;
  const defaultMarginPercent =
    marginRaw === null || marginRaw === undefined
      ? null
      : Number(marginRaw);

  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    description: row.description as string | null,
    unitPrice: row.unit_price as number,
    unitCost: (row.unit_cost as number | null) ?? null,
    unitCostIsAnnual: Boolean(row.unit_cost_is_annual),
    defaultMarginPercent:
      defaultMarginPercent != null && Number.isFinite(defaultMarginPercent)
        ? defaultMarginPercent
        : null,
    type: row.type as ProductType,
    isGstApplicable: row.is_gst_applicable as boolean,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/**
 * Transform to mobile-friendly snake_case format
 */
function transformForMobile(product: ProductService): Record<string, unknown> {
  return {
    id: product.id,
    user_id: product.userId,
    name: product.name,
    description: product.description,
    unit_price: product.unitPrice,
    unit_cost: product.unitCost,
    unit_cost_is_annual: product.unitCostIsAnnual,
    default_margin_percent: product.defaultMarginPercent,
    type: product.type,
    is_gst_applicable: product.isGstApplicable,
    is_active: product.isActive,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
}

/**
 * Catalogue unit_cost is the ex-GST figure (a supplier inclusive price is
 * converted once before it is copied here). Annual costs are divided by 12
 * inside priceFromCost, then marked up once.
 */
function sellCentsForCatalogueCost(
  costCents: number,
  markupPercent: number,
  unitCostIsAnnual: boolean,
): number {
  try {
    return priceFromCost({
      costCents,
      gstTreatment: 'exclusive',
      unitBasis: unitCostIsAnnual ? 'annual' : 'per_unit',
      markupPercent,
    }).exGstSellCents;
  } catch (error) {
    if (error instanceof PricingError) {
      throw createError(error.message, 400, 'VALIDATION_ERROR');
    }
    throw error;
  }
}

function finiteMargin(value: unknown): number | null {
  if (value == null || value === '') return null;
  const margin = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(margin) ? margin : null;
}

/**
 * Create a new product/service
 */
export async function createProduct(
  userId: string,
  input: ProductServiceCreateInput
): Promise<Record<string, unknown>> {
  const productId = uuidv4();
  const annual = Boolean(input.unitCostIsAnnual);
  const margin = finiteMargin(input.defaultMarginPercent);
  let unitPrice = input.unitPrice;
  if (input.unitCost != null && margin != null) {
    unitPrice = sellCentsForCatalogueCost(input.unitCost, margin, annual);
  }

  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO products_services (
      id, user_id, name, description, unit_price, unit_cost, unit_cost_is_annual,
      default_margin_percent, type, is_gst_applicable
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      productId,
      userId,
      input.name,
      input.description || null,
      unitPrice,
      input.unitCost != null ? input.unitCost : null,
      annual,
      margin,
      input.type || 'fixed',
      input.isGstApplicable !== undefined ? input.isGstApplicable : true,
    ]
  );

  return transformForMobile(transformProduct(result.rows[0]));
}

/**
 * Get product/service by ID
 */
export async function getProductById(
  productId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM products_services WHERE id = $1 AND user_id = $2`,
    [productId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformProduct(result.rows[0]));
}

/**
 * List products/services for user
 */
export async function listProducts(
  userId: string,
  options: { limit?: number; offset?: number; type?: ProductType; search?: string; includeInactive?: boolean } = {}
): Promise<{ products: Record<string, unknown>[]; total: number }> {
  const { limit = 50, offset = 0, type, search, includeInactive = false } = options;

  const conditions: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (!includeInactive) {
    conditions.push('is_active = true');
  }

  if (type) {
    conditions.push(`type = $${paramIndex++}`);
    params.push(type);
  }

  if (search) {
    conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM products_services WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get items ordered by name
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM products_services
     WHERE ${whereClause}
     ORDER BY name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  const products = result.rows.map((row) =>
    transformForMobile(transformProduct(row))
  );

  return { products, total };
}

/**
 * Update product/service
 */
export async function updateProduct(
  productId: string,
  userId: string,
  updates: ProductServiceUpdateInput
): Promise<Record<string, unknown> | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const effective: ProductServiceUpdateInput = { ...updates };
  const costChanging = updates.unitCost !== undefined;
  const marginChanging = updates.defaultMarginPercent !== undefined;
  const annualChanging = updates.unitCostIsAnnual !== undefined;

  // Recompute when cost, markup, or the annual flag is in this request and
  // both cost and markup end up present. A unitPrice-only update keeps the
  // price the client sent. Catalogue cost is ex-GST; priceFromCost divides
  // an annual cost by 12 once before markup.
  if (costChanging || marginChanging || annualChanging) {
    const existing = await db.query<Record<string, unknown>>(
      `SELECT unit_cost, default_margin_percent, unit_cost_is_annual
       FROM products_services
       WHERE id = $1 AND user_id = $2`,
      [productId, userId]
    );
    if (existing.rows.length === 0) {
      return null;
    }
    const row = existing.rows[0];
    const nextCost =
      updates.unitCost !== undefined ? updates.unitCost : (row.unit_cost as number | null);
    const nextMargin =
      updates.defaultMarginPercent !== undefined
        ? finiteMargin(updates.defaultMarginPercent)
        : finiteMargin(row.default_margin_percent);
    const nextAnnual =
      updates.unitCostIsAnnual !== undefined
        ? Boolean(updates.unitCostIsAnnual)
        : Boolean(row.unit_cost_is_annual);
    if (nextCost != null && nextMargin != null) {
      effective.unitPrice = sellCentsForCatalogueCost(nextCost, nextMargin, nextAnnual);
    }
  }

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    unitPrice: 'unit_price',
    unitCost: 'unit_cost',
    unitCostIsAnnual: 'unit_cost_is_annual',
    defaultMarginPercent: 'default_margin_percent',
    type: 'type',
    isGstApplicable: 'is_gst_applicable',
    isActive: 'is_active',
  };

  for (const [key, value] of Object.entries(effective)) {
    if (fieldMap[key] && value !== undefined) {
      fields.push(`${fieldMap[key]} = $${paramIndex++}`);
      values.push(value ?? null);
    }
  }

  if (fields.length === 0) {
    return getProductById(productId, userId);
  }

  fields.push('updated_at = NOW()');
  values.push(productId, userId);

  const result = await db.query<Record<string, unknown>>(
    `UPDATE products_services SET ${fields.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return transformForMobile(transformProduct(result.rows[0]));
}

/**
 * Soft-delete product/service (set is_active = false)
 */
export async function deleteProduct(
  productId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    `UPDATE products_services SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [productId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export default {
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
  deleteProduct,
};
