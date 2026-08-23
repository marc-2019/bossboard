/**
 * CLI orchestration: gates must run before any database adapter is opened.
 */

import { runDemoLoader } from '../../demo/cli.js';
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

describe('runDemoLoader', () => {
  it('does not open adapters without DEMO=1', async () => {
    const openAdapters = jest.fn();
    const result = await runDemoLoader(
      allowedEnv({ DEMO: undefined }),
      ['--demo-only'],
      openAdapters,
    );
    expect(result).toEqual({ status: 'noop', reason: 'DEMO!=1' });
    expect(openAdapters).not.toHaveBeenCalled();
  });

  it('does not open adapters without --demo-only', async () => {
    const openAdapters = jest.fn();
    const result = await runDemoLoader(allowedEnv(), [], openAdapters);
    expect(result).toEqual({ status: 'noop', reason: 'missing --demo-only' });
    expect(openAdapters).not.toHaveBeenCalled();
  });

  it('does not open adapters when NODE_ENV=production', async () => {
    const openAdapters = jest.fn();
    const result = await runDemoLoader(
      allowedEnv({ NODE_ENV: 'production' }),
      ['--demo-only'],
      openAdapters,
    );
    expect(result).toEqual({ status: 'noop', reason: 'NODE_ENV=production' });
    expect(openAdapters).not.toHaveBeenCalled();
  });

  it('does not open adapters when DATABASE_URL is not local', async () => {
    const openAdapters = jest.fn();
    const result = await runDemoLoader(
      allowedEnv({
        DATABASE_URL: RAILWAY_SHAPED_TEST_DATABASE_URL,
      }),
      ['--demo-only'],
      openAdapters,
    );
    expect(result).toEqual({
      status: 'noop',
      reason: 'DATABASE_URL is not local',
    });
    expect(openAdapters).not.toHaveBeenCalled();
  });

  it('does not open adapters when process DATABASE_URL is not the gated local target', async () => {
    const openAdapters = jest.fn();
    const result = await runDemoLoader(
      allowedEnv(),
      ['--demo-only'],
      openAdapters,
      {
        NODE_ENV: 'development',
        DATABASE_URL: RAILWAY_SHAPED_TEST_DATABASE_URL,
      },
    );
    expect(result).toEqual({
      status: 'noop',
      reason: 'DATABASE_URL is not local',
    });
    expect(openAdapters).not.toHaveBeenCalled();
  });

  it('does not open adapters when Railway env is set on the process', async () => {
    const openAdapters = jest.fn();
    const result = await runDemoLoader(
      allowedEnv(),
      ['--demo-only'],
      openAdapters,
      {
        NODE_ENV: 'development',
        DATABASE_URL: LOCAL_URL,
        RAILWAY_ENVIRONMENT: 'production',
      },
    );
    expect(result).toEqual({
      status: 'noop',
      reason: 'Railway environment',
    });
    expect(openAdapters).not.toHaveBeenCalled();
  });
});
