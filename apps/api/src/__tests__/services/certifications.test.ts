/**
 * Certifications Service Tests
 *
 * Validates business logic for trade license and certification management,
 * including expiry tracking — a core compliance differentiator for BossBoard.
 *
 * Coverage targets:
 *   - createCertification: inserts row and returns mobile-friendly shape
 *   - getCertificationById: found / not found (ownership enforced)
 *   - listCertifications: count + items, pagination, default limit
 *   - updateCertification: field mapping, no-op (empty updates), not found
 *   - deleteCertification: found / not found
 *   - getExpiringCertifications: returns ordered rows
 *   - getCertificationStats: parses aggregate ints correctly
 */

// ---------------------------------------------------------------------------
// Mocks — must appear before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createCertification,
  getCertificationById,
  listCertifications,
  updateCertification,
  deleteCertification,
  getExpiringCertifications,
  getCertificationStats,
} from '../../services/certifications.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-06-01T00:00:00Z');

/** Minimal DB row matching the certifications table schema */
function makeDbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cert-uuid-1',
    user_id: 'user-1',
    type: 'electrical',
    name: 'Electrical Licence',
    cert_number: 'EL-12345',
    issuing_body: 'WorkSafe NZ',
    issue_date: new Date('2023-01-01'),
    expiry_date: new Date('2026-01-01'),
    document_url: null,
    reminder_sent: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** Expected mobile-friendly shape for the default makeDbRow() */
const expectedMobileShape = {
  id: 'cert-uuid-1',
  user_id: 'user-1',
  type: 'electrical',
  name: 'Electrical Licence',
  cert_number: 'EL-12345',
  issuing_body: 'WorkSafe NZ',
  issue_date: new Date('2023-01-01'),
  expiry_date: new Date('2026-01-01'),
  document_url: null,
  reminder_sent: false,
  created_at: NOW,
  updated_at: NOW,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createCertification
// ---------------------------------------------------------------------------

describe('createCertification', () => {
  it('inserts and returns mobile-friendly certification', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeDbRow()] });

    const result = await createCertification('user-1', {
      type: 'electrical',
      name: 'Electrical Licence',
      certNumber: 'EL-12345',
      issuingBody: 'WorkSafe NZ',
      issueDate: '2023-01-01',
      expiryDate: '2026-01-01',
    });

    expect(result).toMatchObject(expectedMobileShape);
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    // Verify the INSERT was called (not UPDATE or SELECT)
    expect((mockDbQuery.mock.calls[0][0] as string).trim().toUpperCase()).toMatch(/^INSERT/);
  });

  it('passes null for optional fields when omitted', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeDbRow({ cert_number: null, issuing_body: null, issue_date: null, expiry_date: null })],
    });

    await createCertification('user-1', {
      type: 'gas',
      name: 'Gas Fitting',
    });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    // cert_number, issuingBody, issueDate, expiryDate should all be null
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCertificationById
// ---------------------------------------------------------------------------

