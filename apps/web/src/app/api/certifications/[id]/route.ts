import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

async function authedRequest(
  id: string,
  method: 'GET' | 'PUT' | 'DELETE',
  body?: string,
) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}/api/v1/certifications/${encodeURIComponent(id)}`, {
    method,
    headers,
    body,
  });

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await authedRequest(id, 'GET');
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to fetch certification' },
      { status: 502 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.text();
    return await authedRequest(id, 'PUT', body);
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to update certification' },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await authedRequest(id, 'DELETE');
  } catch {
    return NextResponse.json(
      { success: false, error: 'PROXY_ERROR', message: 'Failed to delete certification' },
      { status: 502 },
    );
  }
}
