/**
 * Gated local demo loader CLI.
 *
 *   DEMO=1 DEMO_USER_EMAIL=... DEMO_USER_PASSWORD=... npm run demo:load -- --demo-only
 *
 * No-ops unless DEMO=1 and --demo-only. No-ops on NODE_ENV=production and on
 * a non-local DATABASE_URL. Does not open Postgres until every gate passes.
 * Credentials stay in env — never commit them.
 */

import { gateFromEnv } from './gates.js';
import { ensureDemoUser, type DemoUserStore } from './ensure-demo-user.js';
import { loadDemoBooks, type DemoBooksSink } from './writer.js';

export type DemoLoaderAdapters = {
  store: DemoUserStore;
  sink: DemoBooksSink;
  close?: () => Promise<void>;
};

export type RunDemoLoaderResult =
  | { status: 'noop'; reason: string }
  | { status: 'loaded'; userId: string };

export async function runDemoLoader(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
  openAdapters?: () => Promise<DemoLoaderAdapters>,
): Promise<RunDemoLoaderResult> {
  const gate = gateFromEnv(env, argv);
  if (!gate.allowed) {
    return { status: 'noop', reason: gate.reason };
  }

  const open =
    openAdapters ??
    (async () => {
      const mod = await import('./pg-adapters.js');
      return {
        store: mod.createPgUserStore(),
        sink: mod.createPgSink(),
        close: mod.closeDemoDb,
      };
    });

  const adapters = await open();
  try {
    const ensured = await ensureDemoUser({ env, argv, store: adapters.store });
    if ('reason' in ensured) {
      return { status: 'noop', reason: ensured.reason };
    }
    const written = await loadDemoBooks({
      env,
      argv,
      demoUserId: ensured.userId,
      attachToUserId: ensured.userId,
      sink: adapters.sink,
    });
    if (!written.wrote) {
      return { status: 'noop', reason: written.reason };
    }
    return { status: 'loaded', userId: written.attachedUserId };
  } finally {
    if (adapters.close) {
      await adapters.close();
    }
  }
}

function isDirectRun(): boolean {
  const invoked = process.argv[1]?.replace(/\\/g, '/') ?? '';
  return /\/demo\/cli(?:\.ts|\.js)?$/.test(invoked);
}

async function main(): Promise<void> {
  const result = await runDemoLoader();
  if (result.status === 'noop') {
    console.log(`[demo] no-op: ${result.reason}`);
    return;
  }
  console.log(`[demo] loaded fictional books for demo user_id=${result.userId}`);
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    console.error('[demo] failed');
    if (err instanceof Error) {
      console.error(err.message);
    }
    process.exitCode = 1;
  });
}
