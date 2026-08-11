/**
 * Shared helpers for web BFF auth routes that proxy to the Express API.
 * Forwards client IP so API rate limits bind to the browser, not the web pod.
 */

import type { NextRequest } from 'next/server';

/** Headers for proxying unauthenticated auth calls to the API. */
export function proxyAuthHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Preserve real client IP for express-rate-limit (trust proxy on API)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  // NextRequest.ip is available on some runtimes (not always)
  const fallbackIp =
    (request as NextRequest & { ip?: string }).ip ||
    request.headers.get('cf-connecting-ip') ||
    undefined;

  if (forwarded) {
    headers['X-Forwarded-For'] = forwarded;
  } else if (realIp) {
    headers['X-Forwarded-For'] = realIp;
  } else if (fallbackIp) {
    headers['X-Forwarded-For'] = fallbackIp;
  }

  if (realIp) {
    headers['X-Real-IP'] = realIp;
  } else if (fallbackIp) {
    headers['X-Real-IP'] = fallbackIp;
  }

  return headers;
}

/**
 * Cookie Secure flag: production NODE_ENV, or request arrived over HTTPS
 * (Railway/Cloudflare terminate TLS and set X-Forwarded-Proto).
 */
export function shouldUseSecureCookies(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'https') return true;
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
