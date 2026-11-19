/**
 * Golden cases for priceFromCost. Expected cents are written out, not
 * computed by a second copy of the formula.
 *
 * MUST-FAIL: annual priced as per-unit (the 12× bug) and GST removed twice.
 */

import fs from 'fs';
import path from 'path';
import { priceFromCost, type PriceFromCostInput } from '../../services/pricing';

interface GoldenCase extends PriceFromCostInput {
  name: string;
  exGstSellCents: number;
  gstCents: number;
}

const golden: GoldenCase[] = [
  {
    name: '$1,200/yr at 20% is 12000 cents',
    costCents: 120000,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 20,
    exGstSellCents: 12000,
    gstCents: 1800,
  },
  {
    name: '11500 inclusive is 10000 ex-GST',
    costCents: 11500,
    gstTreatment: 'inclusive',
    unitBasis: 'per_unit',
    markupPercent: 0,
    exGstSellCents: 10000,
    gstCents: 1500,
  },
  {
    name: '11500 inclusive at 20% is 12000',
    costCents: 11500,
    gstTreatment: 'inclusive',
    unitBasis: 'per_unit',
    markupPercent: 20,
    exGstSellCents: 12000,
    gstCents: 1800,
  },
  {
    name: 'zero cost stays zero',
    costCents: 0,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 20,
    exGstSellCents: 0,
    gstCents: 0,
  },
  {
    name: 'zero annual cost at 1000% stays zero',
    costCents: 0,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 1000,
    exGstSellCents: 0,
    gstCents: 0,
  },
  {
    name: '0% markup keeps the ex-GST cost',
    costCents: 12345,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 0,
    exGstSellCents: 12345,
    gstCents: 1852,
  },
  {
    name: '1000% markup is 11 times the cost',
    costCents: 100,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 1000,
    exGstSellCents: 1100,
    gstCents: 165,
  },
  {
    name: '1 cent at 50% rounds half a cent up to 2',
    costCents: 1,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 50,
    exGstSellCents: 2,
    gstCents: 0,
  },
  {
    name: '10 cents at 5% rounds half a cent up to 11',
    costCents: 10,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 5,
    exGstSellCents: 11,
    gstCents: 2,
  },
  {
    name: '200 cents at 0.25% rounds half a cent up to 201',
    costCents: 200,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 0.25,
    exGstSellCents: 201,
    gstCents: 30,
  },
  {
    name: '50 cents at 15% is 58, the integer half-up',
    costCents: 50,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 15,
    exGstSellCents: 58,
    gstCents: 9,
  },
  {
    name: 'monthly basis does not divide by 12',
    costCents: 120000,
    gstTreatment: 'exclusive',
    unitBasis: 'monthly',
    markupPercent: 20,
    exGstSellCents: 144000,
    gstCents: 21600,
  },
  {
    name: '6 annual cents round half up to 1',
    costCents: 6,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 0,
    exGstSellCents: 1,
    gstCents: 0,
  },
  {
    name: '5 annual cents round down to 0',
    costCents: 5,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 0,
    exGstSellCents: 0,
    gstCents: 0,
  },
  {
    name: '7 annual cents round up to 1',
    costCents: 7,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 0,
    exGstSellCents: 1,
    gstCents: 0,
  },
  {
    name: '100 annual cents at 20% divide then mark up to 10',
    costCents: 100,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 20,
    exGstSellCents: 10,
    gstCents: 2,
  },
  {
    name: '10 annual cents at 50% divide before markup (2, not 1)',
    costCents: 10,
    gstTreatment: 'exclusive',
    unitBasis: 'annual',
    markupPercent: 50,
    exGstSellCents: 2,
    gstCents: 0,
  },
  {
    name: '115 inclusive annual strips GST before dividing (8, not 9)',
    costCents: 115,
    gstTreatment: 'inclusive',
    unitBasis: 'annual',
    markupPercent: 0,
    exGstSellCents: 8,
    gstCents: 1,
  },
  {
    name: '2 inclusive cents round half-up to 2, not truncate to 1',
    costCents: 2,
    gstTreatment: 'inclusive',
    unitBasis: 'per_unit',
    markupPercent: 0,
    exGstSellCents: 2,
    gstCents: 0,
  },
  {
    name: '10000 at 30% is 13000',
    costCents: 10000,
    gstTreatment: 'exclusive',
    unitBasis: 'per_unit',
    markupPercent: 30,
    exGstSellCents: 13000,
    gstCents: 1950,
  },
  {
    name: '1 inclusive cent rounds up to 1 ex-GST',
    costCents: 1,
    gstTreatment: 'inclusive',
    unitBasis: 'per_unit',
    markupPercent: 0,
    exGstSellCents: 1,
    gstCents: 0,
  },
];

describe('priceFromCost golden cases', () => {
  it.each(golden)('$name', (row) => {
    expect(
      priceFromCost({
        costCents: row.costCents,
        gstTreatment: row.gstTreatment,
        unitBasis: row.unitBasis,
        markupPercent: row.markupPercent,
      }),
    ).toEqual({
      exGstSellCents: row.exGstSellCents,
      gstCents: row.gstCents,
    });
  });
});

describe('priceFromCost MUST-FAIL guards', () => {
  it('does not price an annual cost as if it were per unit (the 12× bug)', () => {
    const priced = priceFromCost({
      costCents: 120000,
      gstTreatment: 'exclusive',
      unitBasis: 'annual',
      markupPercent: 20,
    });
    expect(priced.exGstSellCents).toBe(12000);
    expect(priced.exGstSellCents).not.toBe(144000);
  });

  it('removes GST once, so 11500 inclusive stays 10000 and not 8696', () => {
    const priced = priceFromCost({
      costCents: 11500,
      gstTreatment: 'inclusive',
      unitBasis: 'per_unit',
      markupPercent: 0,
    });
    expect(priced.exGstSellCents).toBe(10000);
    expect(priced.exGstSellCents).not.toBe(8696);
  });
});

describe('pricing module boundaries', () => {
  const pricingSource = fs.readFileSync(
    path.resolve(__dirname, '../../services/pricing.ts'),
    'utf8',
  );

  it('does not call a model, the clock, randomness, or the network', () => {
    expect(pricingSource).not.toMatch(/\bfetch\s*\(/);
    expect(pricingSource).not.toMatch(/anthropic|openai|claude|spark_infer/i);
    expect(pricingSource).not.toMatch(/Math\.random|Date\.now|new Date/);
    expect(pricingSource).not.toMatch(/from 'node:(http|https|net|fs)'/);
  });

  it('is the only server copy of the cent formula', () => {
    const wrapper = fs.readFileSync(
      path.resolve(__dirname, '../../services/supplier-cost-math.ts'),
      'utf8',
    );
    const products = fs.readFileSync(
      path.resolve(__dirname, '../../services/products.ts'),
      'utf8',
    );
    const suppliers = fs.readFileSync(
      path.resolve(__dirname, '../../services/product-suppliers.ts'),
      'utf8',
    );
    for (const source of [wrapper, products, suppliers]) {
      expect(source).not.toMatch(/\* 40/);
      expect(source).not.toMatch(/\/ 46/);
      expect(source).not.toMatch(/\/ 1\.15/);
    }
    expect(products).toMatch(/priceFromCost\(/);
    expect(suppliers).toMatch(/priceFromCost\(/);
    expect(wrapper).toMatch(/priceFromCost\(/);
  });
});
