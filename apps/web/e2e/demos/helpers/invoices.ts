/**
 * E2E demo helpers for the Invoices module (F-INV-01 … F-INV-10).
 *
 * Provides NZ-tradie-realistic fixture data so a stakeholder watching the
 * headed Playwright run sees credible content (real-looking customer names,
 * addresses, line items in plausible NZD ranges with 15 % GST math) rather
 * than "lorem ipsum" or "test@test.com".
 *
 * All API helpers default to the local API at http://localhost:29000 — set
 * API_BASE_URL to override for CI / staging runs.
 *
 * Cleanup: every fixture is owned by an ephemeral user (see
 * registerEphemeralUser in ../../helpers/test-data.ts); deleting that user
 * cascades all invoices, share tokens, recurring schedules, and bank
 * transactions, so per-test cleanup is satisfied by the user.cleanup()
 * call alone.
 */

import type { APIRequestContext } from '@playwright/test';

export const API_URL = process.env.API_BASE_URL || 'http://localhost:29000';

// ---------------------------------------------------------------------------
// Fixture data — NZ tradie realism
// ---------------------------------------------------------------------------

/**
 * Realistic NZ tradie customers. Mix of residential + commercial so demo
 * sequences show variety. Addresses are plausible Auckland / Wellington
 * street addresses — not real customer data, but they look right.
 */
export const NZ_CUSTOMERS = [
  {
    name: 'Smith Residence',
    email: 'jane.smith@example.test',
    phone: '021 234 5678',
    address: '14 Karaka Drive, Albany, Auckland 0632',
  },
  {
    name: 'Te Whanau Trust',
    email: 'admin@tewhanautrust.example.test',
    phone: '021 555 0142',
    address: '88 Karangahape Road, Auckland Central 1010',
  },
  {
    name: 'Auckland Council — Parks',
    email: 'parks-ap@aucklandcouncil.example.test',
    phone: '09 301 0101',
    address: '135 Albert Street, Auckland CBD 1010',
  },
  {
    name: 'Sarah Builds Ltd',
    email: 'accounts@sarahbuilds.example.test',
    phone: '027 412 9981',
    address: '22 Cuba Street, Te Aro, Wellington 6011',
  },
  {
    name: 'North Shore Property Holdings',
    email: 'finance@nspropholdings.example.test',
    phone: '09 489 7700',
    address: '5 Hurstmere Road, Takapuna, Auckland 0622',
  },
] as const;

/**
 * Realistic NZ tradie line item templates. Amounts are stored in cents on
 * the API; the helper returns cents. Total ranges $150 – $8,500 NZD as
 * specified by the suite plan.
 */
export const TRADIE_LINE_ITEM_TEMPLATES = [
  // Plumbing
  { description: 'Replace hot water cylinder (180L mains pressure) x1', amount: 185000 },
  { description: 'Labour — 4 hrs @ $95/hr', amount: 38000 },
  { description: 'Mixer tap replacement — kitchen', amount: 24500 },
  { description: 'Drain unblock + camera inspection', amount: 32000 },

  // Electrical
  { description: 'Install LED downlights x6', amount: 54000 },
  { description: 'Switchboard upgrade to RCD-protected', amount: 165000 },
  { description: 'Outdoor floodlight install + sensor', amount: 28500 },

  // Building
  { description: 'Deck rebuild — 12 m² treated pine', amount: 425000 },
  { description: 'Gib stop + paint — bedroom', amount: 89000 },
  { description: 'Materials — H3.2 4x2 (per m)', amount: 1850 },

  // Landscaping
  { description: 'Garden bed prep + planting (10 m²)', amount: 67000 },
  { description: 'Truckload of premium garden mix', amount: 18500 },
] as const;

export interface InvoiceLineItem {
  description: string;
  amount: number; // cents
}

/**
 * Build a plausible invoice payload for the API. Returns the payload + the
 * subtotal/GST/total in cents so a test can assert math without
 * recomputing.
 *
 * Defaults: 2-3 line items in the $1,500 – $5,000 subtotal range, 15 % GST
 * included, due date +14 days from today, randomly picked customer.
 */
