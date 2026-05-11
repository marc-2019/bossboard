import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const res = await fetch(
      `${API_URL}/api/v1/teams/${encodeURIComponent(teamId)}/leave`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to leave team' },
      { status: 502 },
    );
  }
}
