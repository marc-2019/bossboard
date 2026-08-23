/** Default / iOS — no launch-free production copy. Android overrides this file. */
export const showLaunchFreeBanner = false;
export const launchBannerTitle = '';
export const launchBannerSubtitle = '';

export function betaChannelAlert(): { title: string; message: string } {
  return {
    title: 'Subscription',
    message:
      'Paid plans are billed through the App Store. Try Restore Purchases if you already subscribed.',
  };
}
