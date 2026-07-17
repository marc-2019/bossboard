import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE, API_URL, REFRESH_TOKEN_COOKIE } from './constants';

/** Set auth tokens as httpOnly cookies (server-side only) */
export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/** True when access JWT is missing exp or past exp (with skew). */
function isAccessTokenExpired(token: string, skewSeconds = 30): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return true;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

/**
 * Exchange refresh cookie for a new access token and rotate cookies.
 * Clears auth cookies on refresh failure.
 */
async function tryRefreshAccessToken(): Promise<string | undefined> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return undefined;

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
 * Get a usable access token for BFF/server routes.
 * - Returns cookie access token when present and not expired.
 * - If missing or expired, silently refreshes via the 7-day refresh cookie.
 * This is the shared session helper used by invoices and other API proxies
 * so users do not see "No session" after the 15-minute access TTL.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (existing && !isAccessTokenExpired(existing)) {
    return existing;
  }
  // Missing or expired access token — try refresh before failing.
  const refreshed = await tryRefreshAccessToken();
  if (refreshed) return refreshed;
  // If refresh failed but a non-parseable token remains, return it and let API 401.
  return existing;
}

/**
 * Shared session shape for route handlers / middleware helpers.
 * null when neither access nor refresh can establish a session.
 */
export async function getSession(): Promise<{ accessToken: string } | null> {
  const accessToken = await getAccessToken();
  return accessToken ? { accessToken } : null;
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
