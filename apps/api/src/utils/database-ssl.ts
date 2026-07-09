/**
 * Decide whether the pg Pool should use TLS.
 *
 * Defaults:
 * - production + non-localhost URL → SSL on (encrypt in transit)
 * - development / localhost → SSL off (local Docker Postgres)
 *
 * Certificate verification:
 * - Railway public proxies present a chain Node treats as self-signed
 *   ("self-signed certificate in certificate chain"). For those hosts we
 *   still use TLS but default rejectUnauthorized=false (traffic encrypted;
 *   MITM risk is the platform path).
 * - Other remote hosts default rejectUnauthorized=true.
 *
 * Overrides:
 * - DATABASE_SSL=true|false force on/off
 * - DATABASE_SSL_REJECT_UNAUTHORIZED=true|false force verify mode
 */

export type PoolSslOption = false | { rejectUnauthorized: boolean };

function isLocalHost(databaseUrl: string): boolean {
  return /(@|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(databaseUrl);
}

/** Railway / similar PaaS proxies with platform-managed cert chains. */
function isManagedPaaSProxy(databaseUrl: string): boolean {
  return /\.(rlwy\.net|railway\.(app|internal)|render\.com|supabase\.co)(:|\/|$)/i.test(
    databaseUrl
  );
}

export function resolvePoolSsl(
  databaseUrl: string,
  nodeEnv: string,
  env: NodeJS.ProcessEnv = process.env
): PoolSslOption {
  const flag = (env.DATABASE_SSL || '').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') {
    return false;
  }

  const rejectEnv = (env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase();
  let rejectUnauthorized: boolean;
  if (rejectEnv === 'true' || rejectEnv === '1') {
    rejectUnauthorized = true;
  } else if (rejectEnv === 'false' || rejectEnv === '0') {
    rejectUnauthorized = false;
  } else {
    // Default: strict verify unless known PaaS proxy cert chain
    rejectUnauthorized = !isManagedPaaSProxy(databaseUrl);
  }

  if (flag === 'true' || flag === '1' || flag === 'on' || flag === 'require') {
    return { rejectUnauthorized };
  }

  if (nodeEnv === 'production' && !isLocalHost(databaseUrl)) {
    return { rejectUnauthorized };
  }

  return false;
}

export default resolvePoolSsl;
