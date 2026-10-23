import { canStartCheckout, safeStripeUrl } from './subscription-checkout.ts';
import type { SubscriptionInfo } from '@bossboard/shared';

type Dependencies = { getToken: () => Promise<string | null | undefined>; apiUrl: string; fetch: typeof fetch };
type Action = 'tiers' | 'checkout' | 'portal';
const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const error = (status: number, code: string, message: string) =>
  reply({ success: false, error: code, message }, status);

/** Cookie-authenticated BFF; dependencies injectable for offline contract tests. */
export async function subscriptionProxy(request: Request, action: Action, deps: Dependencies) {
  try {
    const origin = new URL(request.url).origin;
    if (action !== 'tiers' && (request.headers.get('origin') !== origin ||
      request.headers.get('sec-fetch-site') === 'cross-site')) {
      return error(403, 'INVALID_ORIGIN', 'Please retry from BossBoard.');
    }
    const token = await deps.getToken();
    if (!token) return error(401, 'NOT_AUTHENTICATED', 'No session');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const call = (path: string, body?: unknown) => deps.fetch(`${deps.apiUrl}/api/v1/subscriptions/${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(15000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let body: unknown;
    if (action !== 'tiers') {
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return error(415, 'INVALID_CONTENT_TYPE', 'Expected JSON.');
      let input: { tier?: unknown };
      try { input = await request.json(); } catch {
        return error(400, 'VALIDATION_ERROR', 'Invalid request.');
      }
      if (action === 'checkout' && (!input || (input.tier !== 'tradie' && input.tier !== 'team')))
        return error(400, 'VALIDATION_ERROR', 'Choose Tradie or Team.');
      // Re-read ownership immediately before creating a new session; never trust client state.
      const meRes = await call('me');
      const me = await meRes.json();
      if (!meRes.ok || me.success !== true || !me.data?.subscription)
        return error(meRes.status === 401 ? 401 : 503, meRes.status === 401 ? 'NOT_AUTHENTICATED' : 'SUBSCRIPTION_UNAVAILABLE', 'Could not verify your current subscription.');
      const subscription = me.data.subscription as SubscriptionInfo;
      if (action === 'checkout' && !canStartCheckout(subscription))
        return error(409, 'EXISTING_SUBSCRIPTION', 'Manage your existing subscription instead.');
      if (action === 'portal' && (!subscription.stripeCustomerId || (subscription.tier !== 'free' && !subscription.stripeSubscriptionId)))
        return error(409, 'NO_STRIPE_CUSTOMER', 'Manage store subscriptions through the store where you subscribed.');
      body = action === 'checkout' ? {
        tier: input.tier,
        successUrl: `${origin}/subscription?checkout=success`,
        cancelUrl: `${origin}/subscription?checkout=cancelled`,
      } : { returnUrl: `${origin}/subscription` };
    }
    const upstream = await call(action, body);
    const json = await upstream.json();
    if (!upstream.ok || json.success !== true) {
      // Do not echo upstream messages, customer data, or provider diagnostics.
      return error(upstream.status === 401 ? 401 : upstream.ok ? 502 : upstream.status,
        upstream.status === 401 ? 'NOT_AUTHENTICATED' : 'BILLING_UNAVAILABLE',
        'Billing is unavailable. Please try again.');
    }
    if (action === 'tiers') return reply({ success: true, data: json.data });
    if (json.data?.betaMode === true)
      return reply({ success: true, data: { betaMode: true, message: 'Billing is unavailable during beta. No checkout was opened.' } });
    const url = safeStripeUrl(json.data?.url, action);
    if (!url) return error(502, 'INVALID_BILLING_URL', 'No safe billing link was returned. Please try again.');
    // Session IDs and provider data are unnecessary in the browser.
    return reply({ success: true, data: { url } });
  } catch {
    return error(502, 'PROXY_ERROR', 'Could not reach billing. Please try again.');
  }
}
