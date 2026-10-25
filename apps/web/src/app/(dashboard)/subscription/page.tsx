'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { subscriptionsClient } from '@/lib/api-client';
import { buildTierDisplays, type TiersPayload } from '@/lib/subscription-tiers';
import { canStartCheckout, safeStripeUrl } from '@/lib/subscription-checkout';
import type { SubscriptionInfo } from '@bossboard/shared';

function SubscriptionContent() {
  const query = useSearchParams();
  const [tiers, setTiers] = useState<TiersPayload | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [beta, setBeta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function load() {
    setLoading(true); setNotice(''); setSubscription(null); setTiers(null);
    try {
      const [plans, me] = await Promise.all([subscriptionsClient.tiers(), subscriptionsClient.me()]);
      setTiers(plans); setSubscription(me.subscription);
      setBeta(plans.betaMode || me.betaMode);
    } catch { setNotice('Could not load your subscription. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function openBilling(tier?: 'tradie' | 'team') {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice('');
    try {
      const result = tier ? await subscriptionsClient.checkout(tier) : await subscriptionsClient.portal();
      if ('betaMode' in result && result.betaMode) {
        setNotice('Billing is unavailable during beta. No checkout was opened.'); return;
      }
      const url = safeStripeUrl('url' in result ? result.url : null, tier ? 'checkout' : 'portal');
      if (!url) { setNotice('No safe billing link was returned. Please retry.'); return; }
      window.location.assign(url);
    } catch { setNotice('Could not open billing. Please retry or refresh your subscription details.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const eligible = canStartCheckout(subscription) && !beta && query.get('checkout') !== 'success';
  return <div className="max-w-3xl mx-auto space-y-6">
    <h1 className="text-2xl font-bold">Subscription</h1>
    <Link href="/settings" className="text-accent underline">Back to settings</Link>
    {query.get('checkout') === 'success' && <p role="status">
      Returned from checkout. Your plan changes only after payment confirmation is processed.
      Refresh subscription details to check the current plan.
    </p>}
    {query.get('checkout') === 'cancelled' && <p role="status">
      Returned from cancelled checkout. No plan change is confirmed here.
    </p>}
    {notice && <p role="alert">{notice}</p>}
    <Button variant="ghost" disabled={loading || busy} onClick={() => void load()}>Refresh subscription details</Button>
    {loading ? <p role="status">Loading subscription…</p> : <>
      {subscription && <Card><h2 className="font-semibold">Current plan: {subscription.tier}</h2></Card>}
      {beta && <p role="status">Billing is unavailable during beta.</p>}
      {subscription && !canStartCheckout(subscription) && <Card>
        <p>You already have a subscription. Use its billing management to review changes.</p>
        {subscription.stripeCustomerId && subscription.stripeSubscriptionId ?
          <Button disabled={busy || beta} onClick={() => void openBilling()}>Manage Stripe billing</Button> :
          <p>If you subscribed in the mobile app, manage it through the App Store or Google Play where you subscribed.</p>}
      </Card>}
      {subscription && canStartCheckout(subscription) && subscription.stripeCustomerId &&
        <Button disabled={busy || beta} onClick={() => void openBilling()}>Manage Stripe billing</Button>}
      {tiers && <>
        <h2 className="text-lg font-semibold">Compare plans</h2>
        <p>Prices below come from the current plan catalogue. Confirm the final amount and billing terms in Stripe checkout.</p>
        {buildTierDisplays(tiers).map(plan => <Card key={plan.tier}>
          <h3 className="text-lg font-bold">{plan.name}</h3>
          <p>{plan.priceLabel} {tiers.pricing[plan.tier]?.currency ?? ''} {plan.periodLabel}</p>
          <ul className="list-disc pl-5">{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
          {eligible && (plan.tier === 'tradie' || plan.tier === 'team') && tiers.pricing[plan.tier] &&
            <Button disabled={busy} onClick={() => void openBilling(plan.tier as 'tradie' | 'team')}>
              Continue to {plan.name} checkout
            </Button>}
        </Card>)}
      </>}
    </>}
  </div>;
}

export default function SubscriptionPage() {
  return <Suspense fallback={<p>Loading subscription…</p>}><SubscriptionContent /></Suspense>;
}
