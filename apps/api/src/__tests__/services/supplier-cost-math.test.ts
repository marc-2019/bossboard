/**
 * Integer GST and sell-price rounding.
 * ex-GST = floor((inclusive * 40 + 23) / 46), once.
 * Sell = cost * (1 + margin/100), half-up to cents.
 */

import {
  exGstCentsFromInclusive,
  sellCentsFromCostAndMargin,
} from '../../services/supplier-cost-math';

/** Independent half-up of inclusive cents / 1.15 = inclusive * 20 / 23. */
function referenceExGst(inclusiveCents: number): number {
  const numerator = inclusiveCents * 20;
  const quotient = Math.floor(numerator / 23);
  const remainder = numerator % 23;
  return remainder * 2 >= 23 ? quotient + 1 : quotient;
}

describe('exGstCentsFromInclusive', () => {
  it('stores 11500 inclusive cents as 10000 ex-GST', () => {
    expect(exGstCentsFromInclusive(11500)).toBe(10000);
  });

  it('matches half-up of inclusive/1.15 for edges and a large value', () => {
    const samples = [0, 1, 2, 3, 22, 23, 24, 46, 99, 100, 114, 115, 116, 11500, 999999];
    for (const cents of samples) {
      expect(exGstCentsFromInclusive(cents)).toBe(referenceExGst(cents));
    }
    for (let cents = 0; cents <= 5000; cents += 1) {
      expect(exGstCentsFromInclusive(cents)).toBe(referenceExGst(cents));
    }
  });

  it('rounds a 1 cent inclusive price up to 1 ex-GST cent', () => {
    expect(exGstCentsFromInclusive(1)).toBe(1);
    expect(referenceExGst(1)).toBe(1);
  });

  it('does not use the already-rounded ex-GST figure as a new inclusive input', () => {
    const once = exGstCentsFromInclusive(11500);
    expect(once).toBe(10000);
    expect(exGstCentsFromInclusive(once)).toBe(8696);
    expect(once).not.toBe(8696);
  });
});

describe('sellCentsFromCostAndMargin', () => {
  it('rounds a half cent up (1 cent at 50%)', () => {
    expect(sellCentsFromCostAndMargin(1, 50)).toBe(2);
  });

  it('rounds a 0.5 cent edge up (10 cents at 5%, and 200 cents at 0.25%)', () => {
    expect(sellCentsFromCostAndMargin(10, 5)).toBe(11);
    expect(sellCentsFromCostAndMargin(200, 0.25)).toBe(201);
  });

  it('keeps an exact sell price (10000 cents at 30%)', () => {
    expect(sellCentsFromCostAndMargin(10000, 30)).toBe(13000);
  });

  it('rounds a large value half-up', () => {
    expect(sellCentsFromCostAndMargin(1_000_000_000, 15)).toBe(1_150_000_000);
  });

  it('returns the cost when the margin is 0', () => {
    expect(sellCentsFromCostAndMargin(12345, 0)).toBe(12345);
  });
});
