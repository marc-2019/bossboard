/**
 * Compliance Audit Log Service Tests
 *
 * Append-only audit trail for compliance docs. Covers:
 *   - diffEntity: detects changed fields, skips noise/PII fields, handles arrays/objects, added/removed keys
 *   - record: inserts with serialized changes/metadata; null-safe; swallows DB errors (best-effort)
 *   - listForEntity: maps rows to camelCase entries; default + custom limit
 */

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

import { diffEntity, record, listForEntity } from '../../services/audit-log.js';

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe('diffEntity', () => {
  it('returns only the fields that changed', () => {
    const diff = diffEntity(
      { title: 'Old', site: 'A', hazard_count: 3 },
      { title: 'New', site: 'A', hazard_count: 5 },
    );
    expect(diff).toEqual({
      title: { old: 'Old', new: 'New' },
      hazard_count: { old: 3, new: 5 },
    });
    expect(diff.site).toBeUndefined();
  });

  it('skips noise and PII fields', () => {
    const diff = diffEntity(
      { updated_at: 't1', worker_signature: 'aaa', is_synced: false, title: 'X' },
      { updated_at: 't2', worker_signature: 'bbb', is_synced: true, title: 'X' },
    );
    expect(diff).toEqual({});
  });

  it('detects added and removed keys', () => {
    const diff = diffEntity({ a: 1 }, { b: 2 });
    expect(diff.a).toEqual({ old: 1, new: undefined });
    expect(diff.b).toEqual({ old: undefined, new: 2 });
  });

  it('compares arrays/objects structurally via JSON', () => {
    const same = diffEntity({ tags: ['x', 'y'] }, { tags: ['x', 'y'] });
    expect(same).toEqual({});
    const changed = diffEntity({ tags: ['x'] }, { tags: ['x', 'z'] });
    expect(changed.tags).toEqual({ old: ['x'], new: ['x', 'z'] });
  });
});

describe('record', () => {
  it('inserts a fully-populated audit entry with serialized JSON', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await record({
      entityType: 'swms',
      entityId: 'swms-1',
      action: 'update',
      actorUserId: 'user-1',
      changes: { title: { old: 'A', new: 'B' } },
      metadata: { ip: '127.0.0.1' },
    });

    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('swms');
    expect(params[1]).toBe('swms-1');
    expect(params[2]).toBe('update');
    expect(params[3]).toBe('user-1');
    expect(params[4]).toBe(JSON.stringify({ title: { old: 'A', new: 'B' } }));
    expect(params[5]).toBe(JSON.stringify({ ip: '127.0.0.1' }));
  });

  it('passes null for absent changes/metadata', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await record({
      entityType: 'checklist',
      entityId: 'c-1',
      action: 'create',
      actorUserId: null,
    });
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[3]).toBeNull(); // actorUserId
    expect(params[4]).toBeNull(); // changes
    expect(params[5]).toBeNull(); // metadata
  });

  it('never throws when the DB write fails (best effort)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDbQuery.mockRejectedValueOnce(new Error('db down'));

    await expect(
      record({ entityType: 'swms', entityId: 's-1', action: 'sign', actorUserId: 'u-1' }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('listForEntity', () => {
  it('maps rows to camelCase audit entries (default limit 100)', async () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'a-1',
          entity_type: 'swms',
          entity_id: 'swms-1',
          action: 'update',
          actor_user_id: 'user-1',
          changes: { title: { old: 'A', new: 'B' } },
          metadata: null,
          created_at: created,
        },
      ],
    });

    const result = await listForEntity('swms', 'swms-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'a-1',
      entityType: 'swms',
      entityId: 'swms-1',
      action: 'update',
      actorUserId: 'user-1',
      changes: { title: { old: 'A', new: 'B' } },
      metadata: null,
      createdAt: created,
    });
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe(100); // default limit
  });

  it('honours a custom limit', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await listForEntity('risk_assessment', 'ra-1', 5);
    expect(result).toEqual([]);
    const params = mockDbQuery.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe(5);
  });
});
