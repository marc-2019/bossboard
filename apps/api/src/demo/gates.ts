/**
 * Demo writer gates.
 *
 * Writes no-op unless DEMO=1 AND --demo-only, and always no-op on
 * NODE_ENV=production or a non-local DATABASE_URL. Local means localhost /
 * loopback / the docker compose host `bossboard-postgres` only.
 */

export const LOCAL_DB_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'bossboard-postgres',
]);

export type DemoWriteGateInput = {
  demo: string | undefined;
  demoOnly: boolean;
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
};

export type DemoWriteGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function hostnameFromDatabaseUrl(
  databaseUrl: string | undefined,
): string | null {
  if (!databaseUrl) return null;
  try {
    const normalized = databaseUrl.replace(/^postgres(?:ql)?:/i, 'http:');
    const host = new URL(normalized).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  const host = hostnameFromDatabaseUrl(databaseUrl);
  if (!host) return false;
  return LOCAL_DB_HOSTS.has(host);
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
  });
}
