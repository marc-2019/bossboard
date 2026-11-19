/**
 * User-visible "Margin %" copy is "Markup %". Field names stay.
 * Run: node apps/web/scripts/test-markup-labels.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Drop comments so field docs are not treated as labels. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const files = {
  'src/app/(dashboard)/invoices/new/page.tsx': [
    "label={idx === 0 ? 'Markup %' : undefined}",
    'Cost + markup % set sell amount (customer only sees the sell price).',
    'needs a valid sell amount (or cost + markup %).',
    'Cost and markup stay on your draft only — PDF and email show sell amounts only.',
    'Cost/markup stay in line items',
    'marginPercent',
  ],
  'src/app/(dashboard)/invoices/[id]/edit/page.tsx': [
    "label={idx === 0 ? 'Markup %' : undefined}",
    'needs a valid sell amount (or cost + markup %).',
    'Cost and markup are internal only — PDF and email show sell amounts only.',
    'marginPercent',
  ],
  'src/app/(dashboard)/invoices/[id]/page.tsx': [
    '` · markup ${item.marginPercent}%`',
    'marginPercent',
  ],
  'src/app/(dashboard)/products/new/page.tsx': [
    'label="Markup %"',
    "setError('Markup % must be 0 or more.');",
    'Markup % applies to the monthly share. Customers only see sell price.',
    'Cost + markup % calculate sell price. Customers only ever see sell price on invoices.',
    'defaultMarginPercent',
  ],
  'src/app/(dashboard)/products/[id]/edit/page.tsx': [
    'label="Markup %"',
    "setError('Markup % must be 0 or more.');",
    'Cost + markup % calculate sell price. Customers only ever see sell price on invoices.',
    'defaultMarginPercent',
  ],
};

const banned = [
  'Margin %',
  'margin %',
  'cost + margin',
  'Cost and margin',
  'Cost/margin',
  '· margin ',
];

for (const [rel, required] of Object.entries(files)) {
  const raw = readFileSync(join(webRoot, rel), 'utf8');
  const src = stripComments(raw);
  for (const phrase of required) {
    assert.ok(src.includes(phrase), `${rel} missing: ${phrase}`);
  }
  for (const phrase of banned) {
    assert.equal(
      src.toLowerCase().includes(phrase.toLowerCase()),
      false,
      `${rel} still has user-facing "${phrase}"`,
    );
  }
}

console.log('test-markup-labels.mjs: all passed');
