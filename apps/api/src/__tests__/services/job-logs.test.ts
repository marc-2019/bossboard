/**
 * Job Logs Service Tests
 *
 * Time-tracking service for job sites. Covers:
 *   - createJobLog: defaults (start_time, optional fields), explicit fields
 *   - getJobLog: found + not-found (404)
 *   - listJobLogs: no filters, every filter (status/customer/date range), pagination, total parsing
 *   - getActiveJobLog: active row found + none
 *   - updateJobLog: field updates, no-op (empty input), ownership check
 *   - clockOut: success, not-active guard (400), with/without notes
 *   - deleteJobLog: success + not-found (404)
 *   - getJobLogStats: aggregate parsing + rounding
 */

// ---------------------------------------------------------------------------
// Mocks — must appear before imports that trigger module evaluation
// ---------------------------------------------------------------------------

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

import {
  createJobLog,
  getJobLog,
  listJobLogs,
  getActiveJobLog,
  updateJobLog,
  clockOut,
  deleteJobLog,
  getJobLogStats,
} from '../../services/job-logs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    user_id: 'user-1',
    description: 'Bathroom reno',
    site_address: '12 Queen St',
    customer_id: 'cust-1',
    start_time: '2026-01-10T08:00:00.000Z',
    end_time: null,
    status: 'active',
    notes: null,
    created_at: '2026-01-10T08:00:00.000Z',
    updated_at: '2026-01-10T08:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

// ---------------------------------------------------------------------------
// createJobLog
// ---------------------------------------------------------------------------

describe('createJobLog', () => {
  it('inserts with explicit fields and maps the row', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });

    const result = await createJobLog('user-1', {
      description: 'Bathroom reno',
      siteAddress: '12 Queen St',
      customerId: 'cust-1',
      startTime: '2026-01-10T08:00:00.000Z',
      notes: 'urgent',
    });

    expect(result.id).toBe('job-1');
    expect(result.userId).toBe('user-1');
    expect(result.status).toBe('active');
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('Bathroom reno');
    expect(params[2]).toBe('12 Queen St');
    expect(params[4]).toBe('2026-01-10T08:00:00.000Z');
    expect(params[5]).toBe('urgent');
  });

  it('defaults optional fields to null and start_time to now', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ site_address: null, customer_id: null, notes: null })] });

    await createJobLog('user-1', { description: 'Quick job' });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBeNull(); // siteAddress
    expect(params[3]).toBeNull(); // customerId
    expect(typeof params[4]).toBe('string'); // start_time defaulted to ISO string
    expect(params[5]).toBeNull(); // notes
  });
});

// ---------------------------------------------------------------------------
// getJobLog
// ---------------------------------------------------------------------------

describe('getJobLog', () => {
  it('returns the mapped job log when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await getJobLog('user-1', 'job-1');
    expect(result.id).toBe('job-1');
    expect(result.siteAddress).toBe('12 Queen St');
  });

  it('throws 404 when not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(getJobLog('user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'JOB_LOG_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// listJobLogs
// ---------------------------------------------------------------------------

describe('listJobLogs', () => {
  it('lists with no filters and default pagination', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // count
      .mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'job-2' })] }); // page

    const { jobLogs, total } = await listJobLogs('user-1');

    expect(total).toBe(2);
    expect(jobLogs).toHaveLength(2);
    const pageParams = mockDbQuery.mock.calls[1][1] as unknown[];
    // [userId, limit, offset]
    expect(pageParams).toEqual(['user-1', 50, 0]);
  });

  it('applies all filters and custom pagination', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });

    await listJobLogs('user-1', {
      status: 'completed',
      customerId: 'cust-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      limit: 10,
      offset: 20,
    });

    const countSql = mockDbQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('status = $2');
    expect(countSql).toContain('customer_id = $3');
    expect(countSql).toContain('start_time >= $4');
    expect(countSql).toContain('start_time <= $5');
    const pageParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(pageParams.slice(-2)).toEqual([10, 20]);
  });
});

// ---------------------------------------------------------------------------
// getActiveJobLog
// ---------------------------------------------------------------------------

describe('getActiveJobLog', () => {
  it('returns the active job log', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ status: 'active' })] });
    const result = await getActiveJobLog('user-1');
    expect(result?.status).toBe('active');
  });

  it('returns null when no active job', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getActiveJobLog('user-1');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateJobLog
// ---------------------------------------------------------------------------

describe('updateJobLog', () => {
  it('updates provided fields after ownership check', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow()] }) // getJobLog ownership
      .mockResolvedValueOnce({ rows: [makeRow({ description: 'Updated' })] }); // update

    const result = await updateJobLog('user-1', 'job-1', {
      description: 'Updated',
      siteAddress: '99 New Rd',
      customerId: null,
      notes: 'extra',
    });

    expect(result.description).toBe('Updated');
    const updateSql = mockDbQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain('description = $1');
    expect(updateSql).toContain('site_address = $2');
    expect(updateSql).toContain('customer_id = $3');
    expect(updateSql).toContain('notes = $4');
  });

  it('returns existing log when no fields supplied (re-fetches)', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow()] }) // ownership check
      .mockResolvedValueOnce({ rows: [makeRow()] }); // getJobLog re-fetch

    const result = await updateJobLog('user-1', 'job-1', {});
    expect(result.id).toBe('job-1');
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
  });

  it('propagates 404 from the ownership check', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(updateJobLog('user-1', 'missing', { notes: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ---------------------------------------------------------------------------
// clockOut
// ---------------------------------------------------------------------------

describe('clockOut', () => {
  it('clocks out an active job with notes', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow({ status: 'active' })] }) // getJobLog
      .mockResolvedValueOnce({ rows: [makeRow({ status: 'completed', end_time: '2026-01-10T10:00:00.000Z' })] });

    const result = await clockOut('user-1', 'job-1', 'finished early');
    expect(result.status).toBe('completed');
    const updateSql = mockDbQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain("status = 'completed'");
    expect(updateSql).toContain('notes = $1');
  });

  it('clocks out without notes', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow({ status: 'active' })] })
      .mockResolvedValueOnce({ rows: [makeRow({ status: 'completed' })] });

    await clockOut('user-1', 'job-1');
    const updateSql = mockDbQuery.mock.calls[1][0] as string;
    expect(updateSql).not.toContain('notes = $1');
  });

  it('rejects clocking out a non-active job (400)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ status: 'completed' })] });
    await expect(clockOut('user-1', 'job-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'JOB_LOG_NOT_ACTIVE',
    });
  });
});

// ---------------------------------------------------------------------------
// deleteJobLog
// ---------------------------------------------------------------------------

describe('deleteJobLog', () => {
  it('deletes when a row is affected', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
    await expect(deleteJobLog('user-1', 'job-1')).resolves.toBeUndefined();
  });

  it('throws 404 when nothing deleted', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(deleteJobLog('user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'JOB_LOG_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// getJobLogStats
// ---------------------------------------------------------------------------

describe('getJobLogStats', () => {
  it('parses aggregates and rounds hours to 1dp', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ total: '5', this_week: '2', active_count: '1', hours_this_week: '12.345' }],
    });

    const stats = await getJobLogStats('user-1');
    expect(stats).toEqual({
      totalLogs: 5,
      thisWeek: 2,
      activeLog: true,
      totalHoursThisWeek: 12.3,
    });
  });

  it('reports no active log when active_count is 0', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ total: '0', this_week: '0', active_count: '0', hours_this_week: '0' }],
    });
    const stats = await getJobLogStats('user-1');
    expect(stats.activeLog).toBe(false);
    expect(stats.totalHoursThisWeek).toBe(0);
  });
});
