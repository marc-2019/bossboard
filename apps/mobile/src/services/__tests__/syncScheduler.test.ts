/**
 * Sync Scheduler Tests
 * Tests the offline-sync orchestration: network gating, batch-vs-individual
 * routing, error handling, metrics recording, and multi-batch aggregation.
 *
 * The api client and the syncQueue module are mocked so the scheduler's
 * decision logic can be driven deterministically without a real DB/network.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// --- Mock the api client (used for batch + individual sync requests) ---
const mockApiPost = jest.fn<any>();
const mockApiPut = jest.fn<any>();
const mockApiDelete = jest.fn<any>();

jest.mock('../api', () => ({
  api: {
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}));

// --- Mock the syncQueue module the scheduler depends on ---
const mockDetectNetworkQuality = jest.fn<any>();
const mockGetPendingSyncItems = jest.fn<any>();
const mockMarkSyncItemProcessed = jest.fn<any>();
const mockRecordSyncFailure = jest.fn<any>();
const mockRecordSyncMetrics = jest.fn<any>();
const mockCleanupOldMetrics = jest.fn<any>();

jest.mock('../syncQueue', () => ({
  __esModule: true,
  // Re-export the enum values the scheduler imports
  SyncPriority: {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  },
  detectNetworkQuality: (...args: any[]) => mockDetectNetworkQuality(...args),
  getPendingSyncItems: (...args: any[]) => mockGetPendingSyncItems(...args),
  markSyncItemProcessed: (...args: any[]) => mockMarkSyncItemProcessed(...args),
  recordSyncFailure: (...args: any[]) => mockRecordSyncFailure(...args),
  recordSyncMetrics: (...args: any[]) => mockRecordSyncMetrics(...args),
  cleanupOldMetrics: (...args: any[]) => mockCleanupOldMetrics(...args),
  // The module is imported as `syncQueue` default elsewhere; provide a default too
  default: {},
}));

// expo-background-fetch / expo-task-manager are imported at module top-level
// (TaskManager.defineTask runs on import). Mock them so import doesn't blow up.
jest.mock(
  'expo-background-fetch',
  () => ({
    BackgroundFetchResult: { NewData: 'new-data', Failed: 'failed', NoData: 'no-data' },
    registerTaskAsync: jest.fn<any>().mockResolvedValue(undefined),
    unregisterTaskAsync: jest.fn<any>().mockResolvedValue(undefined),
    getStatusAsync: jest.fn<any>().mockResolvedValue(3),
  }),
  { virtual: true }
);

jest.mock(
  'expo-task-manager',
  () => ({
    defineTask: jest.fn<any>(),
    isTaskRegisteredAsync: jest.fn<any>().mockResolvedValue(false),
  }),
  { virtual: true }
);

import { performSync, syncAllItems, syncCriticalItems } from '../syncScheduler';

const GOOD_NETWORK = { isReachable: true, latency: 50, quality: 'excellent' as const };

function makeItem(overrides: Partial<any> = {}) {
  return {
    id: 1,
    entity_type: 'invoices',
    entity_id: 'inv-1',
    action: 'create',
    payload: JSON.stringify({ amount: 100 }),
    priority: 1,
    created_at: '2026-01-01T00:00:00Z',
    attempts: 0,
    last_attempt_at: null,
    error_message: null,
    conflict_strategy: 'server_wins',
    ...overrides,
  };
}

beforeEach(() => {
  mockApiPost.mockReset();
  mockApiPut.mockReset();
  mockApiDelete.mockReset();
  mockDetectNetworkQuality.mockReset().mockResolvedValue(GOOD_NETWORK);
  mockGetPendingSyncItems.mockReset().mockResolvedValue([]);
  mockMarkSyncItemProcessed.mockReset().mockResolvedValue(undefined);
  mockRecordSyncFailure.mockReset().mockResolvedValue(undefined);
  mockRecordSyncMetrics.mockReset().mockResolvedValue(undefined);
  mockCleanupOldMetrics.mockReset().mockResolvedValue(undefined);
});

describe('performSync — network gating', () => {
  it('returns failure without touching the queue when network is unreachable', async () => {
    mockDetectNetworkQuality.mockResolvedValue({ isReachable: false, latency: 0, quality: 'offline' });

    const result = await performSync();

    expect(result.success).toBe(false);
    expect(result.itemsSynced).toBe(0);
    expect(result.networkQuality).toBe('offline');
    expect(result.errors[0].error).toBe('No network connection');
    // Should short-circuit before fetching pending items
    expect(mockGetPendingSyncItems).not.toHaveBeenCalled();
  });

  it('skips sync when requireGoodNetwork is set and quality is poor', async () => {
    mockDetectNetworkQuality.mockResolvedValue({ isReachable: true, latency: 2000, quality: 'poor' });

    const result = await performSync({ requireGoodNetwork: true });

    expect(result.success).toBe(false);
    expect(result.errors[0].error).toBe('Network quality too poor');
    expect(mockGetPendingSyncItems).not.toHaveBeenCalled();
  });

  it('proceeds on poor network when requireGoodNetwork is not set', async () => {
    mockDetectNetworkQuality.mockResolvedValue({ isReachable: true, latency: 2000, quality: 'poor' });
    mockGetPendingSyncItems.mockResolvedValue([]);

    const result = await performSync({ requireGoodNetwork: false });

    expect(result.success).toBe(true);
    expect(mockGetPendingSyncItems).toHaveBeenCalled();
  });
});

describe('performSync — empty queue', () => {
  it('returns success with zero items when nothing is pending', async () => {
    mockGetPendingSyncItems.mockResolvedValue([]);

    const result = await performSync();

    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBe(0);
    expect(result.itemsFailed).toBe(0);
    // No metrics recorded for an empty run (early return)
    expect(mockRecordSyncMetrics).not.toHaveBeenCalled();
  });

  it('passes the batch size through to getPendingSyncItems', async () => {
    await performSync({ batchSize: 7 });
    expect(mockGetPendingSyncItems).toHaveBeenCalledWith(7);
  });
});

describe('performSync — priority filtering', () => {
  it('filters out items whose priority does not match priorityFilter', async () => {
    mockGetPendingSyncItems.mockResolvedValue([
      makeItem({ id: 1, priority: 0 }), // CRITICAL
      makeItem({ id: 2, priority: 2 }), // MEDIUM
    ]);
    // Only one item remains after filter -> individual path -> PUT/POST per item
    mockApiPost.mockResolvedValue({ data: {} });

    const result = await performSync({ priorityFilter: 0 });

    // Exactly the one critical item should have been processed
    expect(result.itemsSynced).toBe(1);
    expect(mockMarkSyncItemProcessed).toHaveBeenCalledTimes(1);
    expect(mockMarkSyncItemProcessed).toHaveBeenCalledWith(1);
  });

  it('returns an empty success result if the filter removes all items', async () => {
    mockGetPendingSyncItems.mockResolvedValue([makeItem({ priority: 2 })]);

    const result = await performSync({ priorityFilter: 0 });

    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBe(0);
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});

describe('performSync — batch API path', () => {
  it('uses the batch endpoint for >1 item on good network and marks successes', async () => {
    const items = [makeItem({ id: 10 }), makeItem({ id: 11, entity_id: 'inv-2' })];
    mockGetPendingSyncItems.mockResolvedValue(items);
    mockApiPost.mockResolvedValue({
      data: {
        results: [
          { id: 10, success: true },
          { id: 11, success: true },
        ],
        server_timestamp: '2026-01-01T00:00:01Z',
        processed: 2,
        succeeded: 2,
        failed: 0,
      },
    });

    const result = await performSync();

    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/v1/sync/batch',
      expect.objectContaining({ operations: expect.any(Array) })
    );
    expect(result.success).toBe(true);
    expect(result.itemsSynced).toBe(2);
    expect(result.itemsFailed).toBe(0);
    expect(mockMarkSyncItemProcessed).toHaveBeenCalledWith(10);
    expect(mockMarkSyncItemProcessed).toHaveBeenCalledWith(11);
    expect(mockRecordSyncMetrics).toHaveBeenCalled();
  });

  it('records per-item failures returned by the batch endpoint', async () => {
    const items = [makeItem({ id: 20 }), makeItem({ id: 21, entity_id: 'inv-2' })];
    mockGetPendingSyncItems.mockResolvedValue(items);
    mockApiPost.mockResolvedValue({
      data: {
        results: [
          { id: 20, success: true },
          { id: 21, success: false, error: 'Validation failed' },
        ],
        processed: 2,
        succeeded: 1,
        failed: 1,
      },
    });

    const result = await performSync();

    expect(result.success).toBe(false);
    expect(result.itemsSynced).toBe(1);
    expect(result.itemsFailed).toBe(1);
    expect(mockMarkSyncItemProcessed).toHaveBeenCalledWith(20);
    expect(mockRecordSyncFailure).toHaveBeenCalledWith(21, 'Validation failed');
    expect(result.errors).toEqual([{ itemId: 21, error: 'Validation failed' }]);
  });

  it('treats every item as failed when the batch request itself throws', async () => {
    const items = [makeItem({ id: 30 }), makeItem({ id: 31, entity_id: 'inv-2' })];
    mockGetPendingSyncItems.mockResolvedValue(items);
    mockApiPost.mockRejectedValue(new Error('500 Server Error'));

    const result = await performSync();

    // processSyncItemsBatch swallows the error and marks all failed
    expect(result.success).toBe(false);
    expect(result.itemsFailed).toBe(2);
    expect(result.itemsSynced).toBe(0);
    expect(mockRecordSyncFailure).toHaveBeenCalledWith(30, '500 Server Error');
    expect(mockRecordSyncFailure).toHaveBeenCalledWith(31, '500 Server Error');
  });
});

describe('performSync — individual path routing by action', () => {
  it('uses POST for create on a single item (batch not used for 1 item)', async () => {
    mockGetPendingSyncItems.mockResolvedValue([
      makeItem({ id: 40, action: 'create', entity_type: 'expenses', payload: JSON.stringify({ x: 1 }) }),
    ]);
    mockApiPost.mockResolvedValue({ data: {} });

    const result = await performSync();

    expect(mockApiPost).toHaveBeenCalledWith('/api/v1/expenses', { x: 1 });
    expect(result.itemsSynced).toBe(1);
    expect(mockMarkSyncItemProcessed).toHaveBeenCalledWith(40);
  });

  it('uses PUT for update including the entity id in the path', async () => {
    mockGetPendingSyncItems.mockResolvedValue([
      makeItem({ id: 41, action: 'update', entity_type: 'invoices', entity_id: 'inv-9', payload: JSON.stringify({ amount: 5 }) }),
    ]);
    mockApiPut.mockResolvedValue({ data: {} });

    await performSync();

    expect(mockApiPut).toHaveBeenCalledWith('/api/v1/invoices/inv-9', { amount: 5 });
  });

  it('uses DELETE for delete actions', async () => {
    mockGetPendingSyncItems.mockResolvedValue([
      makeItem({ id: 42, action: 'delete', entity_type: 'swms', entity_id: 'swms-3', payload: null }),
    ]);
    mockApiDelete.mockResolvedValue({ data: {} });

    await performSync();

    expect(mockApiDelete).toHaveBeenCalledWith('/api/v1/swms/swms-3');
  });

  it('records a failure (not a throw) when an individual request rejects', async () => {
    mockGetPendingSyncItems.mockResolvedValue([
      makeItem({ id: 43, action: 'create', entity_type: 'invoices' }),
    ]);
    mockApiPost.mockRejectedValue(new Error('timeout'));

    const result = await performSync();

    expect(result.success).toBe(false);
    expect(result.itemsFailed).toBe(1);
    expect(mockRecordSyncFailure).toHaveBeenCalledWith(43, 'timeout');
    expect(mockMarkSyncItemProcessed).not.toHaveBeenCalled();
  });

  it('records an "Unknown action" failure for an unrecognised action', async () => {
    mockGetPendingSyncItems.mockResolvedValue([
      makeItem({ id: 44, action: 'frobnicate' }),
    ]);

    const result = await performSync();

    expect(result.itemsFailed).toBe(1);
    expect(mockRecordSyncFailure).toHaveBeenCalledWith(44, 'Unknown action: frobnicate');
  });
});

describe('syncCriticalItems', () => {
  it('requests only CRITICAL items with a batch size of 5', async () => {
    mockGetPendingSyncItems.mockResolvedValue([]);

    await syncCriticalItems();

    expect(mockGetPendingSyncItems).toHaveBeenCalledWith(5);
  });
});

describe('syncAllItems — multi-batch aggregation', () => {
  it('loops until a batch syncs zero items and aggregates totals', async () => {
    // First call: one item syncs (individual path). Second call: empty queue -> stop.
    mockGetPendingSyncItems
      .mockResolvedValueOnce([makeItem({ id: 50, action: 'create' })])
      .mockResolvedValueOnce([]);
    mockApiPost.mockResolvedValue({ data: {} });

    const result = await syncAllItems();

    expect(result.itemsSynced).toBe(1);
    expect(result.success).toBe(true);
    // Two performSync iterations -> getPendingSyncItems called twice
    expect(mockGetPendingSyncItems).toHaveBeenCalledTimes(2);
  });

  it('stops after the first batch when it syncs nothing', async () => {
    mockGetPendingSyncItems.mockResolvedValue([]);

    const result = await syncAllItems();

    expect(result.itemsSynced).toBe(0);
    expect(mockGetPendingSyncItems).toHaveBeenCalledTimes(1);
  });
});
