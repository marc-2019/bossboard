/**
 * Demo books writer — gate + owner tests.
 *
 * The writer must never attach rows to a non-demo user_id, and must no-op
 * when any gate fails. Sinks are injected so these tests never open a
 * DATABASE_URL (including Railway).
 */

import { loadDemoBooks, type DemoBooksSink } from '../../demo/writer.js';
import { NZ_CUSTOMERS, DEMO_PERSONA, NZ_TRADIE_JOB_SITES } from '../../demo/fixtures.js';
import { isReservedTestEmail } from '../../demo/reserved-email.js';
import {
  LOCAL_TEST_DATABASE_URL,
  RAILWAY_SHAPED_TEST_DATABASE_URL,
} from './dsn.js';

const DEMO_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const LOCAL_URL = LOCAL_TEST_DATABASE_URL;

function allowedEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    DEMO: '1',
    NODE_ENV: 'development',
    DATABASE_URL: LOCAL_URL,
    DEMO_USER_ID,
    ...overrides,
  };
}

function makeSink(): DemoBooksSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    insertCustomer: jest.fn(async (row) => {
      calls.push(`customer:${row.userId}`);
    }),
    insertInvoice: jest.fn(async (row) => {
      calls.push(`invoice:${row.userId}`);
    }),
    insertJobLog: jest.fn(async (row) => {
      calls.push(`job_log:${row.userId}`);
    }),
    insertSwms: jest.fn(async (row) => {
      calls.push(`swms:${row.userId}`);
    }),
  };
}

describe('loadDemoBooks', () => {
  it('no-ops without DEMO=1 and does not write', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv({ DEMO: undefined }),
      argv: ['--demo-only'],
      demoUserId: DEMO_USER_ID,
      attachToUserId: DEMO_USER_ID,
      sink,
    });
    expect(result).toEqual({ wrote: false, reason: 'DEMO!=1' });
    expect(sink.calls).toEqual([]);
  });

  it('no-ops without --demo-only and does not write', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv(),
      argv: [],
      demoUserId: DEMO_USER_ID,
      attachToUserId: DEMO_USER_ID,
      sink,
    });
    expect(result).toEqual({ wrote: false, reason: 'missing --demo-only' });
    expect(sink.calls).toEqual([]);
  });

  it('no-ops when NODE_ENV=production and does not write', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv({ NODE_ENV: 'production' }),
      argv: ['--demo-only'],
      demoUserId: DEMO_USER_ID,
      attachToUserId: DEMO_USER_ID,
      sink,
    });
    expect(result).toEqual({ wrote: false, reason: 'NODE_ENV=production' });
    expect(sink.calls).toEqual([]);
  });

  it('no-ops when DATABASE_URL is not local and does not write', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv({
        DATABASE_URL: RAILWAY_SHAPED_TEST_DATABASE_URL,
      }),
      argv: ['--demo-only'],
      demoUserId: DEMO_USER_ID,
      attachToUserId: DEMO_USER_ID,
      sink,
    });
    expect(result).toEqual({
      wrote: false,
      reason: 'DATABASE_URL is not local',
    });
    expect(sink.calls).toEqual([]);
  });

  it('refuses to attach rows to a non-demo user_id', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv(),
      argv: ['--demo-only'],
      demoUserId: DEMO_USER_ID,
      attachToUserId: OTHER_USER_ID,
      sink,
    });
    expect(result).toEqual({
      wrote: false,
      reason: 'refusing non-demo user_id',
    });
    expect(sink.calls).toEqual([]);
  });

  it('refuses when attachToUserId does not match DEMO_USER_ID env', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv({ DEMO_USER_ID }),
      argv: ['--demo-only'],
      demoUserId: OTHER_USER_ID,
      attachToUserId: OTHER_USER_ID,
      sink,
    });
    expect(result).toEqual({
      wrote: false,
      reason: 'refusing non-demo user_id',
    });
    expect(sink.calls).toEqual([]);
  });

  it('when gates pass, attaches fixture rows only to the demo user_id', async () => {
    const sink = makeSink();
    const result = await loadDemoBooks({
      env: allowedEnv(),
      argv: ['node', 'cli.ts', '--demo-only'],
      demoUserId: DEMO_USER_ID,
      attachToUserId: DEMO_USER_ID,
      sink,
    });
    expect(result).toEqual({
      wrote: true,
      attachedUserId: DEMO_USER_ID,
    });
    expect(sink.calls.length).toBeGreaterThan(0);
    expect(sink.calls.every((c) => c.endsWith(`:${DEMO_USER_ID}`))).toBe(true);
    expect(sink.calls.some((c) => c.includes(OTHER_USER_ID))).toBe(false);

    const customerMock = sink.insertCustomer as jest.Mock;
    expect(customerMock).toHaveBeenCalled();
    for (const [row] of customerMock.mock.calls) {
      expect(row.userId).toBe(DEMO_USER_ID);
      expect(NZ_CUSTOMERS.some((c) => c.name === row.name)).toBe(true);
      expect(isReservedTestEmail(String(row.email))).toBe(true);
    }

    const jobMock = sink.insertJobLog as jest.Mock;
    expect(jobMock).toHaveBeenCalled();
    for (const [row] of jobMock.mock.calls) {
      expect(row.userId).toBe(DEMO_USER_ID);
      expect(
        NZ_TRADIE_JOB_SITES.some((s) => s.description === row.description),
      ).toBe(true);
    }

    expect(DEMO_PERSONA.email).toMatch(/@example\.test$/);
  });
});
