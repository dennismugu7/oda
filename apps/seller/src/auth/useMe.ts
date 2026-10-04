// The signed-in seller (GET /api/me) for screens that show the shop's name and link.
import { useEffect, useState } from 'react';
import { fetchMe } from '@/api';
import type { Me } from './route';

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMe().then((result) => {
      if (!cancelled && result.kind === 'ok') setMe(result.me);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}
