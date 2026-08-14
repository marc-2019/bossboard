/** Web / default. Native builds use storeLabel.ios.ts / storeLabel.android.ts. */

export function billingStoreLabel(): string {
  return 'your payment provider';
}

export function restoreUnavailableMessage(): string {
  return 'Restore Purchases is only available in the store app.';
}

export function noRestoreFoundMessage(): string {
  return 'No previous BossBoard subscription was found.';
}
