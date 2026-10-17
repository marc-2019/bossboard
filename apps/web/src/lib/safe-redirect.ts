/** Resolve only root-relative, same-origin navigation targets. */
export function safeRedirect(target: string | null | undefined, base = 'https://local.invalid'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || /[\\\x00-\x20\x7f]/.test(target)) return '/dashboard';
  try {
    // Reject encoded separators/control characters as well as their literal forms.
    const decoded = decodeURIComponent(target);
    if (decoded.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(decoded)) return '/dashboard';
    const origin = new URL(base).origin;
    const url = new URL(target, origin);
    if (url.origin !== origin || url.pathname.startsWith('//')) return '/dashboard';
    return url.pathname + url.search + url.hash;
  } catch { return '/dashboard'; }
}
