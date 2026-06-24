/**
 * Playwright global teardown — E2E test-data lifecycle safety net.
 *
 * Implements the "global teardown sweep" that the e2e helpers
 * (apps/web/e2e/helpers/test-data.ts, demos/helpers/auth.ts) have always
 * referenced as the backstop for cf_standing_directives.e2e-test-data-lifecycle
 * (severity: critical) but which had never actually been wired up.
 *
 * Why this is needed:
 *   The web demo specs establish a real authenticated session by registering
 *   an ephemeral user through the Next proxy (establishWebSession). That
 *   creates a genuine row in `users` (plus any child rows the test touches).
 *   The demos do their assertions against page.route mocks, so they never
 *   call DELETE /account — leaving one leftover account per test. Over a full
 *   suite run that is hundreds of orphaned rows. This sweep deletes them.
 *
 * What it deletes:
 *   Every account whose email matches the e2e tag contract
 *   (`e2e-...@example.test` — see testDataName() / isE2eTagged()). The
 *   `users` table cascades ON DELETE to every child table (swms_documents,
 *   invoices, quotes, expenses, job_logs, photos, teams, certifications,
 *   subscriptions, …), so deleting the user row removes all data that test
 *   created. @example.test is RFC-6761 reserved, so this pattern can never
 *   match a real customer account.
 *
 * Safety:
 *   - Best-effort. Never throws — a teardown failure must not fail the run
 *     (the per-test cleanup callbacks are the first line of defence; this is
 *     the net).
 *   - Pattern is anchored: `e2e-%@example.test`. It cannot touch production
 *     or developer accounts.
 *   - Honours DATABASE_URL; falls back to the local dev DSN. If neither the
 *     DB nor the `pg` driver is reachable (e.g. a mock-only CI shard), it
 *     logs and returns rather than erroring.
 */

import type { FullConfig } from '@playwright/test';

const E2E_EMAIL_PATTERN = 'e2e-%@example.test';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://bossboard:bossboard_dev_2026@localhost:29432/bossboard';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  let Pool: typeof import('pg').Pool;
  try {
    // Lazy require so a mock-only shard without `pg` installed still runs.
    ({ Pool } = await import('pg'));
  } catch {
    console.warn(
      '[e2e teardown] `pg` not available — skipping leftover-account sweep. ' +
        'Per-test cleanup callbacks still apply.',
    );
    return;
  }

  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const res = await pool.query(
      'DELETE FROM users WHERE email LIKE $1 RETURNING id',
      [E2E_EMAIL_PATTERN],
    );
    const n = res.rowCount ?? 0;
    if (n > 0) {
      console.log(
        `[e2e teardown] Swept ${n} leftover e2e account(s) (cascade-deleted their data).`,
      );
    } else {
      console.log('[e2e teardown] No leftover e2e accounts — clean.');
    }
  } catch (err) {
    // Best-effort: never fail the run on teardown. Surface for visibility.
    console.warn(
      `[e2e teardown] Leftover-account sweep skipped (${(err as Error).message}). ` +
        'Per-test cleanup callbacks remain the first line of defence.',
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
