/**
 * Per-module helpers for the Quotes demo suite (F-QUO-01..03).
 *
 * Provides realistic NZ-tradie quote fixtures (bathroom reno, deck build,
 * commercial fit-out) + small utilities for unique numbering and amount
 * formatting. Mirrors the lifecycle pattern from
 * apps/web/e2e/helpers/test-data.ts (e2e-prefixed, RFC6761 @example.test
 * recipients) so the global teardown sweep can find these.
 *
 * All amounts are in CENTS (matching the API schema in apps/api/src/routes/quotes.ts).
 */
import type { APIRequestContext } from '@playwright/test';

const NZ_GST_RATE = 0.15;

export interface QuoteLineItemFixture {
  description: string;
  amount: number; // cents
}

export interface QuoteFixture {
  quoteNumber: string; // synthetic display id (e.g. QU-2026-0123)
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  jobDescription: string;
  lineItems: QuoteLineItemFixture[];
  includeGst: boolean;
  validUntil: string; // ISO date (YYYY-MM-DD)
  bankAccountName: string;
  bankAccountNumber: string;
  notes: string;
}

/**
 * Realistic NZ trade quote scenarios. Amounts are in cents.
 *
 * Anchored to amounts $5K-$30K as required by the demo brief; all line
 * items are recognisable NZ tradie work (demolition, plumbing rough-in,
 * GIB stop, electrical reticulation, etc).
 */
export const QUOTE_SCENARIOS: Record<string, QuoteFixture> = {
  bathroomReno: {
    quoteNumber: 'QU-2026-0123',
    clientName: 'Smith Residence',
    clientEmail: 'e2e-quotes-smith@example.test',
    clientPhone: '021 555 0123',
    jobDescription:
      'Full bathroom renovation — strip-out, waterproofing, new fixtures, tiling. 14-day site time.',
    lineItems: [
      { description: 'Demolition + skip hire', amount: 180000 }, // $1,800
      { description: 'Plumbing rough-in (Mike\'s Plumbing Ltd)', amount: 320000 }, // $3,200
      { description: 'Waterproofing membrane to wet area', amount: 95000 }, // $950
      { description: 'Wall + floor tiling (porcelain, 22m²)', amount: 480000 }, // $4,800
      { description: 'Fixtures supply (vanity, shower, toilet)', amount: 285000 }, // $2,850
      { description: 'GIB stop + paint, 2 coats', amount: 140000 }, // $1,400
    ],
    // subtotal = $15,000 ; +15% GST = $17,250 total (well within 5K-30K range)
    includeGst: true,
    validUntil: futureIsoDate(30),
    bankAccountName: 'Mike\'s Plumbing Ltd',
    bankAccountNumber: '12-3456-7890123-00',
    notes:
      '50% deposit on acceptance, balance on practical completion. Quote valid 30 days. Excludes waterproofing certificate ($150 + GST if required).',
  },
  deckBuild: {
    quoteNumber: 'QU-2026-0124',
    clientName: 'Te Whanau Whānau Trust',
    clientEmail: 'e2e-quotes-tewhanau@example.test',
    clientPhone: '022 555 0456',
    jobDescription:
      'Hardwood deck — 48m², kwila, balustrade, two-step stair. Auckland Council building consent included.',
    lineItems: [
      { description: 'Council consent + inspections', amount: 120000 }, // $1,200
      { description: 'Site prep, piles + bearers (H5)', amount: 220000 }, // $2,200
      { description: 'Kwila decking 90×19mm, 48m² supply', amount: 380000 }, // $3,800
      { description: 'Labour install — decking + balustrade', amount: 290000 }, // $2,900
      { description: 'Stainless fixings + finishing oil', amount: 65000 }, // $650
    ],
    // subtotal = $10,750 ; +15% GST = $12,362.50
    includeGst: true,
    validUntil: futureIsoDate(21),
    bankAccountName: 'Sarah Builds Ltd',
    bankAccountNumber: '02-0500-0123456-00',
    notes: 'Progress payments per fortnight. Excludes any rotten substructure remediation.',
  },
  commercialFitout: {
    quoteNumber: 'QU-2026-0125',
    clientName: 'Auckland Council — Albany Branch Library',
    clientEmail: 'e2e-quotes-akcc@example.test',
    clientPhone: '09 555 0789',
    jobDescription:
      'Commercial electrical fit-out — meeting rooms, LED retrofit, distribution board upgrade. After-hours work, COC required.',
    lineItems: [
      { description: '3-phase distribution board upgrade', amount: 680000 }, // $6,800
      { description: 'LED panel retrofit ×42 fittings', amount: 540000 }, // $5,400
      { description: 'Meeting-room comms + power reticulation', amount: 760000 }, // $7,600
      { description: 'EWRB COC + as-built drawings', amount: 180000 }, // $1,800
      { description: 'After-hours premium (weekend ×2)', amount: 420000 }, // $4,200
    ],
    // subtotal = $25,800 ; +15% GST = $29,670 (top of 5-30K range)
    includeGst: true,
    validUntil: futureIsoDate(45),
    bankAccountName: 'Mike\'s Sparkies Ltd',
    bankAccountNumber: '06-0001-0987654-00',
    notes: 'EWRB practising licence #12345 attached. Work to be carried out under AS/NZS 3000.',
  },
};

