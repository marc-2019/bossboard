/**
 * App Store 14 Aug 2026 rejection (submission 7c7ad928):
 * 2.3.10 — no Google Play in the iOS binary
 * 2.2 — no beta/TestFlight production copy
 * 3.1.2(c) — functional privacy + terms links on the subscription surface
 */
import { describe, it, expect } from '@jest/globals';
import {
  LEGAL_PRIVACY_URL,
  LEGAL_TERMS_URL,
  billingFooterLine,
  purchaseAlertCopy,
  showLaunchFreeBanner,
} from '../subscriptionStoreCopy';

const PLAY = /play\.google|google play|\bplay billing\b|\/ play |\/play /i;
const BETA = /testflight|beta testing|internal testing|during beta/i;

describe('subscriptionStoreCopy iOS (Guideline 2.3.10 / 2.2)', () => {
  it('footer bills through the App Store only — no Play', () => {
    const line = billingFooterLine('ios');
    expect(line).toMatch(/App Store/);
    expect(line).not.toMatch(PLAY);
    expect(line).not.toMatch(BETA);
  });

  it('purchase and restore alerts never mention Play or TestFlight', () => {
    for (const kind of [
      'unavailable',
      'error',
      'restoreNone',
      'restoreUnavailable',
    ] as const) {
      const text = purchaseAlertCopy('ios', kind);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(PLAY);
      expect(text).not.toMatch(BETA);
    }
  });

  it('legal URLs are https Instilligent legal pages', () => {
    expect(LEGAL_PRIVACY_URL).toBe('https://api.instilligent.com/legal/privacy');
    expect(LEGAL_TERMS_URL).toBe('https://api.instilligent.com/legal/terms');
  });

  it('does not show a free-during-launch banner on iOS (Guideline 2.2)', () => {
    expect(showLaunchFreeBanner('ios')).toBe(false);
  });
});

describe('subscriptionStoreCopy android (keep Play Billing copy)', () => {
  it('footer still names Google Play', () => {
    expect(billingFooterLine('android')).toMatch(/Google Play/);
  });
});
