/**
 * Navigation helpers for Expo Router.
 * Always provide a way off a screen — native header back can be missing when
 * canGoBack() is false (deep link, replace, nested stack with one screen).
 *
 * Nested stacks can report canGoBack() true while back() is a no-op. For a
 * control that must land on Home, use goHome or safeGoBack(..., { forceFallback: true }).
 *
 * Device 2026-08-17: replace('/(tabs)') from Job Logs left the app (SpringBoard).
 * Prefer navigate, then dismissTo. replace is last resort.
 */

type HomeRouter = {
  canGoBack?: () => boolean;
  back?: () => void;
  replace: (href: any) => void;
  navigate?: (href: any) => void;
  dismissTo?: (href: any) => void;
};

/** Always land on Home. Use when the control says Home, not Back. */
export function goHome(
  router: HomeRouter,
  href: string = '/(tabs)'
): void {
  try {
    if (typeof router.navigate === 'function') {
      router.navigate(href as any);
      return;
    }
  } catch {
    // fall through
  }
  try {
    if (typeof router.dismissTo === 'function') {
      router.dismissTo(href as any);
      return;
    }
  } catch {
    // fall through
  }
  router.replace(href as any);
}

/** Prefer history back; otherwise land on tabs (never trap the user). */
export function safeGoBack(
  router: HomeRouter & { canGoBack: () => boolean; back: () => void },
  fallback: string = '/(tabs)',
  opts?: { forceFallback?: boolean }
): void {
  if (opts?.forceFallback) {
    goHome(router, fallback);
    return;
  }
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // fall through
  }
  goHome(router, fallback);
}
