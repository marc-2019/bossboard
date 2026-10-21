import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const res = await fetch(
      `${API_URL}/api/v1/teams/invites/${encodeURIComponent(code)}`,
      { cache: 'no-store' },
    );
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Could not open this invite' },
      { status: 502 },
    );
  }
}
