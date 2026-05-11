import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

export async function GET() {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch user' },
      { status: 502 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));

    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      method: 'PUT',
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
      { success: false, error: 'PROXY_ERROR', message: 'Failed to update profile' },
      { status: 502 },
    );
  }
}
