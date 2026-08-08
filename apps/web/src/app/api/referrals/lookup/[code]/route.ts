import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const params = await context.params;
    const code = encodeURIComponent(params.code || '');
    const res = await fetch(`${API_URL}/api/v1/referrals/lookup/${code}`, {
      cache: 'no-store',
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to look up referral' },
      { status: 502 },
    );
  }
}
