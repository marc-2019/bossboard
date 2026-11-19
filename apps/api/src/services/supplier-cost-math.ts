/**
 * Back-compat names for the single pricing function in ./pricing.ts.
 * These do not contain a second copy of the formula.
 */

import { priceFromCost } from './pricing.js';

export { PricingError as SupplierCostMathError } from './pricing.js';

/** Inclusive cents → ex-GST cents. 0% markup, per unit, so the sell price is the ex-GST cost. */
export function exGstCentsFromInclusive(inclusiveCents: number): number {
  return priceFromCost({
    costCents: inclusiveCents,
    gstTreatment: 'inclusive',
    unitBasis: 'per_unit',
    markupPercent: 0,
  }).exGstSellCents;
}

/** Ex-GST per-unit cost → sell cents. GST is not removed again. */
export function sellCentsFromCostAndMargin(costCents: number, marginPercent: number): number {
  return priceFromCost({
    costCents,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: marginPercent,
  }).exGstSellCents;
}
