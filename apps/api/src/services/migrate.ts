/**
 * Database Migration Service
 * Runs init.sql and numbered migrations on startup.
 * Uses a _migrations tracking table to avoid re-running.
 */

import { Pool } from 'pg';
import { config } from '../config/index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Locate the repo's database/ directory (init.sql + migrations/).
 *
 * cwd varies by environment: repo root in local dev, but /app/apps/api in the
 * Docker image (Dockerfile.api sets WORKDIR /app/apps/api last) while database/
 * is copied to /app/database. Resolving against cwd alone finds nothing in the
 * image, and the runner then reported "already up to date" having applied
 * nothing — which is how migration 014 (ai_usage_log) never reached production.
 * If no candidate exists we throw rather than silently skip; startServer()
 * catches and logs, so a bad path is loud but non-fatal.
 *
 * Exported for tests.
 */
export function resolveMigrationsDir(cwd: string = process.cwd()): string {
  const candidates = [
    path.resolve(cwd, 'database'),
    path.resolve(cwd, '..', '..', 'database'),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, 'init.sql')) ||
      fs.existsSync(path.join(dir, 'migrations'))
    ) {
      return dir;
    }
  }
  throw new Error(
    `[migrate] database/ directory not found (tried: ${candidates.join(', ')}). ` +
      'Refusing to silently skip migrations.'
  );
}

/**
 * Run all pending migrations against the database.
 * Safe to call on every startup - only runs migrations that haven't been applied.
 */
export async function runMigrations(): Promise<void> {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('[migrate] Starting database migration check...');

    const migrationsRoot = resolveMigrationsDir();
    console.log(`[migrate] Using migrations dir: ${migrationsRoot}`);

    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of already-applied migrations
    const { rows: applied } = await pool.query(
      'SELECT name FROM _migrations ORDER BY name'
    );
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    // Build ordered list of migration files
    const migrationFiles: { name: string; sql: string }[] = [];

    // 1. init.sql (always first)
    const initPath = path.join(migrationsRoot, 'init.sql');
    if (fs.existsSync(initPath)) {
      migrationFiles.push({
        name: '000_init',
        sql: fs.readFileSync(initPath, 'utf-8'),
      });
    }

    // 2. Numbered migrations from migrations/ subfolder
    const migrationsDir = path.join(migrationsRoot, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter((f: string) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const migName = file.replace('.sql', '');
        migrationFiles.push({
          name: migName,
          sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8'),
        });
      }
    }

    // Run any unapplied migrations
    let ranCount = 0;
    for (const migration of migrationFiles) {
      if (appliedSet.has(migration.name)) {
        continue;
      }

      console.log(`[migrate] Applying: ${migration.name}`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [migration.name]
        );
        await client.query('COMMIT');
        console.log(`[migrate] Applied: ${migration.name}`);
        ranCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAILED: ${migration.name}`, err);
        throw err;
      } finally {
        client.release();
      }
    }

    if (ranCount === 0) {
      console.log('[migrate] All migrations already applied. Database is up to date.');
    } else {
      console.log(`[migrate] Successfully applied ${ranCount} migration(s).`);
    }
  } finally {
    await pool.end();
  }
}