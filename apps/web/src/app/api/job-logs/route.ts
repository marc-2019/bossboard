import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

const ALLOWED_STATUSES = new Set(['active', 'completed']);

export async function GET(req: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const status = req.nextUrl.searchParams.get('status');
    const upstream = new URL(`${API_URL}/api/v1/job-logs`);
    if (status && ALLOWED_STATUSES.has(status)) {
      upstream.searchParams.set('status', status);
    }

    const res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch job logs' },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const body = await req.text();
    const res = await fetch(`${API_URL}/api/v1/job-logs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to clock in' },
      { status: 502 },
    );
  }
}
