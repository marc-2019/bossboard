import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';
import { subscriptionProxy } from '@/lib/subscription-proxy';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return subscriptionProxy(request, 'tiers', { getToken: getAccessToken, apiUrl: API_URL, fetch });
}
