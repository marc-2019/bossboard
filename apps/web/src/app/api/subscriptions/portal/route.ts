import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

/**
 * Create a Stripe Billing Portal session (manage payment method, change
 * plan, cancel). The API validates returnUrl against an allowlist, requires
 * an existing Stripe customer, and short-circuits with { betaMode: true,
 * message } during beta.
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

    const res = await fetch(`${API_URL}/api/v1/subscriptions/portal`, {
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
      { success: false, error: 'PROXY_ERROR', message: 'Failed to open billing portal' },
      { status: 502 },
    );
  }
}
