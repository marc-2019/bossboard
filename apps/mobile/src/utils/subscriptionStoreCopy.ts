/**
 * Platform-specific subscription copy for store review.
 * iOS binary must not mention other-store billing (Guideline 2.3.10) or
 * beta/TestFlight as a production path (Guideline 2.2).
 */

export const LEGAL_PRIVACY_URL = 'https://api.instilligent.com/legal/privacy';
export const LEGAL_TERMS_URL = 'https://api.instilligent.com/legal/terms';

export type StoreOs = 'ios' | 'android' | 'web' | string;
export type PurchaseAlertKind =
  | 'unavailable'
  | 'error'
  | 'restoreNone'
  | 'restoreUnavailable';

export { billingFooterLine } from './billingFooter';
export {
  showLaunchFreeBanner,
  launchBannerTitle,
  launchBannerSubtitle,
  betaChannelAlert,
} from './launchCopy';

export function purchaseAlertCopy(os: StoreOs, kind: PurchaseAlertKind): string {
  if (os === 'ios') {
    switch (kind) {
      case 'unavailable':
        return 'In-app purchases are not available in this build. Restore purchases if you already subscribed, or try again from an App Store build.';
      case 'error':
        return 'Could not complete the App Store purchase. Check your connection, try Restore Purchases, or contact support.';
      case 'restoreNone':
        return 'No previous BossBoard subscription was found for this Apple ID.';
      case 'restoreUnavailable':
        return 'Restore Purchases works on App Store builds only.';
    }
  }
  switch (kind) {
    case 'unavailable':
      return 'In-app purchases are not available in this build. Restore purchases if you already subscribed.';
    case 'error':
      return 'Could not complete the store purchase. Check your connection, try Restore Purchases, or contact support.';
    case 'restoreNone':
      return 'No previous BossBoard subscription was found for this store account.';
    case 'restoreUnavailable':
      return 'Restore Purchases works on store builds only.';
  }
}
