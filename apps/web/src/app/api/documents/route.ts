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
    const qs = request.nextUrl.searchParams.toString();
    const res = await fetch(`${API_URL}/api/v1/documents${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to list documents' },
      { status: 502 },
    );
  }
}

/** Multipart upload proxy (same pattern as photos). */
export async function POST(request: Request) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Missing content-type' },
        { status: 400 },
      );
    }
    const res = await fetch(`${API_URL}/api/v1/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: request.body,
      // @ts-expect-error duplex for streaming body
      duplex: 'half',
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to upload document' },
      { status: 502 },
    );
  }
}
