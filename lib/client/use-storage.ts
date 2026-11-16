'use client';

import { useSyncExternalStore } from 'react';

/**
 * Browser storage as React state, without reading it inside an effect.
 *
 * During server rendering and hydration the value is `undefined`; React then
 * re-renders with what is actually stored. Writes made through
 * `writeStoredString` update every hook in this tab; the `storage` event
 * covers other tabs.
 */

type StorageKind = 'local' | 'session';

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function storageFor(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    // Storage can be unavailable (privacy modes, sandboxed frames).
    return null;
  }
}

/** The raw string stored under `key`, `null` when absent, `undefined` before hydration. */
export function useStoredString(kind: StorageKind, key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => storageFor(kind)?.getItem(key) ?? null,
    () => undefined,
  );
}

export function writeStoredString(kind: StorageKind, key: string, value: string | null): void {
  const storage = storageFor(kind);
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Quota or privacy errors: the in-memory state still updates below.
  }
  listeners.forEach(listener => listener());
}
