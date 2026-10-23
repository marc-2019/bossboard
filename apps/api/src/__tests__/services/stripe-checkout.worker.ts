// Separate Node process for the disposable-Postgres concurrency regression.
import type Stripe from 'stripe';
import { durableCheckout } from '../../services/stripe-checkout.js';
import db from '../../services/database.js';

async function main() {
  const endpoint = process.env.BB_CHECKOUT_TEST_PROVIDER!;
  if (new URL(endpoint).hostname !== '127.0.0.1' ||
      !process.env.DATABASE_URL?.includes('/bb_checkout_disposable')) throw new Error('Disposable test configuration required');
  const rpc = (op: string) => async (...args: unknown[]) => {
    const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ op, args }) });
    if (!res.ok) throw new Error('Mock provider unavailable');
    return res.json();
  };
  const stripe = {
    customers: { create: rpc('customer') }, subscriptions: { list: rpc('subscriptions') },
    checkout: { sessions: { create: rpc('create'), retrieve: rpc('retrieve'), expire: rpc('expire'), list: rpc('list') } },
  } as unknown as Stripe;
  const result = await durableCheckout(stripe, 'price_team_test', {
    userId: process.env.BB_CHECKOUT_TEST_USER!, userEmail: 'mock@example.test', userName: null,
    tier: 'team', successUrl: 'https://bossboard.instilligent.com/subscription?checkout=success',
    cancelUrl: 'https://bossboard.instilligent.com/subscription?checkout=cancelled',
  });
  process.stdout.write('\nBB_CHECKOUT_RESULT:' + JSON.stringify(result));
}
main().catch(() => { process.exitCode = 1; }).finally(() => db.close());
