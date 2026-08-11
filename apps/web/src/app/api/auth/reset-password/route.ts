import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { proxyAuthHeaders } from '@/lib/auth-proxy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: proxyAuthHeaders(request),
      body: JSON.stringify(body),
    });

    const json = await res.json();

    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to connect to API' },
      { status: 502 },
    );
  }
}
