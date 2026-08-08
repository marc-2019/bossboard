import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, API_URL } from './constants';

/** Set auth tokens as httpOnly cookies (server-side only) */
export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 minutes — matches API access JWT
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/** Decode JWT exp without verifying signature (cookie presence only). */
function isJwtExpiredOrExpiringSoon(token: string, skewSec = 60): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return true;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewSec * 1000;
  } catch {
    return true;
  }
}

async function refreshAccessToken(refreshToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { tokens?: { accessToken?: string; refreshToken?: string } };
    };
    if (!res.ok || !json.success || !json.data?.tokens?.accessToken) {
      await clearAuthCookies();
      return undefined;
    }
    const accessToken = json.data.tokens.accessToken;
    const newRefresh = json.data.tokens.refreshToken || refreshToken;
    await setAuthCookies(accessToken, newRefresh);
    return accessToken;
  } catch {
    return undefined;
  }
}

/**
 * Get a valid access token for BFF proxy routes.
 * If the short-lived access cookie is missing or expired, rotate via refresh cookie
 * so idle users (e.g. filling a long form) do not hit "No session" on save.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const access = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (access && !isJwtExpiredOrExpiringSoon(access)) {
    return access;
  }

  const refresh = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refresh) {
    return undefined;
  }

  return refreshAccessToken(refresh);
}

/** Get the refresh token from cookies (server-side only) */
export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
}

/** Clear auth cookies (server-side only) */
export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}
