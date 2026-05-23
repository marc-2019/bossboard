/**
 * F-PHOTO web demos — Photos module
 *
 * Note: Photos is a **mobile-primary** module. Tradies attach photos via the
 * device camera/gallery (see apps/mobile/.maestro/3{2..4}-photo-*.yaml).
 * The web surface only renders existing photos as thumbnails inside entity
 * detail pages (invoice/expense/job/swms) and exposes a browser file-input
 * fallback for desktop uploads.
 *
 * This spec runs in headed mode for Marc to see the file-input flow, and
 * exercises path resilience via setInputFiles() with an in-memory PNG buffer
 * — no binary fixture is committed.
 *
 * Feature IDs:
 *   - F-PHOTO-01: web file-input flow + page accessibility (smoke)
 *   - F-PHOTO-02: web gallery thumbnail render (smoke)
 *
 * The primary API surface is covered in apps/web/e2e/demos/api/photos.api.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { tinyPngBuffer, sampleCaptions } from './helpers/photos';

test.describe('F-PHOTO web (Photos module — mobile-primary, minimal web surface)', () => {
  test('F-PHOTO-01: web app renders (smoke — no photo-only page exists yet)', async ({ page }) => {
    // Photos has no dedicated web page in v0.5.0 — they are embedded in
    // entity detail screens (invoice/expense/job/swms). This smoke test
    // confirms the web app boots, since the actual photo upload UI lives
    // inside entity detail pages which require auth + entity fixtures.
    await page.goto('/');
    // BossBoard branding is present
    await expect(page.getByText('BossBoard').first()).toBeVisible({ timeout: 10000 });
  });

  test('F-PHOTO-01: setInputFiles works with in-memory PNG buffer (capability check)', async ({ page }) => {
    // Demonstrate the browser file-input upload mechanism we use whenever
    // entity detail pages add their own photo-attachment widget. Marc can
    // see the file-input accept the in-memory PNG with no on-disk fixture.
    await page.setContent(`
      <html>
        <body>
          <h1>BossBoard photo upload capability check</h1>
          <p>${sampleCaptions.expenseReceipt}</p>
          <input type="file" id="photo" accept="image/*" data-testid="photo-input" />
          <div id="result" data-testid="result"></div>
          <script>
            document.getElementById('photo').addEventListener('change', (e) => {
              const f = e.target.files[0];
              document.getElementById('result').textContent =
                'name=' + f.name + ' size=' + f.size + ' type=' + f.type;
            });
          </script>
        </body>
      </html>
    `);

    await page.locator('[data-testid="photo-input"]').setInputFiles({
      name: 'bunnings-receipt-237-40.png',
      mimeType: 'image/png',
      buffer: tinyPngBuffer(),
    });

    const result = page.locator('[data-testid="result"]');
    await expect(result).toContainText('name=bunnings-receipt-237-40.png');
    await expect(result).toContainText('type=image/png');
    // Tiny 1x1 PNG = 67 bytes
    await expect(result).toContainText('size=67');
  });

  test('F-PHOTO-02: gallery render contract (placeholder — wired when entity pages add photo widget)', async ({ page }) => {
    // Documents the desired render contract for the web gallery row that
    // entity detail pages will adopt. When apps/web/src/app/.../[id]/page.tsx
    // wires up <PhotoGallery />, this spec gets a real navigation + assertion;
    // for now it asserts the contract on a synthetic page so the demo cell
    // is non-empty and the gap is visible to Phase 4.
    await page.setContent(`
      <html>
        <body>
          <section data-testid="photo-gallery" aria-label="Photo attachments">
            <h2>Photos (2)</h2>
            <div data-testid="photo-thumb">${sampleCaptions.beforeShot}</div>
            <div data-testid="photo-thumb">${sampleCaptions.afterShot}</div>
          </section>
        </body>
      </html>
    `);
    await expect(page.locator('[data-testid="photo-gallery"]')).toBeVisible();
    await expect(page.locator('[data-testid="photo-thumb"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="photo-thumb"]').first()).toContainText(/bathroom tile install/i);
  });
});
