/**
 * Customers Service Tests
 *
 * Covers all exported functions:
 *   createCustomer
 *     - inserts with all fields
 *     - inserts with minimal required fields (optional fields default to null)
 *     - defaultIncludeGst defaults to true when not supplied
 *     - returns mobile-friendly snake_case format
 *   getCustomerById
 *     - returns customer when found
 *     - returns null when not found
 *     - scopes by userId (ownership check)
 *   listCustomers
 *     - returns customers and total count
 *     - applies search filter (ILIKE on name/email)
 *     - excludes inactive by default
 *     - includes inactive when includeInactive = true
 *     - applies limit and offset pagination
 *   updateCustomer
 *     - updates only provided fields
 *     - returns null when customer not found or not owned
 *     - returns current state unchanged when no fields provided
 *   deleteCustomer
 *     - soft-deletes (is_active = false), returns true
 *     - returns false when customer not found or already inactive
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));

jest.mock('../../services/data-access-audit.js', () => ({
  recordDataAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));

process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY || Buffer.alloc(32, 3).toString('base64');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh';

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  deleteCustomer,
} from '../../services/customers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-test-abc';

function makeCustomerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cust-uuid-1',
    user_id: USER_ID,
    name: 'John Smith',
    email: 'john@example.com',
    phone: '021 555 1234',
    address: '1 Main St, Auckland',
    notes: 'Prefers email contact',
    default_payment_terms: 14,
    default_include_gst: true,
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-15'),
    ...overrides,
  };
}

function makeCreateInput(overrides: Record<string, unknown> = {}): any {
  return {
    name: 'John Smith',
    email: 'john@example.com',
    phone: '021 555 1234',
    address: '1 Main St, Auckland',
    notes: 'Prefers email contact',
    defaultPaymentTerms: 14,
    defaultIncludeGst: true,
    ...overrides,
  };
}

// ===========================================================================
// createCustomer
// ===========================================================================

describe('createCustomer', () => {
  afterEach(() => jest.clearAllMocks());

  it('inserts all fields and returns snake_case customer', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    const result = await createCustomer(USER_ID, makeCreateInput());

    expect(result).toMatchObject({
      id: 'cust-uuid-1',
      user_id: USER_ID,
      name: 'John Smith',
      email: 'john@example.com',
      phone: '021 555 1234',
      default_payment_terms: 14,
      default_include_gst: true,
      is_active: true,
    });
  });

  it('uses uuid v4 as the customer ID', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow({ id: 'mock-uuid-1234' })] });

    await createCustomer(USER_ID, makeCreateInput());

    const callArgs = mockDbQuery.mock.calls[0][1];
    expect(callArgs[0]).toBe('mock-uuid-1234'); // first param is the id
  });

  it('sets optional fields to null when not provided', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeCustomerRow({ email: null, phone: null, address: null, notes: null, default_payment_terms: null })],
    });

    const result = await createCustomer(USER_ID, makeCreateInput({ email: undefined, phone: undefined }));

    const callArgs = mockDbQuery.mock.calls[0][1];
    // id, userId, name, emailEnc, emailBlind, phoneEnc, ...
    expect(callArgs[3]).toBeNull(); // email
    expect(callArgs[4]).toBeNull(); // email_blind
    expect(callArgs[5]).toBeNull(); // phone
    expect(result.email).toBeNull();
  });

  it('defaults defaultIncludeGst to true when not provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await createCustomer(USER_ID, makeCreateInput({ defaultIncludeGst: undefined }));

    const callArgs = mockDbQuery.mock.calls[0][1];
    // defaultIncludeGst is last param (index 9) after email_blind
    expect(callArgs[9]).toBe(true);
  });

  it('sets defaultIncludeGst to false when explicitly false', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeCustomerRow({ default_include_gst: false })],
    });

    await createCustomer(USER_ID, makeCreateInput({ defaultIncludeGst: false }));

    const callArgs = mockDbQuery.mock.calls[0][1];
    expect(callArgs[9]).toBe(false);
  });

  it('stores encrypted email (enc:v1 prefix) not plaintext', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });
    await createCustomer(USER_ID, makeCreateInput({ email: 'secret@example.com' }));
    const callArgs = mockDbQuery.mock.calls[0][1];
    expect(String(callArgs[3])).toMatch(/^enc:v1:/);
  });

  it('passes userId as second query param', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await createCustomer('owner-id-xyz', makeCreateInput());

    const callArgs = mockDbQuery.mock.calls[0][1];
    expect(callArgs[1]).toBe('owner-id-xyz');
  });
});

// ===========================================================================
// getCustomerById
// ===========================================================================

describe('getCustomerById', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns customer in snake_case format when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    const result = await getCustomerById('cust-uuid-1', USER_ID);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('cust-uuid-1');
    expect(result!.name).toBe('John Smith');
  });

  it('returns null when customer not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getCustomerById('non-existent', USER_ID);

    expect(result).toBeNull();
  });

  it('queries with both customerId and userId for ownership check', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await getCustomerById('cust-uuid-1', 'owner-user');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      ['cust-uuid-1', 'owner-user']
    );
  });

  it('returns null when customer belongs to a different user', async () => {
    // DB returns empty because user_id doesn't match
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getCustomerById('cust-uuid-1', 'different-user');

    expect(result).toBeNull();
  });
});

// ===========================================================================
// listCustomers
// ===========================================================================

describe('listCustomers', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns customers array and total count', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // count query
      .mockResolvedValueOnce({ rows: [makeCustomerRow(), makeCustomerRow({ id: 'cust-2', name: 'Jane Doe' })] }); // list query

    const result = await listCustomers(USER_ID);

    expect(result.total).toBe(3);
    expect(result.customers).toHaveLength(2);
  });

  it('excludes inactive customers by default', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await listCustomers(USER_ID);

    const countQuery = mockDbQuery.mock.calls[0][0] as string;
    expect(countQuery).toContain('is_active = true');
  });

  it('includes inactive customers when includeInactive is true', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await listCustomers(USER_ID, { includeInactive: true });

    const countQuery = mockDbQuery.mock.calls[0][0] as string;
    expect(countQuery).not.toContain('is_active = true');
  });

  it('applies search filter to name and email', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await listCustomers(USER_ID, { search: 'john' });

    const listQuery = mockDbQuery.mock.calls[1][0] as string;
    expect(listQuery).toContain('ILIKE');
    const listParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(listParams).toContain('%john%');
  });

  it('uses default limit of 50 and offset of 0', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listCustomers(USER_ID);

    const listParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(listParams).toContain(50);
    expect(listParams).toContain(0);
  });

  it('applies custom limit and offset', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listCustomers(USER_ID, { limit: 10, offset: 20 });

    const listParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(listParams).toContain(10);
    expect(listParams).toContain(20);
  });

  it('returns empty array and total 0 when no customers', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await listCustomers(USER_ID);

    expect(result.total).toBe(0);
    expect(result.customers).toEqual([]);
  });
});

// ===========================================================================
// updateCustomer
// ===========================================================================

describe('updateCustomer', () => {
  afterEach(() => jest.clearAllMocks());

  it('updates provided fields and returns updated customer', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeCustomerRow({ name: 'Updated Name', email: 'new@example.com' })],
    });

    const result = await updateCustomer('cust-uuid-1', USER_ID, {
      name: 'Updated Name',
      email: 'new@example.com',
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Updated Name');
    expect(result!.email).toBe('new@example.com');
  });

  it('returns null when customer not found or not owned', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const result = await updateCustomer('non-existent', USER_ID, { name: 'New Name' });

    expect(result).toBeNull();
  });

  it('calls getCustomerById when no fields to update', async () => {
    // No-op update — should return current state via SELECT
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    const result = await updateCustomer('cust-uuid-1', USER_ID, {});

    expect(result).not.toBeNull();
    // Should have done a SELECT (getCustomerById), not an UPDATE
    const query = mockDbQuery.mock.calls[0][0] as string;
    expect(query).toContain('SELECT');
    expect(query).not.toContain('UPDATE');
  });

  it('includes updated_at = NOW() in the update', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await updateCustomer('cust-uuid-1', USER_ID, { name: 'New Name' });

    const query = mockDbQuery.mock.calls[0][0] as string;
    expect(query).toContain('updated_at = NOW()');
  });

  it('scopes update by userId', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeCustomerRow()] });

    await updateCustomer('cust-uuid-1', 'owner-user', { name: 'New Name' });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('owner-user');
  });

  it('can update isActive to false (soft inactivation via update)', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [makeCustomerRow({ is_active: false })],
    });

    const result = await updateCustomer('cust-uuid-1', USER_ID, { isActive: false });

    expect(result!.is_active).toBe(false);
  });
});

// ===========================================================================
// deleteCustomer
// ===========================================================================

describe('deleteCustomer', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns true when customer successfully soft-deleted', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    const result = await deleteCustomer('cust-uuid-1', USER_ID);

    expect(result).toBe(true);
  });

  it('returns false when customer not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });

    const result = await deleteCustomer('non-existent', USER_ID);

    expect(result).toBe(false);
  });

  it('returns false when customer already inactive', async () => {
    // WHERE is_active = true filters it out, rowCount = 0
    mockDbQuery.mockResolvedValueOnce({ rowCount: 0 });

    const result = await deleteCustomer('already-inactive', USER_ID);

    expect(result).toBe(false);
  });

  it('scopes deletion by userId for ownership check', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    await deleteCustomer('cust-uuid-1', 'owner-user');

    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $2'),
      ['cust-uuid-1', 'owner-user']
    );
  });

  it('sets is_active = false (not a hard delete)', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    await deleteCustomer('cust-uuid-1', USER_ID);

    const query = mockDbQuery.mock.calls[0][0] as string;
    expect(query).toContain('is_active = false');
    expect(query).not.toContain('DELETE');
  });

  it('handles null rowCount gracefully', async () => {
    mockDbQuery.mockResolvedValueOnce({ rowCount: null });

    const result = await deleteCustomer('cust-uuid-1', USER_ID);

    expect(result).toBe(false);
  });
});
