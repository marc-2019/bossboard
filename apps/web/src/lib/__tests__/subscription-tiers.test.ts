/**
 * Unit tests for the pure tier-display logic.
 *
 * Run with: npm run test:unit (uses Node's built-in test runner — Node 22.18+
 * executes TypeScript directly via type stripping, so no extra test deps).
 * The module under test is deliberately free of React/Next imports.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierName,
  tierRank,
  formatPricing,
  featureLines,
  buildTierDisplays,
  usagePercent,
  isBetaCheckout,
  isBetaPortal,
  type TiersPayload,
} from '../subscription-tiers.ts';
import type { TierLimits } from '@bossboard/shared';

// Fixtures mirror the API's TIER_LIMITS (apps/api/src/services/subscriptions.ts)
// and the /subscriptions/tiers pricing block. Tests assert derivation logic,
// not these specific business numbers.
const FREE: TierLimits = {
  tier: 'free',
  invoicesPerMonth: 3,
  swmsPerMonth: 2,
  aiCallsPerMonth: 5,
  teamMembers: null,
  pdfExport: false,
  emailInvoice: false,
  quotes: false,
  expenses: false,
  jobLogs: false,
  photos: false,
};

const TRADIE: TierLimits = {
  tier: 'tradie',
  invoicesPerMonth: null,
  swmsPerMonth: null,
  aiCallsPerMonth: 50,
  teamMembers: null,
  pdfExport: true,
  emailInvoice: true,
  quotes: true,
  expenses: true,
  jobLogs: true,
  photos: true,
};

const TEAM: TierLimits = {
  tier: 'team',
  invoicesPerMonth: null,
  swmsPerMonth: null,
  aiCallsPerMonth: 200,
  teamMembers: 5,
  pdfExport: true,
  emailInvoice: true,
  quotes: true,
  expenses: true,
  jobLogs: true,
  photos: true,
};

const PAYLOAD: TiersPayload = {
  tiers: [FREE, TRADIE, TEAM],
  betaMode: true,
  pricing: {
    free: { price: 0, period: 'forever' },
    tradie: { price: 4.99, period: 'week', monthlyEquivalent: 19.99, currency: 'NZD' },
    team: { price: 9.99, period: 'week', monthlyEquivalent: 39.99, currency: 'NZD' },
  },
};

describe('tierName / tierRank', () => {
  test('capitalizes tier slugs', () => {
    assert.equal(tierName('free'), 'Free');
    assert.equal(tierName('tradie'), 'Tradie');
    assert.equal(tierName('team'), 'Team');
  });

  test('ranks tiers in upgrade order', () => {
    assert.ok(tierRank('free') < tierRank('tradie'));
    assert.ok(tierRank('tradie') < tierRank('team'));
  });
});

describe('formatPricing', () => {
  test('free tier never renders the recalled "forever" qualifier', () => {
    // "Free forever" was recalled 2026-05-11 (marketing-truths.json Rule G);
    // the API period 'forever' maps to the approved "to get started" copy.
    const r = formatPricing({ price: 0, period: 'forever' });
    assert.equal(r.priceLabel, '$0');
    assert.equal(r.periodLabel, 'to get started');
    assert.equal(r.monthlyLabel, null);
  });

  test('formats a weekly price with monthly equivalent', () => {
    const r = formatPricing({
      price: 4.99,
      period: 'week',
      monthlyEquivalent: 19.99,
      currency: 'NZD',
    });
    assert.equal(r.priceLabel, '$4.99');
    assert.equal(r.periodLabel, 'per week');
    assert.equal(r.monthlyLabel, '~$19.99/month');
  });

  test('follows whatever price the API returns (no hardcoding)', () => {
    const r = formatPricing({ price: 5.49, period: 'week', monthlyEquivalent: 21.99 });
    assert.equal(r.priceLabel, '$5.49');
    assert.equal(r.monthlyLabel, '~$21.99/month');
  });

  test('renders an honest placeholder when pricing is missing', () => {
    const r = formatPricing(undefined);
    assert.equal(r.priceLabel, '—');
    assert.equal(r.monthlyLabel, null);
  });
});

describe('featureLines', () => {
  test('free tier: numeric limits, no gated features, single user', () => {
    const lines = featureLines(FREE);
    assert.ok(lines.includes('3 invoices / month'));
    assert.ok(lines.includes('2 SWMS / month'));
    assert.ok(lines.includes('5 AI calls / month'));
    assert.ok(lines.includes('Single user'));
    // Gated features must NOT be claimed for free
    assert.ok(!lines.some((l) => l.includes('PDF')));
    assert.ok(!lines.some((l) => l.includes('Quotes')));
    assert.ok(!lines.some((l) => l.includes('Email')));
  });

  test('tradie tier: unlimited invoices/SWMS, all solo features, single user', () => {
    const lines = featureLines(TRADIE);
    assert.ok(lines.includes('Unlimited invoices'));
    assert.ok(lines.includes('Unlimited SWMS'));
    assert.ok(lines.includes('50 AI calls / month'));
    assert.ok(lines.includes('PDF export'));
    assert.ok(lines.includes('Email invoices'));
    assert.ok(lines.includes('Quotes & estimates'));
    assert.ok(lines.includes('Expense tracking'));
    assert.ok(lines.includes('Job logs & time tracking'));
    assert.ok(lines.includes('Photo attachments'));
    assert.ok(lines.includes('Single user'));
  });

  test('team tier: team member limit rendered from the limits object', () => {
    const lines = featureLines(TEAM);
    assert.ok(lines.includes('Up to 5 team members'));
    assert.ok(!lines.includes('Single user'));
  });

  test('derives from input, not fixtures: changed limits change output', () => {
    const lines = featureLines({ ...TEAM, teamMembers: 10, aiCallsPerMonth: null });
    assert.ok(lines.includes('Up to 10 team members'));
    assert.ok(lines.includes('Unlimited AI calls'));
  });
});

describe('buildTierDisplays', () => {
  test('orders free → tradie → team regardless of payload order', () => {
    const shuffled: TiersPayload = { ...PAYLOAD, tiers: [TEAM, FREE, TRADIE] };
    const displays = buildTierDisplays(shuffled);
    assert.deepEqual(
      displays.map((d) => d.tier),
      ['free', 'tradie', 'team'],
    );
  });

  test('marks paid tiers from pricing (price > 0), not from tier name', () => {
    const displays = buildTierDisplays(PAYLOAD);
    assert.deepEqual(
      displays.map((d) => d.isPaid),
      [false, true, true],
    );
  });

  test('carries price labels through from the pricing block', () => {
    const displays = buildTierDisplays(PAYLOAD);
    const tradie = displays.find((d) => d.tier === 'tradie')!;
    assert.equal(tradie.priceLabel, '$4.99');
    assert.equal(tradie.monthlyLabel, '~$19.99/month');
    assert.equal(tradie.name, 'Tradie');
  });
});

describe('usagePercent', () => {
  test('null for unlimited (null) limits', () => {
    assert.equal(usagePercent(10, null), null);
  });
  test('null for zero limit (nothing to meter)', () => {
    assert.equal(usagePercent(0, 0), null);
  });
  test('computes and rounds a normal percentage', () => {
    assert.equal(usagePercent(1, 3), 33);
    assert.equal(usagePercent(2, 3), 67);
  });
  test('caps at 100', () => {
    assert.equal(usagePercent(7, 3), 100);
  });
});

describe('checkout/portal response discriminators', () => {
  test('isBetaCheckout distinguishes beta short-circuit from a session', () => {
    assert.equal(isBetaCheckout({ betaMode: true, message: 'free during beta' }), true);
    assert.equal(
      isBetaCheckout({ sessionId: 'cs_123', url: 'https://checkout.stripe.com/x' }),
      false,
    );
  });

  test('isBetaPortal distinguishes beta short-circuit from a portal URL', () => {
    assert.equal(isBetaPortal({ betaMode: true, message: 'after beta' }), true);
    assert.equal(isBetaPortal({ url: 'https://billing.stripe.com/x' }), false);
  });
});
