/**
 * The only server-side cost → sell-price calculation.
 *
 * Pure: no I/O, no clock, no randomness, no model call.
 * Money is integer cents. The markup percent is turned into integer
 * hundredths once. After that every step is integer half-up division.
 *
 * Order, each step at most once:
 * 1. GST. Inclusive cents become ex-GST with floor((cents * 40 + 23) / 46),
 *    which is cents / 1.15 rounded half-up. Exclusive cents are already ex-GST.
 * 2. Unit basis. Annual: floor((exGstCost + 6) / 12), half-up once.
 *    Per unit and monthly: the ex-GST cost is unchanged. Monthly is not a year.
 * 3. Markup. floor((attributed * (10000 + markupHundredths) + 5000) / 10000),
 *    half-up once. This matches the web rule round(cost / 12) then markup.
 * 4. GST on that sell price, for callers that need it:
 *    floor((exGstSell * 15 + 50) / 100). It is not added into the sell price.
 *    Catalogue unit_price is the ex-GST sell price. Invoice GST stays separate.
 */

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

export type GstTreatment = 'inclusive' | 'exclusive';
export type UnitBasis = 'per_unit' | 'annual' | 'monthly';

export interface PriceFromCostInput {
  costCents: number;
  gstTreatment: GstTreatment;
  unitBasis: UnitBasis;
  /** Markup percent. 20 means 20%. Two decimal places, matching NUMERIC(7,2). */
  markupPercent: number;
}

export interface PriceFromCostResult {
  /** Ex-GST sell price in cents. This is the catalogue unit_price. */
  exGstSellCents: number;
  /** 15% GST on the ex-GST sell price, half-up, in cents. Not part of unit_price. */
  gstCents: number;
}

function divHalfUp(numerator: number, divisor: number): number {
  if (!Number.isSafeInteger(numerator) || divisor <= 0) {
    throw new PricingError('That sell price is too large to save.');
  }
  const half = Math.floor(divisor / 2);
  if (numerator >= 0) {
    return Math.floor((numerator + half) / divisor);
  }
  return -Math.floor((-numerator + half) / divisor);
}

function mulSafe(left: number, right: number, tooLarge: string): number {
  const product = left * right;
  if (!Number.isSafeInteger(product)) {
    throw new PricingError(tooLarge);
  }
  return product;
}

/**
 * Percent is not money. Convert once to integer hundredths (20 → 2000, 0.25 → 25).
 * toFixed(2) is the NUMERIC(7,2) scale. The cent maths below does not use it.
 */
function markupHundredths(markupPercent: number): number {
  if (typeof markupPercent !== 'number' || !Number.isFinite(markupPercent)) {
    throw new PricingError('Enter a markup percent.');
  }
  const negative = markupPercent < 0;
  const text = Math.abs(markupPercent).toFixed(2);
  if (!/^\d+\.\d{2}$/.test(text)) {
    throw new PricingError('Enter a markup percent.');
  }
  const [whole, frac] = text.split('.');
  const hundredths = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(hundredths)) {
    throw new PricingError('Enter a markup percent.');
  }
  return negative ? -hundredths : hundredths;
}

function assertCostCents(costCents: number): void {
  if (!Number.isInteger(costCents) || costCents < 0) {
    throw new PricingError('Enter the cost in whole cents, zero or more.');
  }
}

export function priceFromCost(input: PriceFromCostInput): PriceFromCostResult {
  assertCostCents(input.costCents);
  if (input.gstTreatment !== 'inclusive' && input.gstTreatment !== 'exclusive') {
    throw new PricingError('Tick whether the price includes GST.');
  }
  if (
    input.unitBasis !== 'per_unit' &&
    input.unitBasis !== 'annual' &&
    input.unitBasis !== 'monthly'
  ) {
    throw new PricingError('Say whether this cost is per unit, a month, or a year.');
  }

  const exGstCostCents =
    input.gstTreatment === 'inclusive'
      ? divHalfUp(mulSafe(input.costCents, 40, 'That cost is too large to save.'), 46)
      : input.costCents;

  const attributedCostCents =
    input.unitBasis === 'annual' ? divHalfUp(exGstCostCents, 12) : exGstCostCents;

  const factor = 10000 + markupHundredths(input.markupPercent);
  const exGstSellCents = divHalfUp(
    mulSafe(attributedCostCents, factor, 'That sell price is too large to save.'),
    10000,
  );
  if (exGstSellCents < 0) {
    throw new PricingError('That sell price is too large to save.');
  }
  const gstCents = divHalfUp(mulSafe(exGstSellCents, 15, 'That sell price is too large to save.'), 100);

  return { exGstSellCents, gstCents };
}
