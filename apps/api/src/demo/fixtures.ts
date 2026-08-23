/**
 * Fictional NZ tradie fixtures for the gated local demo loader.
 *
 * Reuses the in-tree e2e demo personas / customers / job sites — not live
 * books. Source:
 *   - DEMO_PERSONAS → apps/web/e2e/demos/helpers/auth.ts
 *   - NZ_CUSTOMERS + TRADIE_LINE_ITEM_TEMPLATES → apps/web/e2e/demos/helpers/invoices.ts
 *   - NZ_TRADIE_JOB_SITES → apps/web/e2e/demos/helpers/job-logs.ts
 *
 * Emails are RFC-6761 @example.test. Do not add live tenant names, emails,
 * addresses, or invoice amounts here.
 */

export const DEMO_PERSONA = {
  name: 'Mike Tane',
  businessName: "Mike's Plumbing Ltd",
  tradeType: 'plumber' as const,
  phone: '+64 21 555 0101',
  email: 'mike.tane@example.test',
};

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

/** NZ GST rate already used by invoices.ts and e2e buildInvoicePayload. */
export const NZ_GST_RATE = 0.15;

/** Same fictional line items as e2e TRADIE_LINE_ITEM_TEMPLATES (cents). */
export const TRADIE_LINE_ITEM_TEMPLATES = [
  {
    description: 'Replace hot water cylinder (180L mains pressure) x1',
    amount: 185000,
  },
  { description: 'Labour — 4 hrs @ $95/hr', amount: 38000 },
] as const;

export const NZ_TRADIE_JOB_SITES = [
  {
    description: 'Heat pump install — Mitsubishi 7.1kW',
    siteAddress: '247 Queen St, Auckland CBD',
    notes:
      'Hi-wall split, indoor on north-facing living room wall, outdoor unit on existing concrete pad. Confirmed electrical capacity with landlord.',
    approxHours: 4,
  },
  {
    description: 'Bathroom renovation — gib + waterproofing day',
    siteAddress: 'Smith Residence, 18 Hingaia Rd, Karaka',
    notes:
      'Stripped existing tile yesterday. Today: install aqualine, waterproof membrane + tile prep. Owners away until Friday.',
    approxHours: 8,
  },
] as const;
