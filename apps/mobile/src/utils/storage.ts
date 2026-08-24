/**
 * Platform-aware secure storage
 * Uses expo-secure-store on native, localStorage on web
 *
 * Session keys use AFTER_FIRST_UNLOCK so a process-death relaunch can
 * read the Keychain before iOS marks the device unlocked for this process.
 * WHEN_UNLOCKED (expo-secure-store default) can reject on cold start.
 */
import { Platform } from 'react-native';

let SecureStore: any = null;

if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
}

function nativeWriteOptions() {
  if (!SecureStore?.AFTER_FIRST_UNLOCK) {
    return undefined;
  }
  return { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNativeItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // iOS Keychain can throw errSecInteractionNotAllowed on first process read.
    await delay(50);
    return SecureStore.getItemAsync(key);
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return getNativeItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage might be full or disabled
    }
    return;
  }
  return SecureStore.setItemAsync(key, value, nativeWriteOptions());
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