describe('getCertificationById', () => {
  it('returns mobile-friendly cert when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeDbRow()] });

    const result = await getCertificationById('cert-uuid-1', 'user-1');

    expect(result).toMatchObject(expectedMobileShape);
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      ['cert-uuid-1', 'user-1']
    );
  });

  it('returns null when not found (ownership enforced)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getCertificationById('cert-uuid-1', 'other-user');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listCertifications
// ---------------------------------------------------------------------------

describe('listCertifications', () => {
  it('returns certifications and total with defaults', async () => {
    // First call: COUNT query; second call: SELECT query
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [makeDbRow(), makeDbRow({ id: 'cert-uuid-2' })] });

    const result = await listCertifications('user-1');

    expect(result.total).toBe(3);
    expect(result.certifications).toHaveLength(2);
    expect(result.certifications[0]).toMatchObject(expectedMobileShape);
  });

  it('respects limit and offset options', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listCertifications('user-1', { limit: 5, offset: 5 });

    const selectParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(selectParams).toEqual(['user-1', 5, 5]);
  });

  it('returns empty list when user has no certifications', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listCertifications('user-1');

    expect(result.total).toBe(0);
    expect(result.certifications).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateCertification
// ---------------------------------------------------------------------------

describe('updateCertification', () => {
  it('updates provided fields and returns updated cert', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeDbRow({ name: 'Updated Cert Name' })] });

    const result = await updateCertification('cert-uuid-1', 'user-1', {
      name: 'Updated Cert Name',
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Cert Name');
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql.trim().toUpperCase()).toMatch(/^UPDATE/);
    expect(sql).toContain('name = $1');
  });

  it('maps camelCase input to snake_case columns', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeDbRow({ cert_number: 'NEW-999', issuing_body: 'Standards NZ' })],
    });

    await updateCertification('cert-uuid-1', 'user-1', {
      certNumber: 'NEW-999',
      issuingBody: 'Standards NZ',
    });

    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain('cert_number = $1');
    expect(sql).toContain('issuing_body = $2');
  });

  it('falls back to getCertificationById when updates object is empty', async () => {
    // No-op: should delegate to getCertificationById (one DB call)
    mockDbQuery.mockResolvedValueOnce({ rows: [makeDbRow()] });

    const result = await updateCertification('cert-uuid-1', 'user-1', {});

    expect(result).toMatchObject(expectedMobileShape);
    // Only one query fired (the SELECT inside getCertificationById)
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql.trim().toUpperCase()).toMatch(/^SELECT/);
  });

  it('returns null when cert not found or not owned', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await updateCertification('cert-uuid-1', 'other-user', { name: 'X' });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteCertification
// ---------------------------------------------------------------------------

describe('deleteCertification', () => {
  it('returns true when cert exists and is deleted', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const result = await deleteCertification('cert-uuid-1', 'user-1');

    expect(result).toBe(true);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'DELETE FROM certifications WHERE id = $1 AND user_id = $2',
      ['cert-uuid-1', 'user-1']
    );
  });

  it('returns false when cert not found or not owned', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });

    const result = await deleteCertification('cert-uuid-1', 'other-user');

    expect(result).toBe(false);
  });

  it('handles rowCount null gracefully', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: null });

    const result = await deleteCertification('cert-uuid-1', 'user-1');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getExpiringCertifications
// ---------------------------------------------------------------------------

describe('getExpiringCertifications', () => {
  it('returns certs expiring within default 30 days', async () => {
    const expiringSoon = makeDbRow({ expiry_date: new Date('2025-06-20') });
    mockDbQuery.mockResolvedValueOnce({ rows: [expiringSoon] });

    const result = await getExpiringCertifications('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].expiry_date).toEqual(new Date('2025-06-20'));
    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("INTERVAL '30 days'");
    expect(mockDbQuery).toHaveBeenCalledWith(expect.any(String), ['user-1']);
  });

  it('uses custom days parameter', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await getExpiringCertifications('user-1', 60);

    const sql = mockDbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("INTERVAL '60 days'");
  });

  it('returns empty array when no certs are expiring', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getExpiringCertifications('user-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCertificationStats
// ---------------------------------------------------------------------------

describe('getCertificationStats', () => {
  it('parses aggregate counts from string values correctly', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ total: '5', expiring_soon: '2', expired: '1' }],
    });

    const stats = await getCertificationStats('user-1');

    expect(stats).toEqual({
      total: 5,
      expiringSoon: 2,
      expired: 1,
    });
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.expiringSoon).toBe('number');
    expect(typeof stats.expired).toBe('number');
  });

  it('returns zeros when user has no certifications', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ total: '0', expiring_soon: '0', expired: '0' }],
    });

    const stats = await getCertificationStats('user-1');

    expect(stats).toEqual({ total: 0, expiringSoon: 0, expired: 0 });
  });

  it('queries only for the specified user', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ total: '3', expiring_soon: '0', expired: '0' }],
    });

    await getCertificationStats('user-abc');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1'),
      ['user-abc']
    );
  });
});
