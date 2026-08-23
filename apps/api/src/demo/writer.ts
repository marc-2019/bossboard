/**
 * Gated demo books writer.
 *
 * Attaches fictional fixture rows to the dedicated demo user_id only.
 * No-ops unless DEMO=1 and --demo-only, and no-ops on production, Railway,
 * or a non-loopback DATABASE_URL. Requires DEMO_USER_ID. Never writes for
 * any other owner.
 */

import { gateFromEnv } from './gates.js';
import {
  NZ_CUSTOMERS,
  NZ_GST_RATE,
  NZ_TRADIE_JOB_SITES,
  TRADIE_LINE_ITEM_TEMPLATES,
} from './fixtures.js';

export type DemoCustomerRow = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
};

export type DemoInvoiceRow = {
  userId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  jobDescription: string;
  lineItems: ReadonlyArray<{ description: string; amount: number }>;
  subtotal: number;
  gstAmount: number;
  total: number;
};

export type DemoJobLogRow = {
  userId: string;
  description: string;
  siteAddress: string;
  notes: string;
};

export type DemoSwmsRow = {
  userId: string;
  title: string;
  jobDescription: string;
  siteAddress: string;
  clientName: string;
  templateType: string;
};

export type DemoBooksSink = {
  insertCustomer: (row: DemoCustomerRow) => Promise<void>;
  insertInvoice: (row: DemoInvoiceRow) => Promise<void>;
  insertJobLog: (row: DemoJobLogRow) => Promise<void>;
  insertSwms: (row: DemoSwmsRow) => Promise<void>;
};

export type LoadDemoBooksInput = {
  env: NodeJS.ProcessEnv;
  argv: string[];
  demoUserId: string;
  attachToUserId: string;
  sink: DemoBooksSink;
};

export type LoadDemoBooksResult =
  | { wrote: true; attachedUserId: string }
  | { wrote: false; reason: string };

function configuredDemoUserId(env: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = env.DEMO_USER_ID?.trim();
  return fromEnv || undefined;
}

export async function loadDemoBooks(
  input: LoadDemoBooksInput,
): Promise<LoadDemoBooksResult> {
  const gate = gateFromEnv(input.env, input.argv);
  if (!gate.allowed) {
    return { wrote: false, reason: gate.reason };
  }

  const pinned = configuredDemoUserId(input.env);
  if (!pinned) {
    return { wrote: false, reason: 'DEMO_USER_ID is not set' };
  }
  const demoUserId = pinned;
  if (
    !input.demoUserId ||
    !input.attachToUserId ||
    input.attachToUserId !== demoUserId ||
    input.demoUserId !== demoUserId
  ) {
    return { wrote: false, reason: 'refusing non-demo user_id' };
  }

  const userId = demoUserId;
  const lineItems = TRADIE_LINE_ITEM_TEMPLATES.map((item) => ({
    description: item.description,
    amount: item.amount,
  }));
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gstAmount = Math.round(subtotal * NZ_GST_RATE);
  const total = subtotal + gstAmount;

  for (const customer of NZ_CUSTOMERS) {
    await input.sink.insertCustomer({
      userId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
    });
  }

  const firstCustomer = NZ_CUSTOMERS[0];
  await input.sink.insertInvoice({
    userId,
    clientName: firstCustomer.name,
    clientEmail: firstCustomer.email,
    clientPhone: firstCustomer.phone,
    jobDescription: `On-site work at ${firstCustomer.address}`,
    lineItems,
    subtotal,
    gstAmount,
    total,
  });

  const site = NZ_TRADIE_JOB_SITES[0];
  await input.sink.insertJobLog({
    userId,
    description: site.description,
    siteAddress: site.siteAddress,
    notes: site.notes,
  });

  await input.sink.insertSwms({
    userId,
    title: site.description,
    jobDescription: site.description,
    siteAddress: site.siteAddress,
    clientName: firstCustomer.name,
    templateType: 'plumber',
  });

  return { wrote: true, attachedUserId: userId };
}
