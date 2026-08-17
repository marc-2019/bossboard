/**
 * Navigation helpers for Expo Router.
 * Always provide a way off a screen — native header back can be missing when
 * canGoBack() is false (deep link, replace, nested stack with one screen).
 *
 * Nested stacks can report canGoBack() true while back() is a no-op. For a
 * control that must land on Home, use goHome or safeGoBack(..., { forceFallback: true }).
 */

type GoBackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: any) => void;
};

/** Always land on Home. Use when the control says Home, not Back. */
export function goHome(
  router: Pick<GoBackRouter, 'replace'>,
  href: string = '/(tabs)'
): void {
  router.replace(href as any);
}

/** Prefer history back; otherwise land on tabs (never trap the user). */
export function safeGoBack(
  router: GoBackRouter,
  fallback: string = '/(tabs)',
  opts?: { forceFallback?: boolean }
): void {
  if (!opts?.forceFallback) {
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      // fall through to replace
    }
  }
  router.replace(fallback as any);
}
