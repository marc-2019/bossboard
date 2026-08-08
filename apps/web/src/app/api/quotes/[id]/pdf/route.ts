import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

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

    const res = await fetch(`${API_URL}/api/v1/quotes/${encodeURIComponent(id)}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
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
    const filename =
      res.headers.get('Content-Disposition') || 'attachment; filename="quote.pdf"';
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
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch quote PDF' },
      { status: 502 },
    );
  }
}
