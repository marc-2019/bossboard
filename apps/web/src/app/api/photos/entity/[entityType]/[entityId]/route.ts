import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

/**
 * GET /api/photos/:entityType/:entityId — list photos attached to an entity.
 * JSON pass-through proxy to /api/v1/photos/:entityType/:entityId.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> },
) {
  try {
    const { entityType, entityId } = await params;
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const res = await fetch(
      `${API_URL}/api/v1/photos/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch photos' },
      { status: 502 },
    );
  }
}
