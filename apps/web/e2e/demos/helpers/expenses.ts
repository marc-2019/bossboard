/**
 * E2E demo helpers for the Expenses module.
 *
 * Module: F-EXP-01, F-EXP-02, F-EXP-03 from
 * docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module 6.
 *
 * Per docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md
 * Phase 3 TEMPLATE M.2 step 2: demo data must be visually credible —
 * realistic NZ-tradie expense rows (Bunnings materials run, fuel
 * top-up, drill, sparky callout, Xero subscription) so the headed
 * demo Marc reviews looks like a real on-site afternoon, not
 * Lorem-ipsum.
 *
 * All helpers also generate e2e-tagged data per the
 * e2e-test-data-lifecycle directive (see apps/web/e2e/helpers/test-data.ts).
 *
 * NOTE: The dev environment is not running while these specs are
 * authored (per parent task brief). Specs are syntax-verified via
 * `playwright test --list` only — they may not have all been run yet.
 */

import type { APIRequestContext } from '@playwright/test';
import { testDataName } from '../../helpers/test-data';

/**
 * Canonical expense category enum mirroring
 * apps/api/src/routes/expenses.ts:15.
 * Keep in sync if the API enum changes.
 */
export const EXPENSE_CATEGORIES = [
  'materials',
  'fuel',
  'tools',
  'subcontractor',
  'vehicle',
  'office',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Shape accepted by POST /api/v1/expenses.
 * `amount` is integer cents (see apps/mobile/app/expenses/create.tsx:66
 * `amountCents = Math.round(dollars * 100)`).
 */
export interface CreateExpenseInput {
  date?: string; // YYYY-MM-DD
  amount: number; // integer cents
  category: ExpenseCategory;
  description?: string;
  vendor?: string;
  isGstClaimable?: boolean;
  notes?: string;
}

/**
 * Realistic NZ tradie expense fixtures used across demos.
 * Data echoes the parent-task "Data realism" note:
 *   Materials $45 trade-store run, Vehicle $80 fuel,
 *   Tools $350 cordless drill, Subcontractor $1500 sparky
 *   callout, Office Xero subscription.
 */
export const NZ_TRADIE_EXPENSE_FIXTURES: ReadonlyArray<CreateExpenseInput> = [
  {
    amount: 4500, // $45.00 — small trade-store run
    category: 'materials',
    description: 'PVC fittings + flux',
    vendor: 'Plumbing World — Penrose',
    isGstClaimable: true,
  },
  {
    amount: 8000, // $80.00 — full tank for ute
    category: 'fuel',
    description: 'Diesel — Ranger ute',
    vendor: 'Z Energy Manukau',
    isGstClaimable: true,
  },
  {
    amount: 35000, // $350.00 — cordless drill
    category: 'tools',
    description: 'DeWalt cordless drill kit',
    vendor: 'Bunnings Lincoln Rd',
    isGstClaimable: true,
  },
  {
    amount: 150000, // $1,500.00 — sparky callout
    category: 'subcontractor',
    description: 'Sparky callout — switchboard rewire',
    vendor: 'Mike\'s Electrical Ltd',
    isGstClaimable: true,
  },
  {
    amount: 8900, // $89.00 — Xero monthly subscription
    category: 'office',
    description: 'Xero Starter — monthly',
    vendor: 'Xero NZ',
    isGstClaimable: true,
  },
];

/**
 * Generate a unique tagged description for a single demo expense so
 * teardown can sweep by tag.
 */
export function uniqueExpenseTag(purpose: string): string {
  return testDataName(`exp-${purpose}`).tag;
}

/**
 * Build a single tagged expense payload from the fixture pool. The
 * tag is appended to the description so DB sweeps by `LIKE 'e2e-%'`
 * find it.
 */
export function makeTaggedExpense(
  index: number,
  purpose: string,
): CreateExpenseInput {
  const fixture =
    NZ_TRADIE_EXPENSE_FIXTURES[index % NZ_TRADIE_EXPENSE_FIXTURES.length];
  if (!fixture) {
    // Defensive: array literal is non-empty above so this is unreachable,
    // but keeps the type system happy without `!` non-null assertion.
    throw new Error('NZ_TRADIE_EXPENSE_FIXTURES is empty');
  }
  const tag = uniqueExpenseTag(purpose);
  return {
    ...fixture,
    description: `${fixture.description} [${tag}]`,
  };
}

/**
 * Mock receipt-photo payload for F-EXP-01 receipt-attach assertion.
 *
 * Per parent-task brief: "F-EXP-01 receipt photo: mock the photo
 * upload endpoint. Don't need real image data."
 *
 * We send a tiny 1x1 PNG as multipart/form-data so the route's
 * `upload.single('photo')` middleware accepts it without needing a
 * real receipt asset on disk.
 */
export const MOCK_RECEIPT_PNG_BASE64 =
  // 1x1 transparent PNG, base64-encoded
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function mockReceiptBuffer(): Buffer {
  return Buffer.from(MOCK_RECEIPT_PNG_BASE64, 'base64');
}

/**
 * Convenience: create an expense via API and return its id. Used by
 * list/filter/update/delete demos that need pre-existing data.
 *
 * Caller must provide a bearer token (typically from
 * registerEphemeralUser() in apps/web/e2e/helpers/test-data.ts).
 */
export async function createExpenseViaApi(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
  input: CreateExpenseInput,
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await request.post(`${apiUrl}/api/v1/expenses`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: input,
    failOnStatusCode: false,
  });
  if (res.status() !== 201) {
    throw new Error(
      `createExpenseViaApi: POST returned ${res.status()}: ${await res.text()}`,
    );
  }
  const body = await res.json();
  const id = body?.data?.expense?.id;
  if (!id) {
    throw new Error(
      `createExpenseViaApi: no id in response: ${JSON.stringify(body)}`,
    );
  }
  return { id, body };
}

/**
 * Best-effort cleanup: delete an expense by id. Swallows errors —
 * the global teardown sweep is the safety net.
 */
export async function deleteExpenseQuiet(
  request: APIRequestContext,
  apiUrl: string,
  accessToken: string,
  id: string,
): Promise<void> {
  try {
    await request.delete(`${apiUrl}/api/v1/expenses/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      failOnStatusCode: false,
    });
  } catch {
    // intentionally ignored
  }
}
