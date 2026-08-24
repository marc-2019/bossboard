/**
 * Platform-aware secure storage tests
 *
 * storage.ts branches on Platform.OS: on web it uses localStorage (with
 * try/catch fallbacks), on native it delegates to expo-secure-store. The
 * Platform.OS check for which module to require runs at import time, so each
 * platform is exercised in an isolated module registry via jest.isolateModules.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// expo-secure-store mock shared across the native-branch tests.
const mockSecureGet = jest.fn<any>();
const mockSecureSet = jest.fn<any>();
const mockSecureDelete = jest.fn<any>();

jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: (...a: any[]) => mockSecureGet(...a),
    setItemAsync: (...a: any[]) => mockSecureSet(...a),
    deleteItemAsync: (...a: any[]) => mockSecureDelete(...a),
    AFTER_FIRST_UNLOCK: 1,
  }),
  { virtual: true }
);

/**
 * Load a fresh copy of storage.ts with Platform.OS set to the given value.
 * Resets modules first so the import-time `require('expo-secure-store')` and
 * the Platform.OS captured in closures reflect this platform.
 */
function loadStorageForPlatform(os: 'web' | 'ios') {
  let mod: typeof import('../storage');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os } }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../storage');
  });
  // @ts-expect-error assigned inside isolateModules synchronously
  return mod;
}

beforeEach(() => {
  mockSecureGet.mockReset().mockResolvedValue(null);
  mockSecureSet.mockReset().mockResolvedValue(undefined);
  mockSecureDelete.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  jest.dontMock('react-native');
});

describe('storage on web', () => {
  let storage: typeof import('../storage');
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    (global as any).localStorage = {
      getItem: jest.fn((k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn((k: string) => {
        delete store[k];
      }),
    };
    storage = loadStorageForPlatform('web');
  });

  afterEach(() => {
    delete (global as any).localStorage;
  });

  it('round-trips a value through localStorage', async () => {
    await storage.setItemAsync('token', 'abc');
    expect(store.token).toBe('abc');
    expect(await storage.getItemAsync('token')).toBe('abc');
  });

  it('returns null for an absent key', async () => {
    expect(await storage.getItemAsync('missing')).toBeNull();
  });

  it('removes a value', async () => {
    store.token = 'abc';
    await storage.deleteItemAsync('token');
    expect('token' in store).toBe(false);
  });

  it('does NOT call expo-secure-store on web', async () => {
    await storage.setItemAsync('k', 'v');
    await storage.getItemAsync('k');
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockSecureSet).not.toHaveBeenCalled();
  });

  it('returns null when localStorage.getItem throws', async () => {
    (global as any).localStorage.getItem = jest.fn(() => {
      throw new Error('disabled');
    });
    expect(await storage.getItemAsync('k')).toBeNull();
  });

  it('swallows errors when localStorage.setItem throws (e.g. quota full)', async () => {
    (global as any).localStorage.setItem = jest.fn(() => {
      throw new Error('quota exceeded');
    });
    await expect(storage.setItemAsync('k', 'v')).resolves.toBeUndefined();
  });

  it('swallows errors when localStorage.removeItem throws', async () => {
    (global as any).localStorage.removeItem = jest.fn(() => {
      throw new Error('boom');
    });
    await expect(storage.deleteItemAsync('k')).resolves.toBeUndefined();
  });
});

describe('storage on native (ios)', () => {
  let storage: typeof import('../storage');

  beforeEach(() => {
    storage = loadStorageForPlatform('ios');
  });

  it('reads through expo-secure-store', async () => {
    mockSecureGet.mockResolvedValue('secret');
    expect(await storage.getItemAsync('token')).toBe('secret');
    expect(mockSecureGet).toHaveBeenCalledWith('token');
  });

  it('retries a thrown Keychain read once (process-death cold start)', async () => {
    mockSecureGet
      .mockRejectedValueOnce(new Error('errSecInteractionNotAllowed'))
      .mockResolvedValueOnce('secret');
    expect(await storage.getItemAsync('token')).toBe('secret');
    expect(mockSecureGet).toHaveBeenCalledTimes(2);
  });

  it('returns null when the Keychain retry also throws', async () => {
    mockSecureGet.mockRejectedValue(new Error('errSecInteractionNotAllowed'));
    expect(await storage.getItemAsync('token')).toBeNull();
    expect(mockSecureGet).toHaveBeenCalledTimes(2);
  });

  it('writes through expo-secure-store with AFTER_FIRST_UNLOCK', async () => {
    await storage.setItemAsync('token', 'secret');
    expect(mockSecureSet).toHaveBeenCalledWith('token', 'secret', {
      keychainAccessible: 1,
    });
  });

  it('deletes through expo-secure-store', async () => {
    await storage.deleteItemAsync('token');
    expect(mockSecureDelete).toHaveBeenCalledWith('token');
  });
});
