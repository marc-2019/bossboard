/**
 * Test-Fixture Runtime Pattern Construction
 *
 * Guardrail: test-fixtures-runtime-pattern-construction
 *
 * This repo carries the CortexForge L1 destructive-edit pre-commit guard
 * (see .git/hooks/pre-commit.backup-*). That guard scans the staged diff for
 * "stub placeholder" markers — phrases a careless code generator leaves behind
 * instead of preserving real file content (e.g. an ellipsis followed by
 * "[previous content unchanged]", or a "keep original" TODO). When such a
 * marker appears on an added (+) line the commit is blocked.
 *
 * The directive this guardrail enforces: any test whose FIXTURES need to
 * contain one of those trigger phrases must BUILD the phrase at runtime from
 * harmless fragments, never write it as a source-text literal. The runtime
 * value is identical, but the source text never matches the guard's regex, so
 * the hook can't confuse "test data describing a bad pattern" with "an actual
 * bad edit". The same applies to the scanner below — it constructs the very
 * patterns it searches for at runtime, so it never trips on its own source.
 *
 * Two things are asserted:
 *   1. The documented runtime-construction pattern produces the exact marker a
 *      detector would look for (proving the technique works).
 *   2. No other test file in the suite hard-codes those markers as literals
 *      (enforcing the directive across the test tree going forward).
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';

/**
 * Build a stub-placeholder marker at runtime from harmless fragments.
 *
 * This is the documented pattern: concatenate inert pieces so the assembled
 * string equals what a detector hunts for, while the source text on disk does
 * not. `kind` selects which of the guard's marker families to produce.
 */
function buildStubMarker(kind: 'ellipsis' | 'existing' | 'preserved' | 'unchanged' | 'todo'): string {
  const dots = '.'.repeat(3);
  const prev = 'pre' + 'vious';
  const slash2 = '/' + '/';
  const blockOpen = '/' + '*';
  const blockClose = '*' + '/';
  switch (kind) {
    case 'ellipsis':
      // e.g. "... [previous content unchanged]"
      return `${dots} [${prev} ` + 'content ' + 'unchanged]';
    case 'existing':
      return `${slash2} ` + 'Existing code ' + 'below';
    case 'preserved':
      return `${slash2} ` + 'Original code ' + 'preserved';
    case 'unchanged':
      return `${blockOpen} ` + 'unchanged' + ` ${blockClose}`;
    case 'todo':
      return `${slash2} TODO: ` + 'keep ' + 'original';
  }
}

/**
 * The detector regexes — also assembled at runtime from fragments so this
 * file's own source never contains a literal trigger phrase. These mirror the
 * STUB_RE alternatives in the L1 destructive-edit guard.
 */
function buildDetectors(): RegExp[] {
  const prev = '(pre' + 'vious|original|existing|kept)';
  const ellipsis = '\\.\\.\\.\\s*\\[' + prev + '.*content';
  const existing = '/' + '/ Existing code below';
  const preserved = '/' + '/ Original code preserved';
  const unchanged = '/' + '\\* unchanged \\*' + '/';
  const todo = '/' + '/ TODO: keep original';
  return [ellipsis, existing, preserved, unchanged, todo].map((src) => new RegExp(src));
}

function collectTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTestFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('Test-fixture runtime pattern construction', () => {
  it('the documented pattern reproduces the markers a detector hunts for', () => {
    const detectors = buildDetectors();
    const markers = [
      buildStubMarker('ellipsis'),
      buildStubMarker('existing'),
      buildStubMarker('preserved'),
      buildStubMarker('unchanged'),
      buildStubMarker('todo'),
    ];

    // Each runtime-built marker is matched by exactly its own detector — the
    // technique yields the real trigger value without a source-text literal.
    markers.forEach((marker, i) => {
      expect(detectors[i].test(marker)).toBe(true);
    });
  });

  it('no test file hard-codes the stub-placeholder markers as literals', () => {
    const self = basename(__filename);
    const files = collectTestFiles(__dirname).filter((f) => basename(f) !== self);
    const detectors = buildDetectors();

    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (detectors.some((re) => re.test(line))) {
          offenders.push(`${file}:${idx + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
