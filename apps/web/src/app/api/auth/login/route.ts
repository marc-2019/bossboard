import { NextRequest, NextResponse } from 'next/server';
import { API_URL, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/constants';

/**
 * Set auth cookies on the response object (reliable with Cloudflare + Next 15).
 * Prefer this over cookies().set() alone so Set-Cookie always reaches the browser.
 */
function attachAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      return NextResponse.json(json, { status: res.status });
    }

    const tokens = json.data?.tokens;
    const accessToken = tokens?.accessToken as string | undefined;
    const refreshToken = tokens?.refreshToken as string | undefined;
    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'AUTH_RESPONSE_INVALID',
          message: 'Login succeeded but tokens were missing. Please try again.',
        },
        { status: 502 },
      );
    }

    // Return user data (tokens only in httpOnly cookies)
    const response = NextResponse.json({
      success: true,
      data: { user: json.data.user },
    });
    return attachAuthCookies(response, accessToken, refreshToken);
  } catch (err) {
    console.error('[auth/login] proxy error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to connect to API' },
      { status: 502 },
    );
  }
}
