import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

/**
 * Streams the SWMS PDF from the Express API. The browser hits this directly
 * (via a download anchor / new tab), so the response is the raw PDF bytes
 * rather than a JSON envelope. Mirrors the invoice PDF proxy.
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

    const res = await fetch(`${API_URL}/api/v1/swms/${encodeURIComponent(id)}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // Express returns JSON on error here — pass it through.
      const text = await res.text();
      try {
        return NextResponse.json(JSON.parse(text), { status: res.status });
      } catch {
        return NextResponse.json(
          { success: false, error: 'UPSTREAM_ERROR', message: text || 'PDF generation failed' },
          { status: res.status },
        );
      }
    }

    const buffer = await res.arrayBuffer();
    const filename = res.headers.get('Content-Disposition') || 'attachment; filename="swms.pdf"';
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': filename,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch SWMS PDF' },
      { status: 502 },
    );
  }
}
