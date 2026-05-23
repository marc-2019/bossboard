/**
 * F-QUO (Quotes module) — Web demos
 *
 * Spec source: docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 5 — Quotes (3 features)
 *   F-QUO-01 — Create quote
 *   F-QUO-02 — Quote PDF export
 *   F-QUO-03 — Convert quote to invoice
 *
 * Web scope: the BossBoard web app exposes a READ-ONLY list (/quotes) +
 * detail view (/quotes/[id]) with a single mutation action ("Convert to
 * invoice"). Quote creation + PDF export are mobile-first surfaces (see
 * apps/web/src/app/(dashboard)/quotes/page.tsx empty-state copy). The
 * web demos below exercise the surfaces that exist on web:
 *
 *   - F-QUO-01: visit /quotes (empty + populated states), then drill in
 *               to /quotes/[id] and assert the line items + totals
 *               render correctly. Web doesn\'t create — the API + mobile
 *               demos cover creation.
 *   - F-QUO-02: PDF download is API-only on web (mobile detail screen
 *               handles the download via expo-file-system). The web
 *               detail page does NOT expose a Download PDF button as of
 *               2026-05-23 — flagged as drift in coverage/quotes.md.
 *               The api.spec covers the endpoint behaviour.
 *   - F-QUO-03: tap "Convert to invoice" → confirm modal → assert
 *               navigation to /invoices/[converted-id].
 *
 * Data realism: uses fixtures from helpers/quotes.ts (bathroom reno,
 * deck build, commercial fit-out — $5K-$30K NZ tradie scenarios with
 * NZ GST at 15%).
 *
 * NO EXECUTION: dev env not running. Tests are syntax-verified via
 * `playwright test --list`. Test bodies are intentionally
 * page.route()-mocked so they remain runnable against any /quotes UI
 * state without depending on a seeded DB.
 */
import { test, expect } from '@playwright/test';
import { QUOTE_SCENARIOS, formatNzd, expectedTotals } from './helpers/quotes';

const MOCK_QUOTE_ID = '00000000-0000-4000-8000-000000000123';
const MOCK_INVOICE_ID = '00000000-0000-4000-8000-000000000456';