/**
 * Compute subtotal/GST/total from a fixture (in cents). Used to assert
 * the API\'s totals math against our fixture intent.
 */
export function expectedTotals(fixture: QuoteFixture): {
  subtotal: number;
  gstAmount: number;
  total: number;
} {
  const subtotal = fixture.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const gstAmount = fixture.includeGst ? Math.round(subtotal * NZ_GST_RATE) : 0;
  return { subtotal, gstAmount, total: subtotal + gstAmount };
}

/**
 * Build the create-quote API payload from a fixture. Strips synthetic
 * display fields (quoteNumber is server-assigned).
 */
export function toCreatePayload(fixture: QuoteFixture) {
  return {
    clientName: fixture.clientName,
    clientEmail: fixture.clientEmail,
    clientPhone: fixture.clientPhone,
    jobDescription: fixture.jobDescription,
    lineItems: fixture.lineItems,
    includeGst: fixture.includeGst,
    validUntil: fixture.validUntil,
    bankAccountName: fixture.bankAccountName,
    bankAccountNumber: fixture.bankAccountNumber,
    notes: fixture.notes,
  };
}

/**
 * NZD formatter (cents → "$1,234.56") matching the mobile/web display
 * code path. Use only for log assertions / screenshot captions; rely on
 * the rendered UI for source-of-truth assertions.
 */
export function formatNzd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-NZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * ISO date N days in the future (YYYY-MM-DD). Used for validUntil.
 */
function futureIsoDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/**
 * Helper: POST a quote via the API using an ephemeral user\'s access
 * token. Returns the created quote\'s id and the raw response body so
 * tests can chain (e.g. F-QUO-02 PDF, F-QUO-03 convert).
 *
 * NB: this is a thin wrapper — Phase 3 brief said NO EXECUTION since
 * dev env is not running. The function is shape-correct and
 * type-checked; calls will be exercised in Phase 4 once services are
 * up.
 */
export async function createQuoteViaApi(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
  fixture: QuoteFixture,
): Promise<{ id: string; quoteNumber: string; status: string }> {
  const res = await request.post(`${apiUrl}/api/v1/quotes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: toCreatePayload(fixture),
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(
      `createQuoteViaApi: expected 201, got ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const quote = body?.data?.quote;
  if (!quote?.id) {
    throw new Error(`createQuoteViaApi: missing quote.id in response: ${JSON.stringify(body)}`);
  }
  return { id: quote.id, quoteNumber: quote.quoteNumber, status: quote.status };
}
