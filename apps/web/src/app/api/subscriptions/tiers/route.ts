import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';

/**
 * Public proxy for tier definitions + pricing + beta flag.
 * No auth: the Express endpoint is public (it returns only static tier
 * data), and the /pricing marketing page renders from it for logged-out
 * visitors.
 */
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/v1/subscriptions/tiers`, {
      // Tier definitions change rarely, but never serve a stale beta flag
      // longer than a minute — it drives the "free during beta" messaging.
      next: { revalidate: 60 },
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch tiers' },
      { status: 502 },
    );
  }
}
