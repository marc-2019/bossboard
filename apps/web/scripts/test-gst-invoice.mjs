/**
 * Pure node unit smoke for GST invoice helper (no Next runtime).
 * Run: node apps/web/scripts/test-gst-invoice.mjs
 */
import assert from 'node:assert/strict';

const NZ_GST_RATE = 0.15;

function dollarsToCents(dollars) {
  return Math.round(dollars * 100);
}

function parseDollars(raw) {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function computeGstTotals(lines, includeGst) {
  const subtotalCents = lines.reduce(
    (sum, l) => sum + dollarsToCents(Math.max(0, l.amountDollars || 0)),
    0
  );
  const gstCents = includeGst ? Math.round(subtotalCents * NZ_GST_RATE) : 0;
  return {
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
    includeGst,
  };
}

assert.equal(parseDollars('$12.50'), 12.5);
assert.equal(parseDollars('abc'), 0);
const t = computeGstTotals(
  [
    { description: 'Labour', amountDollars: 100 },
    { description: 'Parts', amountDollars: 50 },
  ],
  true
);
assert.equal(t.subtotalCents, 15000);
assert.equal(t.gstCents, 2250);
assert.equal(t.totalCents, 17250);
const noGst = computeGstTotals([{ description: 'X', amountDollars: 100 }], false);
assert.equal(noGst.gstCents, 0);
assert.equal(noGst.totalCents, 10000);
console.log('test-gst-invoice.mjs: all passed');
