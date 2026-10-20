import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';
import { proxyAuthHeaders } from '@/lib/auth-proxy';

export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ success: false, message: 'No session' }, { status: 401 });
    const res = await fetch(`${API_URL}/api/v1/auth/resend-verification`, {
      method: 'POST',
      headers: { ...proxyAuthHeaders(request), Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ success: false, message: 'Unable to verify email' }, { status: 502 });
  }
}
