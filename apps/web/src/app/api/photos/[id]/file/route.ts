import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

/**
 * GET /api/photos/:id/file — streams the raw image bytes from the Express
 * API so the browser can render it via <img src>. We must NOT call res.json()
 * here: the upstream returns binary image data, not a JSON envelope. Stream
 * the body straight back and forward the upstream Content-Type.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const res = await fetch(
      `${API_URL}/api/v1/photos/${encodeURIComponent(id)}/file`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      // Express returns a JSON error envelope here — pass it through.
      const text = await res.text();
      try {
        return NextResponse.json(JSON.parse(text), { status: res.status });
      } catch {
        return NextResponse.json(
          { success: false, error: 'UPSTREAM_ERROR', message: text || 'Photo not found' },
          { status: res.status },
        );
      }
    }

    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch photo' },
      { status: 502 },
    );
  }
}
