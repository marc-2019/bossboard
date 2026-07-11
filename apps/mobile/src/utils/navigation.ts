/**
 * Navigation helpers for Expo Router.
 * Always provide a way off a screen — native header back can be missing when
 * canGoBack() is false (deep link, replace, nested stack with one screen).
 */

type GoBackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: any) => void;
};

/** Prefer history back; otherwise land on tabs (never trap the user). */
export function safeGoBack(
  router: GoBackRouter,
  fallback: string = '/(tabs)'
): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // fall through to replace
  }
  router.replace(fallback as any);
}
