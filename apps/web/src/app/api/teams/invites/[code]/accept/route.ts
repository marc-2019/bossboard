import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ success: false, message: 'No session' }, { status: 401 });
    const { code } = await params;
    const res = await fetch(`${API_URL}/api/v1/teams/invites/${encodeURIComponent(code)}/accept`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, message: 'Unable to load invitation' }, { status: 502 });
  }
}
