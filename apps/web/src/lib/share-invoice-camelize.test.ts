/**
 * Share link returns transformForMobile snake_case invoice.
 * Web view uses invoice.lineItems — missing camelize 500s the Next app
 * (INV-0002 2026-08-22 client-side exception after Share link).
 */
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function deepCamelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCamelize);
  if (value !== null && typeof value === 'object' && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamelKey(k)] = deepCamelize(v);
    }
    return out;
  }
  return value;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const payload = {
  shareUrl: 'https://api.instilligent.com/api/v1/public/invoices/tok',
  token: 'tok',
  invoice: {
    id: 'dbe5e571',
    invoice_number: 'INV-0002',
    status: 'sent',
    line_items: [{ id: 'li-1', description: 'Labour', amount: 10000 }],
  },
};

const raw = payload.invoice as { lineItems?: unknown; line_items?: unknown };
assert(!raw.lineItems, 'fixture is snake_case');
assert(Array.isArray(raw.line_items), 'fixture has line_items');

const out = deepCamelize(payload) as {
  shareUrl: string;
  invoice: { invoiceNumber: string; lineItems: { description: string }[] };
};
assert(out.invoice.invoiceNumber === 'INV-0002', 'invoice_number camelized');
assert(out.invoice.lineItems.length === 1, 'lineItems present after camelize');
assert(out.invoice.lineItems[0].description === 'Labour', 'line item kept');
assert(out.shareUrl.includes('/public/invoices/'), 'shareUrl preserved');

console.log('share-invoice-camelize: ok');
