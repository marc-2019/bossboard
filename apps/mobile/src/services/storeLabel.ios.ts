/** iOS-only module — must not mention other app stores (Guideline 2.3.10). */

export function billingStoreLabel(): string {
  return 'the App Store';
}

export function restoreUnavailableMessage(): string {
  return 'Restore Purchases works on App Store builds only.';
}

export function noRestoreFoundMessage(): string {
  return 'No previous BossBoard subscription was found for this Apple ID.';
}
