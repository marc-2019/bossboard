/**
 * Migration directory resolution tests
 *
 * Guards against the silent-no-op regression where the migration runner
 * resolved database/ against process.cwd() only: in the Docker image the
 * cwd is /app/apps/api while database/ lives at /app/database, so the
 * runner found zero migration files and logged "already up to date"
 * without applying anything (root cause of ai_usage_log missing in prod).
 * Covers:
 *   - resolution from the repo root (local dev layout)
 *   - resolution from apps/api (Docker image layout, two levels up)
 *   - loud failure instead of silent skip when no database/ dir exists
 */

import * as path from 'path';
import { resolveMigrationsDir } from '../../services/migrate.js';

describe('resolveMigrationsDir', () => {
  // apps/api/src/__tests__/services → repo root is five levels up
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

  it('resolves database/ as a direct child of cwd (repo root layout)', () => {
    expect(resolveMigrationsDir(repoRoot)).toBe(path.join(repoRoot, 'database'));
  });

  it('resolves database/ two levels up from cwd (Docker /app/apps/api layout)', () => {
    const dockerStyleCwd = path.join(repoRoot, 'apps', 'api');
    expect(resolveMigrationsDir(dockerStyleCwd)).toBe(path.join(repoRoot, 'database'));
  });

  it('throws instead of silently skipping when no database/ dir is findable', () => {
    // Deep path so BOTH candidates (cwd/database and cwd/../../database)
    // land under the nonexistent root, whatever the host filesystem holds.
    expect(() =>
      resolveMigrationsDir('/nonexistent-migrate-dir-test/a/b')
    ).toThrow(/database\/ directory not found/);
  });
});
