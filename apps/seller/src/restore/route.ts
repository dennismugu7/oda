// Which screen to reopen after Android closed oda in the background (decision #100). Pure, so
// it is unit-tested; the root layout records the route and the start gate reopens it.
import type { RouteMemory } from './store';

export type TabRoot = '/home' | '/orders' | '/shop' | '/more';

/** Never reopened: signing in or up, codes, passwords, account deletion, M-Pesa details, setup. */
const NEVER = [
  '/welcome',
  '/sign-in',
  '/sign-up',
  '/verify',
  '/forgot-password',
  '/reset-password',
  '/settings/password',
  '/settings/delete',
  '/payments',
  '/onboarding',
];

const TABS: readonly string[] = ['/home', '/orders', '/shop', '/more'];

/** Screens above the tabs, by the tab they're opened from. */
const UNDER: [prefix: string, tab: TabRoot][] = [
  ['/orders', '/orders'],
  ['/products', '/shop'],
  ['/categories', '/shop'],
  ['/share', '/shop'],
  ['/notifications', '/home'],
  ['/settings', '/more'],
  ['/delivery', '/more'],
  ['/shop-profile', '/more'],
  ['/customers', '/more'],
  ['/insights', '/more'],
  ['/reviews', '/more'],
  ['/help', '/more'],
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function restorable(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname === '/' || pathname === '/add') return false;
  return !NEVER.some((p) => under(pathname, p));
}

/** The tab a screen sits on; Home when it isn't known. */
export function tabFor(pathname: string): TabRoot {
  if (TABS.includes(pathname)) return pathname as TabRoot;
  return UNDER.find(([prefix]) => under(pathname, prefix))?.[1] ?? '/home';
}

/**
 * What the root layout records: the pathname and the search params, without the values of
 * the path's own dynamic segments (`[id]` in `segments`), which the pathname already holds.
 */
export function routeMemory(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
  segments: readonly string[],
): RouteMemory | null {
  if (!restorable(pathname)) return null;
  const dynamic = new Set(
    segments.flatMap((s) => {
      const m = /^\[(?:\.\.\.)?([^\]]+)\]$/.exec(s);
      return m?.[1] ? [m[1]] : [];
    }),
  );
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (dynamic.has(key) || value == null) continue;
    kept[key] = Array.isArray(value) ? value.join(',') : value;
  }
  return { pathname, params: kept };
}

/** How to reopen it: the tab first, then the screen on top (unless it is the tab itself). */
export function restorePlan(memory: RouteMemory | null): { tab: TabRoot; screen: string | null } {
  if (!memory || !restorable(memory.pathname)) return { tab: '/home', screen: null };
  const tab = tabFor(memory.pathname);
  if (memory.pathname === tab) return { tab, screen: null };
  // By hand: React Native's URLSearchParams is incomplete.
  const query = Object.entries(memory.params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return { tab, screen: query ? `${memory.pathname}?${query}` : memory.pathname };
}
