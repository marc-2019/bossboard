/**
 * Demo write-gate tests.
 *
 * The loader must no-op unless every gate passes. These tests exercise the
 * pure gate so a production / Railway DATABASE_URL can never look "allowed".
 */

import {
  evaluateDemoWriteGate,
  isLocalDatabaseUrl,
} from '../../demo/gates.js';
import {
  COMPOSE_TEST_DATABASE_URL,
  LOCAL_TEST_DATABASE_URL,
  RAILWAY_SHAPED_TEST_DATABASE_URL,
  REMOTE_TEST_DATABASE_URL,
  testDatabaseUrl,
} from './dsn.js';

const LOCAL_URL = LOCAL_TEST_DATABASE_URL;
const COMPOSE_URL = COMPOSE_TEST_DATABASE_URL;
const RAILWAY_URL = RAILWAY_SHAPED_TEST_DATABASE_URL;

function allowedInput(
  overrides: Partial<{
    demo: string | undefined;
    demoOnly: boolean;
    nodeEnv: string | undefined;
    databaseUrl: string | undefined;
  }> = {},
) {
  return {
    demo: '1',
    demoOnly: true,
    nodeEnv: 'development',
    databaseUrl: LOCAL_URL,
    ...overrides,
  };
}

describe('isLocalDatabaseUrl', () => {
  it('accepts localhost and 127.0.0.1', () => {
    expect(isLocalDatabaseUrl(LOCAL_URL)).toBe(true);
    expect(isLocalDatabaseUrl(testDatabaseUrl('127.0.0.1', '29432', 'bossboard'))).toBe(
      true,
    );
  });

  it('accepts the docker compose host bossboard-postgres', () => {
    expect(isLocalDatabaseUrl(COMPOSE_URL)).toBe(true);
  });

  it('rejects Railway and other remote hosts', () => {
    expect(isLocalDatabaseUrl(RAILWAY_URL)).toBe(false);
    expect(isLocalDatabaseUrl(REMOTE_TEST_DATABASE_URL)).toBe(false);
  });

  it('rejects missing or unparseable URLs', () => {
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl('')).toBe(false);
    expect(isLocalDatabaseUrl('not-a-url')).toBe(false);
  });
});

describe('evaluateDemoWriteGate', () => {
  it('allows only DEMO=1 + --demo-only + non-production + local DATABASE_URL', () => {
    expect(evaluateDemoWriteGate(allowedInput())).toEqual({ allowed: true });
  });

  it('no-ops without DEMO=1', () => {
    expect(evaluateDemoWriteGate(allowedInput({ demo: undefined }))).toEqual({
      allowed: false,
      reason: 'DEMO!=1',
    });
    expect(evaluateDemoWriteGate(allowedInput({ demo: 'true' }))).toEqual({
      allowed: false,
      reason: 'DEMO!=1',
    });
    expect(evaluateDemoWriteGate(allowedInput({ demo: '0' }))).toEqual({
      allowed: false,
      reason: 'DEMO!=1',
    });
  });

  it('no-ops without --demo-only', () => {
    expect(evaluateDemoWriteGate(allowedInput({ demoOnly: false }))).toEqual({
      allowed: false,
      reason: 'missing --demo-only',
    });
  });

  it('no-ops when NODE_ENV=production', () => {
    expect(
      evaluateDemoWriteGate(allowedInput({ nodeEnv: 'production' })),
    ).toEqual({
      allowed: false,
      reason: 'NODE_ENV=production',
    });
  });

  it('no-ops when DATABASE_URL is not local (including Railway)', () => {
    expect(
      evaluateDemoWriteGate(allowedInput({ databaseUrl: RAILWAY_URL })),
    ).toEqual({
      allowed: false,
      reason: 'DATABASE_URL is not local',
    });
  });

  it('production wins even if DEMO=1, --demo-only, and URL look local', () => {
    expect(
      evaluateDemoWriteGate(
        allowedInput({ nodeEnv: 'production', databaseUrl: LOCAL_URL }),
      ),
    ).toEqual({
      allowed: false,
      reason: 'NODE_ENV=production',
    });
  });
});
