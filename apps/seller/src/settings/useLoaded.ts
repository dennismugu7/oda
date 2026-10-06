// Loading for the settings screens: fresh whenever the screen shows, the last copy kept in
// memory so a screen opened offline shows saved data read-only (spec §8, OfflineBar).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ApiError } from '@/api';
import { errorMessage } from '@/onboarding/labels';

export interface Cache<T> {
  get(): T | null;
  set(value: T | null): void;
}

const caches: Cache<unknown>[] = [];

/** An in-memory copy of one screen's data; every one is emptied on sign-out. */
export function memoryCache<T>(): Cache<T> {
  let value: T | null = null;
  const cache: Cache<T> = {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
  caches.push(cache as Cache<unknown>);
  return cache;
}

/** Another account on this phone must never see this seller's settings. */
export function clearSettingsCaches(): void {
  for (const cache of caches) cache.set(null);
}

export function useLoaded<T>(
  load: () => Promise<{ data: T | null; error: ApiError | null }>,
  cache: Cache<T>,
) {
  const [data, setData] = useState<T | null>(cache.get());
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const keep = useCallback(
    (value: T) => {
      cache.set(value);
      setData(value);
    },
    [cache],
  );

  const reload = useCallback(async () => {
    const result = await load();
    if (result.data) {
      keep(result.data);
      setError(null);
      setOffline(false);
    } else {
      setOffline(result.error?.code === 'OFFLINE');
      setError(errorMessage(result.error));
    }
  }, [load, keep]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, error, offline, reload, keep };
}
