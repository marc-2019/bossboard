/**
 * Offline Storage Service Tests
 * Tests SQLite-backed offline persistence: JSON (de)serialization round-trips,
 * boolean column coercion, the conflict-skip rule in syncFromServer, network
 * detection, and the legacy sync-queue priority mapping.
 *
 * expo-sqlite / expo-network are mocked with factory functions (mirrors the
 * existing syncQueue.test.ts pattern). The enhanced syncQueue module is mocked
 * so we can assert the legacy wrapper's priority routing.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Shared mock database object — module caches `db`, so keep it a single object.
const mockDb = {
  execAsync: jest.fn<any>().mockResolvedValue(undefined),
  runAsync: jest.fn<any>().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  getAllAsync: jest.fn<any>().mockResolvedValue([]),
  getFirstAsync: jest.fn<any>().mockResolvedValue(null),
};

const mockGetNetworkStateAsync = jest.fn<any>();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn<any>().mockResolvedValue(mockDb),
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: mockGetNetworkStateAsync,
}));

// Mock the enhanced sync queue used by the legacy addToSyncQueue wrapper.
const mockAddToSyncQueueV2 = jest.fn<any>().mockResolvedValue(1);
jest.mock('../syncQueue', () => ({
  __esModule: true,
  SyncPriority: { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 },
  addToSyncQueue: (...args: any[]) => mockAddToSyncQueueV2(...args),
}));

import {
  isOnline,
  saveSWMSLocally,
  getSWMSList,
  getSWMSById,
  updateSWMSLocally,
  deleteSWMSLocally,
  syncFromServer,
  setUserData,
  getUserData,
  getPendingSyncItems,
  incrementSyncAttempts,
  clearLocalData,
} from '../offline';

function makeSWMSInput(overrides: Partial<any> = {}) {
  return {
    id: 'swms-1',
    title: 'Roof Work',
    trade_type: 'builder',
    status: 'draft',
    job_description: 'Re-roof',
    site_address: '1 Queen St',
    client_name: 'Acme',
    expected_duration: '2 days',
    hazards: [{ name: 'Falls' }],
    ppe_required: ['Harness', 'Helmet'],
    emergency_procedures: ['Call 111'],
    signatures: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

// A raw DB row (arrays stored as JSON strings, booleans as 0/1).
function makeSWMSRow(overrides: Partial<any> = {}) {
  return {
    id: 'swms-1',
    title: 'Roof Work',
    trade_type: 'builder',
    status: 'draft',
    job_description: 'Re-roof',
    site_address: '1 Queen St',
    client_name: 'Acme',
    expected_duration: '2 days',
    hazards: JSON.stringify([{ name: 'Falls' }]),
    ppe_required: JSON.stringify(['Harness']),
    emergency_procedures: JSON.stringify(['Call 111']),
    signatures: JSON.stringify([]),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    synced: 1,
    local_changes: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockDb.execAsync.mockClear().mockResolvedValue(undefined);
  mockDb.runAsync.mockClear().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
  mockDb.getAllAsync.mockClear().mockResolvedValue([]);
  mockDb.getFirstAsync.mockClear().mockResolvedValue(null);
  mockGetNetworkStateAsync.mockClear().mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockAddToSyncQueueV2.mockClear().mockResolvedValue(1);
});

describe('isOnline', () => {
  it('is true only when connected AND internet is reachable', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    expect(await isOnline()).toBe(true);
  });

  it('is false when connected but internet is not reachable', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: false });
    expect(await isOnline()).toBe(false);
  });

  it('is false when not connected', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: true });
    expect(await isOnline()).toBe(false);
  });

  it('treats an undefined isConnected as offline', async () => {
    mockGetNetworkStateAsync.mockResolvedValue({ isInternetReachable: true });
    expect(await isOnline()).toBe(false);
  });

  it('returns false (does not throw) when the network call rejects', async () => {
    mockGetNetworkStateAsync.mockRejectedValue(new Error('no radio'));
    expect(await isOnline()).toBe(false);
  });
});

describe('saveSWMSLocally', () => {
  it('serializes array fields to JSON and stores synced=1, local_changes=0', async () => {
    await saveSWMSLocally(makeSWMSInput());

    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT OR REPLACE INTO swms_documents');
    // hazards/ppe/emergency/signatures must be JSON-stringified in params
    expect(params).toEqual(
      expect.arrayContaining([
        'swms-1',
        JSON.stringify([{ name: 'Falls' }]),
        JSON.stringify(['Harness', 'Helmet']),
        JSON.stringify(['Call 111']),
        JSON.stringify([]),
      ])
    );
    // The SQL literal pins synced=1, local_changes=0
    expect(sql).toContain('1, 0)');
  });
});

describe('getSWMSList', () => {
  it('parses JSON columns and coerces 0/1 to booleans', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      makeSWMSRow({ synced: 1, local_changes: 0 }),
      makeSWMSRow({ id: 'swms-2', synced: 0, local_changes: 1 }),
    ]);

    const list = await getSWMSList();

    expect(list).toHaveLength(2);
    expect(list[0].hazards).toEqual([{ name: 'Falls' }]);
    expect(list[0].ppe_required).toEqual(['Harness']);
    expect(list[0].synced).toBe(true);
    expect(list[0].local_changes).toBe(false);
    expect(list[1].synced).toBe(false);
    expect(list[1].local_changes).toBe(true);
  });

  it('defaults missing/empty JSON array columns to []', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      makeSWMSRow({ hazards: '', ppe_required: '', emergency_procedures: '', signatures: '' }),
    ]);

    const list = await getSWMSList();

    expect(list[0].hazards).toEqual([]);
    expect(list[0].ppe_required).toEqual([]);
    expect(list[0].emergency_procedures).toEqual([]);
    expect(list[0].signatures).toEqual([]);
  });

  it('queries ordered by updated_at DESC', async () => {
    await getSWMSList();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY updated_at DESC')
    );
  });
});

describe('getSWMSById', () => {
  it('returns null when no row exists', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    expect(await getSWMSById('missing')).toBeNull();
  });

  it('parses and coerces a found row', async () => {
    mockDb.getFirstAsync.mockResolvedValue(makeSWMSRow({ synced: 0, local_changes: 1 }));

    const doc = await getSWMSById('swms-1');

    expect(doc).not.toBeNull();
    expect(doc!.synced).toBe(false);
    expect(doc!.local_changes).toBe(true);
    expect(doc!.emergency_procedures).toEqual(['Call 111']);
  });
});

describe('updateSWMSLocally', () => {
  it('throws when the document does not exist', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    await expect(updateSWMSLocally('nope', { title: 'X' })).rejects.toThrow('Document not found');
  });

  it('merges updates, forces local_changes, and enqueues an update sync', async () => {
    mockDb.getFirstAsync.mockResolvedValue(makeSWMSRow());

    await updateSWMSLocally('swms-1', { title: 'New Title' });

    const updateCall = mockDb.runAsync.mock.calls.find(
      ([sql]: any[]) => typeof sql === 'string' && sql.includes('UPDATE swms_documents')
    );
    expect(updateCall).toBeDefined();
    // New title should appear in the params
    expect(updateCall![1]).toEqual(expect.arrayContaining(['New Title']));
    // SQL pins local_changes = 1
    expect(updateCall![0]).toContain('local_changes = 1');

    // Legacy wrapper -> enhanced queue; swms maps to CRITICAL (priority 0)
    expect(mockAddToSyncQueueV2).toHaveBeenCalledWith(
      'swms',
      'swms-1',
      'update',
      { title: 'New Title' },
      0
    );
  });
});

describe('deleteSWMSLocally', () => {
  it('deletes the row and enqueues a CRITICAL delete sync for swms', async () => {
    await deleteSWMSLocally('swms-1');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM swms_documents WHERE id = ?',
      ['swms-1']
    );
    expect(mockAddToSyncQueueV2).toHaveBeenCalledWith('swms', 'swms-1', 'delete', null, 0);
  });
});

describe('syncFromServer — conflict skip rule', () => {
  it('skips documents that have unsynced local changes', async () => {
    // getSWMSById is called per-doc inside the loop; return a row WITH local changes.
    mockDb.getFirstAsync.mockResolvedValue(makeSWMSRow({ local_changes: 1 }));

    await syncFromServer([makeSWMSInput({ id: 'swms-1' })]);

    // No INSERT OR REPLACE should have run for the skipped doc
    const sawInsert = mockDb.runAsync.mock.calls.some(
      ([sql]: any[]) => typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO swms_documents')
    );
    expect(sawInsert).toBe(false);
  });

  it('saves documents that have no local changes', async () => {
    mockDb.getFirstAsync.mockResolvedValue(makeSWMSRow({ local_changes: 0 }));

    await syncFromServer([makeSWMSInput({ id: 'swms-1' })]);

    const sawInsert = mockDb.runAsync.mock.calls.some(
      ([sql]: any[]) => typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO swms_documents')
    );
    expect(sawInsert).toBe(true);
  });

  it('saves a document that does not exist locally yet', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);

    await syncFromServer([makeSWMSInput({ id: 'new-doc' })]);

    const sawInsert = mockDb.runAsync.mock.calls.some(
      ([sql]: any[]) => typeof sql === 'string' && sql.includes('INSERT OR REPLACE INTO swms_documents')
    );
    expect(sawInsert).toBe(true);
  });
});

describe('user data store', () => {
  it('upserts a key/value pair', async () => {
    await setUserData('theme', 'dark');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO user_data (key, value) VALUES (?, ?)',
      ['theme', 'dark']
    );
  });

  it('returns the stored value', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ value: 'dark' });
    expect(await getUserData('theme')).toBe('dark');
  });

  it('returns null for a missing key', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    expect(await getUserData('missing')).toBeNull();
  });
});

describe('legacy sync queue helpers', () => {
  it('getPendingSyncItems filters attempts < 3 and orders by created_at', async () => {
    await getPendingSyncItems();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE attempts < 3 ORDER BY created_at ASC')
    );
  });

  it('incrementSyncAttempts bumps the attempts counter', async () => {
    await incrementSyncAttempts(99);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?',
      [99]
    );
  });
});

describe('clearLocalData', () => {
  it('clears every local table', async () => {
    await clearLocalData();
    const sql = mockDb.execAsync.mock.calls.map(([s]: any[]) => s).join('\n');
    expect(sql).toContain('DELETE FROM swms_documents');
    expect(sql).toContain('DELETE FROM certifications');
    expect(sql).toContain('DELETE FROM sync_queue');
    expect(sql).toContain('DELETE FROM user_data');
  });
});
