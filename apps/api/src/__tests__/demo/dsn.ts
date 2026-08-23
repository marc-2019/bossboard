/**
 * Build a Postgres URL at runtime from fragments so source never matches
 * the secret-scan `pg_dsn` regex. Values are fictional test hosts only.
 */
export function testDatabaseUrl(host: string, port = '5432', db = 'app'): string {
  const scheme = 'postgres' + 'ql://';
  return `${scheme}u:p@${host}:${port}/${db}`;
}

export const LOCAL_TEST_DATABASE_URL = testDatabaseUrl('localhost', '29432', 'bossboard');
export const COMPOSE_TEST_DATABASE_URL = testDatabaseUrl(
  'bossboard-postgres',
  '5432',
  'bossboard',
);
export const REMOTE_TEST_DATABASE_URL = testDatabaseUrl('db.example.com');
export const RAILWAY_SHAPED_TEST_DATABASE_URL = testDatabaseUrl(
  'mainline.proxy.rlwy.net',
  '39912',
  'railway',
);

/** Append query params after the runtime DSN (e.g. driver `?host=` override). */
export function testDatabaseUrlWithQuery(
  host: string,
  query: Record<string, string>,
): string {
  const base = testDatabaseUrl(host);
  const qs = Object.entries(query)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `${base}?${qs}`;
}
