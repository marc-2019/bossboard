/**
 * Integer money helpers for supplier costs and product sell prices.
 * No I/O. GST conversion runs once on the figure the tradie typed.
 */

/** Largest inclusive cent amount whose *40 stays inside Number.MAX_SAFE_INTEGER. */
const MAX_INCLUSIVE_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 40);

export class SupplierCostMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierCostMathError';
  }
}

/**
 * NZ GST 15%: ex-GST cents = floor((inclusive * 40 + 23) / 46).
 * That is inclusive / 1.15, rounded half-up, in integer maths, once.
 */
export function exGstCentsFromInclusive(inclusiveCents: number): number {
  if (!Number.isInteger(inclusiveCents) || inclusiveCents < 0) {
    throw new SupplierCostMathError('Cost must be a non-negative integer number of cents');
  }
  if (inclusiveCents > MAX_INCLUSIVE_CENTS) {
    throw new SupplierCostMathError('Cost is too large');
  }
  return Math.floor((inclusiveCents * 40 + 23) / 46);
}

/**
 * Sell cents = cost * (1 + marginPercent/100), rounded half-up.
 * marginPercent may have two decimal places (NUMERIC(7,2)).
 * price = cost * (10000 + round(marginPercent * 100)) / 10000.
 */
export function sellCentsFromCostAndMargin(
  costCents: number,
  marginPercent: number,
): number {
  if (!Number.isInteger(costCents) || costCents < 0) {
    throw new SupplierCostMathError('Cost must be a non-negative integer number of cents');
  }
  if (!Number.isFinite(marginPercent)) {
    throw new SupplierCostMathError('Margin percent must be a finite number');
  }
  const marginHundredths = Math.round(marginPercent * 100);
  const factor = 10000 + marginHundredths;
  const numerator = costCents * factor;
  if (!Number.isSafeInteger(numerator)) {
    throw new SupplierCostMathError('Sell price is too large');
  }
  const divisor = 10000;
  // Half-up for a non-negative numerator. A negative factor (negative margin)
  // still divides toward the correct half-up result via the sign of the sum.
  if (numerator >= 0) {
    return Math.floor((numerator + divisor / 2) / divisor);
  }
  return -Math.floor((-numerator + divisor / 2) / divisor);
}
