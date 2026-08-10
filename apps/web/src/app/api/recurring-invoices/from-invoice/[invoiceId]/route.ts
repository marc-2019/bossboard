import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

export async function POST(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'NOT_AUTHENTICATED', message: 'No session' },
        { status: 401 },
      );
    }

    const { invoiceId } = await context.params;
    const body = await request.text();
    const res = await fetch(
      `${API_URL}/api/v1/recurring-invoices/from-invoice/${encodeURIComponent(invoiceId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body || '{}',
      },
    );

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'PROXY_ERROR',
        message: 'Failed to create recurring template from invoice',
      },
      { status: 502 },
    );
  }
}
