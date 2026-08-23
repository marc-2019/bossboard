/** Default / iOS / web billing line. Android overrides this file. */
export function billingFooterLine(_os?: string): string {
  return 'Subscriptions are billed through the App Store.';
}
