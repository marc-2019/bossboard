import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const search = request.nextUrl.searchParams.get('search') || '';
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    qs.set('limit', request.nextUrl.searchParams.get('limit') || '100');

    const res = await fetch(`${API_URL}/api/v1/products?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch products' },
      { status: 502 },
    );
  }
}
