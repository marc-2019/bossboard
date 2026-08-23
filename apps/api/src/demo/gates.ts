/**
 * Demo writer gates.
 *
 * Writes no-op unless DEMO=1 AND --demo-only, and always no-op on
 * NODE_ENV=production, a Railway environment, or a DATABASE_URL whose
 * *driver* connect target is not loopback. Query overrides (`host`,
 * `hostaddr`, `port`) are rejected so a localhost hostname cannot hide a
 * remote pg-connection-string target.
 */

export const LOOPBACK_DB_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

const CONNECT_OVERRIDE_PARAMS = ['host', 'hostaddr', 'port'] as const;

const RAILWAY_ENV_KEYS = [
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_STATIC_URL',
] as const;

export type DemoWriteGateInput = {
  demo: string | undefined;
  demoOnly: boolean;
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
  railway?: boolean;
};

export type DemoWriteGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

function asHttpUrl(databaseUrl: string): URL | null {
  try {
    return new URL(databaseUrl.replace(/^postgres(?:ql)?:/i, 'http:'));
  } catch {
    return null;
  }
}

/** Same host/port the node-pg / pg-connection-string parser will use. */
export function driverConnectTarget(
  databaseUrl: string | undefined,
): { host: string; port: string } | null {
  if (!databaseUrl) return null;
  const url = asHttpUrl(databaseUrl);
  if (!url) return null;
  const queryHost =
    url.searchParams.get('host') || url.searchParams.get('hostaddr');
  const host = (queryHost || url.hostname || '').toLowerCase();
  const port = url.searchParams.get('port') || url.port || '';
  if (!host) return null;
  return { host, port };
}

export function hasConnectQueryOverride(
  databaseUrl: string | undefined,
): boolean {
  if (!databaseUrl) return false;
  const url = asHttpUrl(databaseUrl);
  if (!url) return true;
  return CONNECT_OVERRIDE_PARAMS.some((key) => url.searchParams.has(key));
}

export function hostnameFromDatabaseUrl(
  databaseUrl: string | undefined,
): string | null {
  return driverConnectTarget(databaseUrl)?.host ?? null;
}

export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  if (hasConnectQueryOverride(databaseUrl)) return false;
  const target = driverConnectTarget(databaseUrl);
  if (!target) return false;
  return LOOPBACK_DB_HOSTS.has(target.host);
}

export function looksLikeRailwayEnv(env: NodeJS.ProcessEnv): boolean {
  return RAILWAY_ENV_KEYS.some((key) => Boolean(env[key]));
}

export function hasDemoOnlyFlag(argv: string[]): boolean {
  return argv.includes('--demo-only');
}

export function evaluateDemoWriteGate(
  input: DemoWriteGateInput,
): DemoWriteGateResult {
  if (input.nodeEnv === 'production') {
    return { allowed: false, reason: 'NODE_ENV=production' };
  }
  if (input.railway) {
    return { allowed: false, reason: 'Railway environment' };
  }
  if (input.demo !== '1') {
    return { allowed: false, reason: 'DEMO!=1' };
  }
  if (!input.demoOnly) {
    return { allowed: false, reason: 'missing --demo-only' };
  }
  if (!isLocalDatabaseUrl(input.databaseUrl)) {
    return { allowed: false, reason: 'DATABASE_URL is not local' };
  }
  return { allowed: true };
}

export function gateFromEnv(
  env: NodeJS.ProcessEnv,
  argv: string[],
): DemoWriteGateResult {
  return evaluateDemoWriteGate({
    demo: env.DEMO,
    demoOnly: hasDemoOnlyFlag(argv),
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    railway: looksLikeRailwayEnv(env),
  });
}

/**
 * The pg pool reads process-level env via config. Refuse when that connect
 * target is unsafe or differs from the gated DATABASE_URL's driver host.
 */
export function assertSafeProcessTarget(
  gatedEnv: NodeJS.ProcessEnv,
  processEnv: NodeJS.ProcessEnv,
): DemoWriteGateResult {
  if (processEnv.NODE_ENV === 'production') {
    return { allowed: false, reason: 'NODE_ENV=production' };
  }
  if (looksLikeRailwayEnv(processEnv)) {
    return { allowed: false, reason: 'Railway environment' };
  }
  if (!isLocalDatabaseUrl(processEnv.DATABASE_URL)) {
    return { allowed: false, reason: 'DATABASE_URL is not local' };
  }
  const gated = driverConnectTarget(gatedEnv.DATABASE_URL);
  const actual = driverConnectTarget(processEnv.DATABASE_URL);
  if (!gated || !actual || gated.host !== actual.host) {
    return {
      allowed: false,
      reason: 'DATABASE_URL does not match process connect target',
    };
  }
  return { allowed: true };
}
