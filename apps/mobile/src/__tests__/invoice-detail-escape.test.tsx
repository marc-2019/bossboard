/**
 * Invoice detail is on the App Review walk (Home → … → Invoices).
 * Must not trap with raw router.back when canGoBack is false.
 *
 * Current production code may still use router.back — this test documents
 * required escape behaviour. Prefer safeGoBack; until fixed, assert in-content
 * back control exists and call path is testable.
 */
import fs from 'fs';
import path from 'path';

const invoiceIdPath = path.join(__dirname, '../../app/invoices/[id].tsx');

describe('Invoice detail escape contract', () => {
  const src = fs.readFileSync(invoiceIdPath, 'utf8');

  it('file exists', () => {
    expect(fs.existsSync(invoiceIdPath)).toBe(true);
  });

  it('has a user-visible back control (button or BackButton)', () => {
    const hasUiBack =
      src.includes('backButton') ||
      src.includes('BackButton') ||
      src.includes('Go back') ||
      src.includes('chevron-back') ||
      /onPress=\{[^}]*back/i.test(src);
    expect(hasUiBack).toBe(true);
  });

  it('uses safeGoBack (not raw router.back)', () => {
    expect(src).toMatch(/safeGoBack/);
    expect(src).not.toMatch(/router\.back\s*\(/);
  });
});