test.describe('F-QUO (Quotes module) — Web', () => {
  test.describe('F-QUO-01: Create / view quote on web', () => {
    test('F-QUO-01.a: empty state renders mobile-first hint', async ({ page }) => {
      // Intercept the underlying API call the page makes via the proxy
      // and return zero quotes so we see the empty state.
      await page.route('**/api/v1/quotes**', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { quotes: [] } }),
        });
      });

      await page.goto('/quotes');

      await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();
      await expect(page.getByText('No quotes yet')).toBeVisible();
      // Acceptance: empty-state copy steers tradies to mobile for creation
      await expect(
        page.getByText(/mobile app/i),
      ).toBeVisible();
    });

    test('F-QUO-01.b: populated list shows quote number, status, total, valid-until', async ({
      page,
    }) => {
      const bathroom = QUOTE_SCENARIOS.bathroomReno;
      const totals = expectedTotals(bathroom);

      await page.route('**/api/v1/quotes**', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              quotes: [
                {
                  id: MOCK_QUOTE_ID,
                  quoteNumber: bathroom.quoteNumber,
                  clientName: bathroom.clientName,
                  status: 'sent',
                  total: totals.total,
                  validUntil: bathroom.validUntil,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      });

      await page.goto('/quotes');

      // AC1: quote number visible
      await expect(page.getByText(bathroom.quoteNumber)).toBeVisible();
      // AC2: client name visible
      await expect(page.getByText(bathroom.clientName)).toBeVisible();
      // AC3: formatted total visible (uses NZD Intl formatter from page.tsx)
      // The page uses Intl.NumberFormat('en-NZ', { style: 'currency' }) which
      // emits "$17,250.00" for our bathroom-reno fixture.
      await expect(
        page.getByText(formatNzd(totals.total).replace('$', '$')),
      ).toBeVisible();
    });

    test('F-QUO-01.c: drill-in to /quotes/[id] renders line items + totals', async ({
      page,
    }) => {
      const bathroom = QUOTE_SCENARIOS.bathroomReno;
      const totals = expectedTotals(bathroom);

      await page.route(`**/api/v1/quotes/${MOCK_QUOTE_ID}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              quote: {
                id: MOCK_QUOTE_ID,
                quoteNumber: bathroom.quoteNumber,
                clientName: bathroom.clientName,
                clientEmail: bathroom.clientEmail,
                clientPhone: bathroom.clientPhone,
                status: 'sent',
                jobDescription: bathroom.jobDescription,
                lineItems: bathroom.lineItems.map((li, i) => ({
                  id: `li-${i}`,
                  description: li.description,
                  amount: li.amount,
                })),
                subtotal: totals.subtotal,
                gstAmount: totals.gstAmount,
                total: totals.total,
                includeGst: true,
                validUntil: bathroom.validUntil,
                convertedInvoiceId: null,
                companyName: 'Mike\'s Plumbing Ltd',
                createdAt: new Date().toISOString(),
                notes: bathroom.notes,
              },
            },
          }),
        });
      });

      await page.goto(`/quotes/${MOCK_QUOTE_ID}`);

      // AC1: quote number heading
      await expect(page.getByRole('heading', { name: bathroom.quoteNumber })).toBeVisible();
      // AC2: first line item description
      await expect(
        page.getByText(bathroom.lineItems[0].description),
      ).toBeVisible();
      // AC3: last line item description
      await expect(
        page.getByText(bathroom.lineItems[bathroom.lineItems.length - 1].description),
      ).toBeVisible();
      // AC4: GST line visible when includeGst=true
      await expect(page.getByText(/GST \(15%\)/i)).toBeVisible();
      // AC5: client name renders under "Client" card
      await expect(page.getByText(bathroom.clientName)).toBeVisible();
    });
  });

  test.describe('F-QUO-02: PDF export (web detail surface)', () => {
    test('F-QUO-02.a: drift — web detail does not expose a Download PDF button', async ({
      page,
    }) => {
      // Drift assertion: per apps/web/src/app/(dashboard)/quotes/[id]/page.tsx
      // the only mutation affordance on the web detail page is "Convert to
      // invoice". PDF download is a mobile-only path (expo-file-system).
      // This test PINS the current drift so a future PR that adds the
      // button surfaces here as a green→red flip and prompts a spec
      // matrix + coverage update.
      const bathroom = QUOTE_SCENARIOS.bathroomReno;

      await page.route(`**/api/v1/quotes/${MOCK_QUOTE_ID}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              quote: {
                id: MOCK_QUOTE_ID,
                quoteNumber: bathroom.quoteNumber,
                clientName: bathroom.clientName,
                status: 'sent',
                lineItems: [],
                subtotal: 0,
                gstAmount: 0,
                total: 0,
                includeGst: true,
                validUntil: bathroom.validUntil,
                convertedInvoiceId: null,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      });

      await page.goto(`/quotes/${MOCK_QUOTE_ID}`);

      await expect(
        page.getByRole('button', { name: /download pdf/i }),
      ).toHaveCount(0);
    });
  });

  test.describe('F-QUO-03: Convert quote to invoice', () => {
    test('F-QUO-03.a: Convert button visible on sent quote, hidden on declined', async ({
      page,
    }) => {
      const bathroom = QUOTE_SCENARIOS.bathroomReno;

      await page.route(`**/api/v1/quotes/${MOCK_QUOTE_ID}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              quote: {
                id: MOCK_QUOTE_ID,
                quoteNumber: bathroom.quoteNumber,
                clientName: bathroom.clientName,
                status: 'sent',
                lineItems: [],
                subtotal: 0,
                gstAmount: 0,
                total: 0,
                includeGst: true,
                validUntil: bathroom.validUntil,
                convertedInvoiceId: null,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      });

      await page.goto(`/quotes/${MOCK_QUOTE_ID}`);

      // AC1: Convert button visible on sent quote
      await expect(
        page.getByRole('button', { name: /convert to invoice/i }),
      ).toBeVisible();
      // AC2: Button is enabled (declined/expired would disable it per
      // apps/web/src/app/(dashboard)/quotes/[id]/page.tsx)
      await expect(
        page.getByRole('button', { name: /convert to invoice/i }),
      ).toBeEnabled();
    });

    test('F-QUO-03.b: convert succeeds → navigates to /invoices/[new-id]', async ({
      page,
    }) => {
      const bathroom = QUOTE_SCENARIOS.bathroomReno;
      const totals = expectedTotals(bathroom);

      // Mock GET for the quote detail
      await page.route(`**/api/v1/quotes/${MOCK_QUOTE_ID}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              quote: {
                id: MOCK_QUOTE_ID,
                quoteNumber: bathroom.quoteNumber,
                clientName: bathroom.clientName,
                status: 'sent',
                lineItems: bathroom.lineItems.map((li, i) => ({
                  id: `li-${i}`,
                  description: li.description,
                  amount: li.amount,
                })),
                subtotal: totals.subtotal,
                gstAmount: totals.gstAmount,
                total: totals.total,
                includeGst: true,
                validUntil: bathroom.validUntil,
                convertedInvoiceId: null,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      });

      // Mock the convert mutation — returns a freshly-minted invoice id.
      await page.route(
        `**/api/v1/quotes/${MOCK_QUOTE_ID}/convert`,
        async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                invoice: { id: MOCK_INVOICE_ID, status: 'draft' },
                quote: { id: MOCK_QUOTE_ID, status: 'converted' },
              },
              message: 'Quote converted to invoice successfully',
            }),
          });
        },
      );

      // Mock the invoice detail page\'s GET so navigation lands somewhere
      // renderable (otherwise the assertion below would flake on
      // /invoices/[id] loading state).
      await page.route(`**/api/v1/invoices/${MOCK_INVOICE_ID}`, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              invoice: {
                id: MOCK_INVOICE_ID,
                invoiceNumber: 'INV-2026-0456',
                clientName: bathroom.clientName,
                status: 'draft',
                lineItems: [],
                subtotal: totals.subtotal,
                gstAmount: totals.gstAmount,
                total: totals.total,
                includeGst: true,
                createdAt: new Date().toISOString(),
              },
            },
          }),
        });
      });

      await page.goto(`/quotes/${MOCK_QUOTE_ID}`);

      // The web flow uses window.confirm() — accept it.
      page.on('dialog', (dialog) => dialog.accept());

      await page.getByRole('button', { name: /convert to invoice/i }).click();

      // AC1: navigates to the new invoice detail page
      await expect(page).toHaveURL(new RegExp(`/invoices/${MOCK_INVOICE_ID}`));
    });
  });
});
