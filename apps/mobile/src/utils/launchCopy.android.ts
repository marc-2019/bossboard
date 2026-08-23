export const showLaunchFreeBanner = true;
export const launchBannerTitle = 'Launch Pricing';
export const launchBannerSubtitle =
  'All features are completely free during our launch period!';

export function betaChannelAlert(): { title: string; message: string } {
  return {
    title: 'Launch Pricing',
    message: 'All features are free during our launch period.',
  };
}
