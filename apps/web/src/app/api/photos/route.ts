import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

/**
 * POST /api/photos — multipart photo upload proxy.
 *
 * Photos are multipart/form-data (binary). Reading the body with
 * request.text() / request.formData() and rebuilding it risks corrupting
 * the binary payload and loses the original multipart boundary, so we
 * forward the raw request stream straight through with its Content-Type
 * header intact. Streaming a request body on Node's fetch requires the
 * `duplex: 'half'` option.
 */
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

    const res = await fetch(`${API_URL}/api/v1/photos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: request.body,
      // @ts-expect-error duplex needed for streaming body on Node
      duplex: 'half',
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to upload photo' },
      { status: 502 },
    );
  }
}
