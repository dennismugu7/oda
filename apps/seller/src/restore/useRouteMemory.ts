// Records the current screen when oda goes to the background, so the start gate can reopen
// it if Android closes the app (decision #100). Screens that are never reopened (sign-in,
// passwords, delete account, M-Pesa details, setup) remove the record instead.
import { useGlobalSearchParams, usePathname, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { restoreStore } from './native';
import { routeMemory } from './route';

export function useRouteMemory() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const latest = useRef<ReturnType<typeof routeMemory>>(null);
  useEffect(() => {
    latest.current = routeMemory(pathname, params, segments);
  }, [pathname, params, segments]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      const memory = latest.current;
      (memory ? restoreStore.saveRoute(memory) : restoreStore.deleteRoute()).catch(() => {});
    });
    return () => subscription.remove();
  }, []);
}
