/**
 * Feedback Service Tests
 *
 * Covers:
 *   - createFeedback: required fields only, all optional fields, null mapping
 *   - listFeedback: no filters, status/category filters, pagination, total parsing
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

import { createFeedback, listFeedback } from '../../services/feedback.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fb-1',
    user_id: 'user-1',
    category: 'bug',
    rating: null,
    message: 'Quote PDF cuts off the last line item',
    page_context: '/quotes',
    app_version: 'web-0.5.1',
    status: 'new',
    created_at: '2026-07-08T08:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

// ---------------------------------------------------------------------------
// createFeedback
// ---------------------------------------------------------------------------

describe('createFeedback', () => {
  it('inserts with required fields and nulls the optionals', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ page_context: null, app_version: null })] });

    const result = await createFeedback('user-1', {
      category: 'bug',
      message: 'Quote PDF cuts off the last line item',
    });

    expect(result.id).toBe('fb-1');
    expect(result.userId).toBe('user-1');
    expect(result.rating).toBeNull();
    expect(result.pageContext).toBeNull();
    expect(result.appVersion).toBeNull();
    expect(result.status).toBe('new');

    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO feedback');
    expect(params).toEqual([
      'user-1',
      'bug',
      null,
      'Quote PDF cuts off the last line item',
      null,
      null,
    ]);
  });

  it('inserts all optional fields when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow({ rating: 4, category: 'idea' })] });

    const result = await createFeedback('user-1', {
      category: 'idea',
      message: 'Add GST summary to dashboard',
      rating: 4,
      pageContext: '/dashboard',
      appVersion: 'ios-0.5.0',
    });

    expect(result.rating).toBe(4);
    expect(result.category).toBe('idea');

    const [, params] = mockDbQuery.mock.calls[0];
    expect(params).toEqual([
      'user-1',
      'idea',
      4,
      'Add GST summary to dashboard',
      '/dashboard',
      'ios-0.5.0',
    ]);
  });

  it('maps a Date created_at to ISO string', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeRow({ created_at: new Date('2026-07-08T08:00:00.000Z') })],
    });

    const result = await createFeedback('user-1', { category: 'other', message: 'hi' });

    expect(result.createdAt).toBe('2026-07-08T08:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// listFeedback
// ---------------------------------------------------------------------------

describe('listFeedback', () => {
  it('lists with defaults (no filters, limit 50, offset 0)', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'fb-2' })] });

    const result = await listFeedback('user-1');

    expect(result.total).toBe(2);
    expect(result.feedback).toHaveLength(2);
    expect(result.feedback[1].id).toBe('fb-2');

    const [listSql, listParams] = mockDbQuery.mock.calls[1];
    expect(listSql).toContain('WHERE user_id = $1');
    expect(listSql).toContain('ORDER BY created_at DESC');
    expect(listParams).toEqual(['user-1', 50, 0]);
  });

  it('applies status and category filters with pagination', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listFeedback('user-1', { status: 'new', category: 'bug', limit: 10, offset: 5 });

    const [countSql, countParams] = mockDbQuery.mock.calls[0];
    expect(countSql).toContain('AND status = $2');
    expect(countSql).toContain('AND category = $3');
    expect(countParams).toEqual(['user-1', 'new', 'bug']);

    const [, listParams] = mockDbQuery.mock.calls[1];
    expect(listParams).toEqual(['user-1', 'new', 'bug', 10, 5]);
  });
});
