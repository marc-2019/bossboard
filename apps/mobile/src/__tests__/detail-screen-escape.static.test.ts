/**
 * L3 static guard — navigation dead-end prevention.
 *
 * Coverage % never caught SWMS Details without a back control: the header
 * options object "executed" in tests that never rendered the screen with
 * canGoBack()===false.
 *
 * Rule: every detail screen file named [id].tsx under app/ must either:
 *   - import/use safeGoBack or BackButton, OR
 *   - be listed in ALLOWLIST with a reason.
 *
 * Also flags raw router.back() without safeGoBack in the same file.
 */
import fs from 'fs';
import path from 'path';

const APP_ROOT = path.join(__dirname, '../../app');

const ALLOWLIST: Record<string, string> = {
  // none currently — all detail screens should have an escape
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name === '[id].tsx') acc.push(p);
  }
  return acc;
}

describe('detail-screen escape static guard (App Review / dead-end prevention)', () => {
  const files = walk(APP_ROOT);

  it('finds detail screens under app/', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((f) => [path.relative(APP_ROOT, f), f]))(
    '%s has safeGoBack, BackButton, or allowlist entry',
    (rel, abs) => {
      const src = fs.readFileSync(abs as string, 'utf8');
      const key = (rel as string).replace(/\\/g, '/');
      if (ALLOWLIST[key]) {
        expect(ALLOWLIST[key].length).toBeGreaterThan(5);
        return;
      }
      const hasEscape =
        src.includes('safeGoBack') ||
        src.includes('BackButton') ||
        /testID=["'`][^"'`]*back/i.test(src);
      expect(hasEscape).toBe(true);
    },
  );

  it.each(files.map((f) => [path.relative(APP_ROOT, f), f]))(
    '%s does not use raw router.back without safeGoBack',
    (rel, abs) => {
      const src = fs.readFileSync(abs as string, 'utf8');
      const key = (rel as string).replace(/\\/g, '/');
      if (ALLOWLIST[key]) return;
      if (!src.includes('router.back')) return;
      // If router.back appears, safeGoBack must also be imported/used
      expect(src).toMatch(/safeGoBack/);
    },
  );
});
