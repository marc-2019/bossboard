/**
 * ensureDemoUser — create/find the dedicated demo login.
 *
 * Credentials come from env only (never committed). Collaborators are
 * injected so this never opens a remote DATABASE_URL.
 */

import { ensureDemoUser, type DemoUserInsert } from '../../demo/ensure-demo-user.js';
import { DEMO_PERSONA } from '../../demo/fixtures.js';
import {
  LOCAL_TEST_DATABASE_URL,
  RAILWAY_SHAPED_TEST_DATABASE_URL,
} from './dsn.js';

const DEMO_USER_ID = '11111111-1111-4111-8111-111111111111';
const LOCAL_URL = LOCAL_TEST_DATABASE_URL;

function allowedEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    DEMO: '1',
    NODE_ENV: 'development',
    DATABASE_URL: LOCAL_URL,
    DEMO_USER_EMAIL: 'mike.tane@example.test',
    DEMO_USER_PASSWORD: 'env-only-placeholder-not-committed',
    DEMO_USER_ID,
    ...overrides,
  };
}

function makeStore() {
  return {
    findUserByEmail: jest.fn(async () => null as { id: string } | null),
    insertUser: jest.fn(async (row: DemoUserInsert) => ({ id: row.id })),
    hashPassword: jest.fn(async (pw: string) => `hashed:${pw}`),
  };
}

describe('ensureDemoUser', () => {
  it('no-ops without DEMO=1', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv({ DEMO: undefined }),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({ created: false, reason: 'DEMO!=1' });
    expect(store.findUserByEmail).not.toHaveBeenCalled();
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('no-ops without --demo-only', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv(),
      argv: [],
      store,
    });
    expect(result).toEqual({ created: false, reason: 'missing --demo-only' });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('no-ops when NODE_ENV=production', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv({ NODE_ENV: 'production' }),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({ created: false, reason: 'NODE_ENV=production' });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('no-ops when DATABASE_URL is not local', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv({
        DATABASE_URL: RAILWAY_SHAPED_TEST_DATABASE_URL,
      }),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({
      created: false,
      reason: 'DATABASE_URL is not local',
    });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('refuses a non-reserved email even when gates pass', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv({ DEMO_USER_EMAIL: 'someone@gmail.com' }),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({
      created: false,
      reason: 'DEMO_USER_EMAIL must be a reserved test address',
    });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('refuses when password is missing from env', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv({ DEMO_USER_PASSWORD: undefined }),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({
      created: false,
      reason: 'DEMO_USER_PASSWORD is not set',
    });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('refuses when DEMO_USER_ID is not set', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv({ DEMO_USER_ID: undefined }),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({
      created: false,
      reason: 'DEMO_USER_ID is not set',
    });
    expect(store.findUserByEmail).not.toHaveBeenCalled();
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('refuses an existing email whose user_id is not the demo user_id', async () => {
    const store = makeStore();
    store.findUserByEmail.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
    });
    const result = await ensureDemoUser({
      env: allowedEnv(),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({
      created: false,
      reason: 'refusing non-demo user_id',
    });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('returns the existing demo user_id without inserting', async () => {
    const store = makeStore();
    store.findUserByEmail.mockResolvedValueOnce({ id: DEMO_USER_ID });
    const result = await ensureDemoUser({
      env: allowedEnv(),
      argv: ['--demo-only'],
      store,
    });
    expect(result).toEqual({ created: false, userId: DEMO_USER_ID });
    expect(store.insertUser).not.toHaveBeenCalled();
  });

  it('creates the dedicated demo login from env + fictional persona only', async () => {
    const store = makeStore();
    const result = await ensureDemoUser({
      env: allowedEnv(),
      argv: ['node', 'cli.ts', '--demo-only'],
      store,
    });
    expect(result).toEqual({ created: true, userId: DEMO_USER_ID });
    expect(store.hashPassword).toHaveBeenCalledWith(
      'env-only-placeholder-not-committed',
    );
    expect(store.insertUser).toHaveBeenCalledTimes(1);
    const row = store.insertUser.mock.calls[0][0];
    expect(row.id).toBe(DEMO_USER_ID);
    expect(row.email).toBe('mike.tane@example.test');
    expect(row.name).toBe(DEMO_PERSONA.name);
    expect(row.businessName).toBe(DEMO_PERSONA.businessName);
    expect(row.tradeType).toBe(DEMO_PERSONA.tradeType);
    expect(row.passwordHash).toBe(
      'hashed:env-only-placeholder-not-committed',
    );
  });
});
