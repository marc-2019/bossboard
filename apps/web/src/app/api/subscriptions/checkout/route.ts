import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

/**
 * Create a Stripe Checkout session for upgrading to a paid tier.
 * Forwards { tier, successUrl?, cancelUrl? } to the Express API.
 * In beta mode the API responds with { betaMode: true, message } instead
 * of a session — passed through unchanged for the client to branch on.
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));

    const res = await fetch(`${API_URL}/api/v1/subscriptions/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to start checkout' },
      { status: 502 },
    );
  }
}
