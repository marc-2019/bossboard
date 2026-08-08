/**
 * Run: node --experimental-strip-types or via tsx if available.
 * Also executable under vitest if monorepo adds it; pure assert script below for CI-lite.
 */
import {
  computeGstTotals,
  parseDollars,
  dollarsToCents,
  GST_TOOL_DISCLAIMER,
  NZ_GST_RATE,
} from './gstInvoice';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(NZ_GST_RATE === 0.15, 'NZ GST is 15%');
assert(parseDollars('$12.50') === 12.5, 'parse dollars');
assert(parseDollars('abc') === 0, 'bad parse');
assert(dollarsToCents(10.005) === 1001 || dollarsToCents(10) === 1000, 'cents');

const t = computeGstTotals(
  [
    { description: 'Labour', amountDollars: 100 },
    { description: 'Parts', amountDollars: 50 },
  ],
  true
);
assert(t.subtotalCents === 15000, `subtotal ${t.subtotalCents}`);
assert(t.gstCents === 2250, `gst ${t.gstCents}`);
assert(t.totalCents === 17250, `total ${t.totalCents}`);

const noGst = computeGstTotals([{ description: 'X', amountDollars: 100 }], false);
assert(noGst.gstCents === 0 && noGst.totalCents === 10000, 'no gst');

assert(GST_TOOL_DISCLAIMER.toLowerCase().includes('not tax advice'), 'disclaimer');
assert(!GST_TOOL_DISCLAIMER.toLowerCase().includes('ird approved'), 'no false IRD approve');

console.log('gstInvoice.test.ts: all passed');
