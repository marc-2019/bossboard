import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }
    const { id } = await params;
    const res = await fetch(`${API_URL}/api/v1/documents/${id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return NextResponse.json(json, { status: res.status });
    }
    const buf = await res.arrayBuffer();
    const headers = new Headers();
    const ct = res.headers.get('content-type');
    const cd = res.headers.get('content-disposition');
    if (ct) headers.set('Content-Type', ct);
    if (cd) headers.set('Content-Disposition', cd);
    return new NextResponse(buf, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch file' },
      { status: 502 },
    );
  }
}
