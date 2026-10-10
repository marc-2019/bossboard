/**
 * Customer-facing copy gate (CPO claims fix, 2026-10-10).
 *
 * Reads every customer-facing BossBoard surface from the repo and asserts that
 * banned claims are ABSENT and the approved SWMS / pricing wording is PRESENT.
 * Pure file reads: no DB, no network.
 *
 * Sources: marketing-truths.json (bossboard.cashflow-forecasting = ABSENT,
 * bossboard.compliance-framing / .swms = "aligned to the Health and Safety at
 * Work Act 2015 — you stay the PCBU and sign off", bossboard.pricing-tiers).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');

const SURFACES = [
  // Live web (bossboard.instilligent.com)
  'apps/web/src/app/page.tsx',
  'apps/web/public/llms.txt',
  'apps/web/src/app/(dashboard)/dashboard/page.tsx',
  'apps/web/src/app/(dashboard)/swms/page.tsx',
  'apps/web/src/app/(dashboard)/swms/new/page.tsx',
  // API host (api.instilligent.com): landing + legal/support pages + push copy
  'apps/api/src/landing.html',
  'apps/api/src/routes/legal.ts',
  'apps/api/src/services/notifications.ts',
  // Mobile app + store listing
  'apps/mobile/app.json',
  'apps/mobile/App.tsx',
  'apps/mobile/app/settings/index.tsx',
  'apps/mobile/app/swms/generate.tsx',
  'apps/mobile/app/certifications/add.tsx',
  'apps/mobile/store-listing.json',
  'apps/mobile/STORE_LISTING.md',
  // Repo-level / legacy publish roots
  'llms.txt',
  'landing/index.html',
  'nginx/html/index.html',
  'nginx/html/support.html',
  'nginx/html/privacy.html',
  'nginx/html/terms.html',
  'package.json',
  'README.md',
  'apps/mobile/README.md',
];

const BANNED: Array<[string, RegExp]> = [
  ['compliance and cashflow positioning', /compliance\s*(and|&|&amp;)\s*cash\s?flow/i],
  ['cashflow platform / forecasting / position', /cash\s?flow\s+(platform|forecast|position)/i],
  ['Health & safety compliance positioning', /health\s*(and|&|&amp;)\s*safety\s+compliance\s+for/i],
  ['AI receptionist', /receptionist/i],
  ['AI-powered framing (use AI-assisted)', /AI[- ]powered/i],
  ['WorkSafe compliant claim (negated disclaimers allowed)', /(?<!not )WorkSafe[- ](NZ )?compliant/i],
  ['compliant with HSWA claim', /compliant with (the )?Health and Safety/i],
  ['all-in-one claim', /all[- ]in[- ]one/i],
  ['Xero / MYOB promise', /\b(Xero|MYOB)\b/],
  ['visa / AEWV tracking promise', /visa\s+(tracking|compliance)|AEWV/i],
  ['digital signature claim', /digital signature/i],
  ['crew tracking / dispatch claim', /crew tracking|dispatch jobs|team roster and dispatch/i],
  ['speed claims', /in seconds|under a minute|in 30 seconds/i],
  ['audit trail for compliance', /audit trail for billing and compliance/i],
  ['stay compliant', /stay compliant/i],
  ['invented testimonials', /Dave Mitchell|Sarah Hohepa|Tane Pukekura/],
  ['invented admin-hours stat', /8\+\s*hours/i],
  ['negative US-app framing', /Not another US app/i],
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('customer-facing copy: banned claims are absent', () => {
  for (const rel of SURFACES) {
    it(`${rel} has no banned claims`, () => {
      const text = read(rel);
      const hits = BANNED.filter(([, re]) => re.test(text)).map(([name]) => name);
      expect(hits).toEqual([]);
    });
  }
});

describe('customer-facing copy: approved wording is present', () => {
  // Whitespace-tolerant: JSX copy is line-wrapped.
  const SWMS = /aligned\s+to\s+the\s+Health\s+and\s+Safety\s+at\s+Work\s+Act\s+2015\s+—\s+you\s+stay\s+the\s+PCBU\s+and\s+sign\s+off/;

  it.each(['apps/web/src/app/page.tsx', 'apps/web/public/llms.txt', 'apps/api/src/landing.html', 'apps/mobile/store-listing.json'])(
    '%s uses the approved SWMS form',
    (rel) => {
      expect(read(rel)).toMatch(SWMS);
    },
  );

  it('web landing and API landing lead with invoicing, quotes and jobs', () => {
    for (const rel of ['apps/web/src/app/page.tsx', 'apps/api/src/landing.html']) {
      expect(read(rel)).toMatch(/Invoicing,\s+quotes\s+and\s+job\s+records/);
    }
  });

  it('prices match on the web landing, API landing and llms.txt', () => {
    for (const rel of ['apps/web/src/app/page.tsx', 'apps/api/src/landing.html']) {
      const t = read(rel);
      expect(t).toMatch(/\$4\.99/);
      expect(t).toMatch(/\$9\.99/);
      expect(t).toMatch(/Free during beta/);
    }
    const llms = read('apps/web/public/llms.txt');
    expect(llms).toMatch(/Tradie: \$4\.99\/week/);
    expect(llms).toMatch(/Team: \$9\.99\/week/);
    expect(llms).toMatch(/Free during beta/);
    expect(read('llms.txt')).toEqual(llms);
  });

  it('store listing markdown mirrors store-listing.json full description', () => {
    const json = JSON.parse(read('apps/mobile/store-listing.json'));
    expect(read('apps/mobile/STORE_LISTING.md')).toContain(json.descriptions.full);
  });
});
