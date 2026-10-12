// The signed-in seller (GET /api/me) for screens that show the shop's name and link.
import { useEffect, useState } from 'react';
import { fetchMe } from '@/api';
import type { Me } from './route';

let cachedMe: Me | null = null;

/** The last /api/me answer, so a screen opened right after sign-in has the shop at once. */
export const meCache = {
  get: () => cachedMe,
  set: (value: Me | null) => {
    cachedMe = value;
  },
};

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cachedMe);
  useEffect(() => {
    let cancelled = false;
    fetchMe().then((result) => {
      if (result.kind !== 'ok') return;
      cachedMe = result.me;
      if (!cancelled) setMe(result.me);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}