export function buildInvoicePayload(opts: {
  customerIndex?: number;
  lineItemCount?: number;
  includeGst?: boolean;
  dueDateDaysOut?: number;
  jobDescription?: string;
} = {}): {
  payload: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    lineItems: InvoiceLineItem[];
    includeGst: boolean;
    dueDate: string;
    jobDescription: string;
    notes: string;
  };
  expected: {
    subtotalCents: number;
    gstCents: number;
    totalCents: number;
  };
} {
  const customerIndex = opts.customerIndex ?? 0;
  const customer = NZ_CUSTOMERS[customerIndex % NZ_CUSTOMERS.length];
  const lineItemCount = opts.lineItemCount ?? 2;
  const includeGst = opts.includeGst ?? true;
  const dueDateDaysOut = opts.dueDateDaysOut ?? 14;

  const lineItems: InvoiceLineItem[] = [];
  for (let i = 0; i < lineItemCount; i++) {
    const template = TRADIE_LINE_ITEM_TEMPLATES[i % TRADIE_LINE_ITEM_TEMPLATES.length];
    lineItems.push({ description: template.description, amount: template.amount });
  }

  const subtotalCents = lineItems.reduce((s, li) => s + li.amount, 0);
  const gstCents = includeGst ? Math.round(subtotalCents * 0.15) : 0;
  const totalCents = subtotalCents + gstCents;

  const due = new Date();
  due.setDate(due.getDate() + dueDateDaysOut);
  const dueDate = due.toISOString().slice(0, 10);

  return {
    payload: {
      clientName: customer.name,
      clientEmail: customer.email,
      clientPhone: customer.phone,
      lineItems,
      includeGst,
      dueDate,
      jobDescription:
        opts.jobDescription ?? `On-site work at ${customer.address}`,
      notes: 'Payment terms: 14 days. Thanks for your business — Mike from Mike’s Plumbing.',
    },
    expected: {
      subtotalCents,
      gstCents,
      totalCents,
    },
  };
}

// ---------------------------------------------------------------------------
// API helpers (Playwright request context)
// ---------------------------------------------------------------------------

/**
 * Create an invoice via the API. Returns the created invoice envelope. Use
 * with an ephemeral user's accessToken — the user.cleanup() call will
 * delete the invoice with the user.
 */
export async function createInvoiceViaApi(
  request: APIRequestContext,
  accessToken: string,
  payload: ReturnType<typeof buildInvoicePayload>['payload'],
) {
  const res = await request.post(`${API_URL}/api/v1/invoices`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: payload,
    failOnStatusCode: false,
  });
  return { status: res.status(), body: await res.json() };
}

/**
 * Mark an invoice as sent.
 */
export async function markSentViaApi(
  request: APIRequestContext,
  accessToken: string,
  invoiceId: string,
) {
  const res = await request.post(`${API_URL}/api/v1/invoices/${invoiceId}/send`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    failOnStatusCode: false,
  });
  return { status: res.status(), body: await res.json() };
}

/**
 * Issue a share token for an invoice. Returns the public URL + raw token.
 */
export async function issueShareTokenViaApi(
  request: APIRequestContext,
  accessToken: string,
  invoiceId: string,
) {
  const res = await request.post(`${API_URL}/api/v1/invoices/${invoiceId}/share`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    failOnStatusCode: false,
  });
  return { status: res.status(), body: await res.json() };
}

// ---------------------------------------------------------------------------
// Recurring + bank reconciliation helpers (mobile-only modules per the
// drift appendix — included here so the API spec layer can still cover
// them, even though Web has no UI yet).
// ---------------------------------------------------------------------------

/**
 * Build a payload for POST /api/v1/recurring-invoices. Defaults to a
 * monthly schedule starting tomorrow with a 6-month run.
 */
export function buildRecurringInvoicePayload(opts: {
  interval?: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually';
  startDateDaysOut?: number;
  endDateMonthsOut?: number;
  customerIndex?: number;
} = {}): Record<string, unknown> {
  const interval = opts.interval ?? 'monthly';
  const startDateDaysOut = opts.startDateDaysOut ?? 1;
  const endDateMonthsOut = opts.endDateMonthsOut ?? 6;
  const customer = NZ_CUSTOMERS[(opts.customerIndex ?? 1) % NZ_CUSTOMERS.length];

  const start = new Date();
  start.setDate(start.getDate() + startDateDaysOut);
  const startDate = start.toISOString().slice(0, 10);

  const end = new Date(start);
  end.setMonth(end.getMonth() + endDateMonthsOut);
  const endDate = end.toISOString().slice(0, 10);

  return {
    clientName: customer.name,
    clientEmail: customer.email,
    interval,
    startDate,
    endDate,
    lineItems: [
      { description: 'Monthly maintenance retainer', amount: 45000 },
    ],
    includeGst: true,
    jobDescription: `Recurring ${interval} maintenance for ${customer.name}`,
  };
}

/**
 * Build a realistic bank-CSV row set for auto-match: ASB / ANZ-style format
 * with date, description, amount. Two rows match invoice totals
 * exactly; one is unrelated to test the false-positive guard.
 */
export function buildBankCsvRows(
  matchedTotalsCents: number[],
  unrelatedAmountCents = 13750,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [
    'Date,Amount,Payee,Particulars,Code,Reference',
    ...matchedTotalsCents.map(
      (cents, i) =>
        `${today},${(cents / 100).toFixed(2)},Smith Residence,Invoice payment ${i + 1},,INV-${1000 + i}`,
    ),
    `${today},${(unrelatedAmountCents / 100).toFixed(2)},Bunnings Warehouse,Materials purchase,,`,
  ];
  return rows.join('\n');
}
