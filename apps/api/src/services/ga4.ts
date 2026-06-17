/**
 * GA4 Measurement Protocol — server-side event helper
 *
 * Why server-side: the web GA4 client (gtag.js, loaded on the landing page)
 * cannot observe conversions that complete off-web — Stripe-hosted Checkout,
 * the mobile app's subscription flow, or asynchronous webhook-driven tier
 * upgrades. The Measurement Protocol lets the API report those conversions
 * directly to GA4 so revenue events are captured reliably.
 *
 * Safety contract (revenue path — must never break the webhook):
 *   - If GA4_MP_API_SECRET is unset, every call is a clean no-op (debug log,
 *     return). Marc generates the MP API secret in the GA4 Admin console
 *     (Data Streams → <web stream> → Measurement Protocol API secrets) and
 *     sets the env var later; until then this stays dormant.
 *   - Network/transport errors are swallowed (logged), never thrown. A GA4
 *     outage must not affect Stripe webhook processing or tier upgrades.
 *
 * Reference: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */

import { config } from '../config/index.js';

const GA4_COLLECT_URL = 'https://www.google-analytics.com/mp/collect';

export interface GA4EventParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Send a single GA4 event via the Measurement Protocol.
 *
 * @param name      GA4 event name (e.g. 'checkout_completed').
 * @param params    Event parameters (tier, value, currency, transaction_id, ...).
 *                  Undefined values are dropped before sending.
 * @param clientId  Stable pseudo-anonymous identifier for the user. There is no
 *                  GA cookie server-side, so callers pass a durable id (user id
 *                  or Stripe customer id). Defaults to 'server' if omitted.
 *
 * Resolves once the request settles (or immediately on no-op). Never rejects.
 */
export async function trackServerEvent(
  name: string,
  params: GA4EventParams = {},
  clientId?: string
): Promise<void> {
  // Defensive read: never throw on a missing/partial config — the fail-open
  // contract must hold even if config.ga4 is absent (e.g. a partial test mock
  // or an older config build). Fall back to the public web-stream default.
  const measurementId = config.ga4?.measurementId || 'G-83NPHN0QP5';
  const apiSecret = config.ga4?.mpApiSecret;

  // No-op when the MP API secret is unconfigured. This is the expected state
  // until Marc provisions the secret — do not warn (would be noisy), debug only.
  if (!apiSecret) {
    if (config.isDevelopment) {
      console.debug(
        `[GA4] GA4_MP_API_SECRET unset — skipping server event '${name}' (no-op)`
      );
    }
    return;
  }

  if (!measurementId) {
    console.warn(`[GA4] GA4_MEASUREMENT_ID unset — skipping server event '${name}'`);
    return;
  }

  // Strip undefined params so we don't send "value": undefined etc.
  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      cleanParams[key] = value;
    }
  }

  const body = {
    client_id: clientId || 'server',
    // non_personalized_ads keeps these conversion pings out of ads
    // personalization unless the rest of the pipeline opts in.
    non_personalized_ads: true,
    events: [
      {
        name,
        params: cleanParams,
      },
    ],
  };

  const url = `${GA4_COLLECT_URL}?measurement_id=${encodeURIComponent(
    measurementId
  )}&api_secret=${encodeURIComponent(apiSecret)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Hard bound: this call is awaited on the Stripe webhook critical path.
      // A hung GA4 endpoint must never delay the webhook ack (Stripe would
      // time out and retry → duplicate processing). 2.5s ceiling; the catch
      // below treats the AbortError as a normal fail-open skip.
      signal: AbortSignal.timeout(2500),
    });

    // GA4 MP returns 2xx (usually 204) with no useful body even for malformed
    // events; a non-2xx indicates a transport-level problem worth logging.
    if (!res.ok) {
      console.warn(
        `[GA4] Measurement Protocol returned ${res.status} for event '${name}'`
      );
    } else {
      console.log(`[GA4] Tracked server event '${name}' (client_id=${body.client_id})`);
    }
  } catch (err) {
    // Fail-open: a GA4/network failure must never break the caller (webhook).
    console.error(`[GA4] Failed to send server event '${name}':`, err);
  }
}

export default { trackServerEvent };
