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
import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');

/** Directories walked in full so a new page is covered without editing this list. */
const CUSTOMER_DIRS: Array<{ dir: string; exts: string[] }> = [
  { dir: 'apps/web/src/app', exts: ['.tsx', '.css'] },
  { dir: 'apps/web/public', exts: ['.txt', '.html', '.md', '.json'] },
  { dir: 'apps/mobile/app', exts: ['.tsx'] },
  { dir: 'nginx/html', exts: ['.html', '.txt'] },
  { dir: 'landing', exts: ['.html'] },
];

/**
 * Customer copy that lives outside those trees (store listing, legal route,
 * push copy, API disclaimer strings, repo landing mirrors).
 */
const CUSTOMER_FILES = [
  'apps/api/src/landing.html',
  'apps/api/src/routes/legal.ts',
  'apps/api/src/services/notifications.ts',
  'apps/api/src/services/swms.ts',
  'apps/mobile/App.tsx',
  'apps/mobile/app.json',
  'apps/mobile/PRIVACY_POLICY.md',
  'apps/mobile/store-listing.json',
  'apps/mobile/STORE_LISTING.md',
  'apps/mobile/README.md',
  'llms.txt',
  'README.md',
  'package.json',
];

const SKIP_DIR = new Set(['api', '__tests__', 'node_modules']);

function walk(dir: string, exts: Set<string>): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      out.push(...walk(rel, exts));
      continue;
    }
    if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;
    if (exts.has(extname(entry.name))) out.push(rel);
  }
  return out;
}

function collectSurfaces(): string[] {
  const found = new Set<string>(CUSTOMER_FILES);
  for (const { dir, exts } of CUSTOMER_DIRS) {
    if (!statSync(join(ROOT, dir)).isDirectory()) continue;
    for (const rel of walk(dir, new Set(exts))) found.add(rel);
  }
  return [...found].sort();
}

const SURFACES = collectSurfaces();

const BANNED: Array<[string, RegExp]> = [
  ['compliance and cashflow positioning', /compliance\s*(and|&|&amp;)\s*cash\s?flow/i],
  ['cashflow platform / forecasting / position', /cash\s?flow\s+(platform|forecast|position)/i],
  ['Health & safety compliance positioning', /health\s*(and|&|&amp;)\s*safety\s+compliance\s+for/i],
  ['AI receptionist', /receptionist/i],
  ['AI-powered framing (use AI-assisted)', /AI[\s\p{P}]*powered(?:\s+by)?/iu],
  ['WorkSafe compliant claim', /WorkSafe[-\s]+(NZ[-\s]+)?compliant/i],
  ['WorkSafe approved claim', /WorkSafe[-\s]+(NZ[-\s]+)?approved/i],
  ['align with WorkSafe claim', /align(?:ed)?\s+with\s+WorkSafe/i],
  ['legally compliant claim', /legally\s+compliant/i],
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
  ['understated weekly-to-monthly price', /~\$19\.99|~\$39\.99/],
];

/** U+2010–U+2015 → ASCII hyphen, then drop the only allowed negation. */
function prepare(text: string): string {
  return text
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/not\s+legal\s+advice/gi, ' ');
}

function bannedHits(text: string): string[] {
  return BANNED.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('customer-facing copy: banned claims are absent', () => {
  it('covers the nginx hero, support page, and mobile privacy policy', () => {
    expect(SURFACES).toEqual(expect.arrayContaining([
      'nginx/html/index.html',
      'nginx/html/support.html',
      'apps/mobile/PRIVACY_POLICY.md',
    ]));
  });

  it('treats unicode hyphens as ascii and allows only "not legal advice"', () => {
    const hyphenated = 'WorkSafe\u2013compliant AI\u2011powered';
    expect(bannedHits(prepare(hyphenated))).toEqual(
      expect.arrayContaining([
        'WorkSafe compliant claim',
        'AI-powered framing (use AI-assisted)',
      ]),
    );
    expect(bannedHits(prepare('This draft is not WorkSafe compliant'))).toContain(
      'WorkSafe compliant claim',
    );
    expect(bannedHits(prepare('This draft is not legal advice'))).toEqual([]);
    expect(bannedHits(prepare('aligned with WorkSafe NZ guidelines'))).toContain(
      'align with WorkSafe claim',
    );
    expect(bannedHits(prepare('WorkSafe approved templates'))).toContain(
      'WorkSafe approved claim',
    );
    expect(bannedHits(prepare('Are the documents legally compliant?'))).toContain(
      'legally compliant claim',
    );
    expect(bannedHits(prepare('uses AI (powered by the Anthropic Claude API)'))).toContain(
      'AI-powered framing (use AI-assisted)',
    );
    expect(bannedHits(prepare('AI-assisted generation (using the Anthropic Claude API)'))).toEqual(
      [],
    );
  });

  for (const rel of SURFACES) {
    it(`${rel} has no banned claims`, () => {
      expect(bannedHits(prepare(read(rel)))).toEqual([]);
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

  const LANDING_H1S = [
    'apps/web/src/app/page.tsx',
    'apps/api/src/landing.html',
    'landing/index.html',
    'nginx/html/index.html',
  ];

  function firstH1Text(source: string): string {
    const match = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (!match) {
      throw new Error('landing has no <h1>');
    }
    return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  it('each landing H1 contains Invoicing', () => {
    for (const rel of LANDING_H1S) {
      expect(firstH1Text(read(rel))).toMatch(/Invoicing/);
    }
  });

  it('short SWMS lines keep HSWA alignment and PCBU accountability', () => {
    expect(read('apps/mobile/App.tsx')).toMatch(SWMS);
    expect(read('apps/web/src/app/(dashboard)/dashboard/page.tsx')).toMatch(SWMS);
    expect(read('apps/web/src/app/(dashboard)/swms/page.tsx')).toMatch(SWMS);
    const shot = JSON.parse(read('apps/mobile/store-listing.json')).screenshots.titles[1] as string;
    expect(shot).toMatch(/aligned to HSWA 2015/);
    expect(shot).toMatch(/you stay the PCBU/);
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
