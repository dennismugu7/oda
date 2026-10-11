import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from './db';
import { serverEnv } from './env';
import { publicRepo, type PublicShop } from './repos/public';

// Loading a shop for a storefront page (M4): an old link redirects permanently to the current
// one (Next's permanentRedirect, a 308: same meaning as the spec's 301 for browsers and
// crawlers, decision #59); a missing, suspended or deleted shop is the branded 404.

// `rest` is the rest of the path plus the query, so an old link keeps its page, search and
// ?s= tag. generateMetadata runs first and redirects too, so it must pass the same `rest`.
export const loadShop = cache(async (slug: string, rest = ''): Promise<PublicShop> => {
  const found = await publicRepo(getDb()).findShop(slug);
  if (found.kind === 'redirect') permanentRedirect(`/${found.slug}${rest}`);
  if (found.kind === 'not_found') notFound();
  return found.shop;
});

type SearchParams = Record<string, string | string[] | undefined>;

/** The path after the slug with the request's query, for loadShop's redirect. */
export function restOf(path: string, searchParams: SearchParams = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  const qs = query.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
}

export const shopData = (shop: PublicShop) => publicRepo(getDb()).shop(shop);

/** The shop's public link, e.g. https://oda-eta.vercel.app/demo-duka. */
export function shopLink(slug: string): string {
  return `${serverEnv().PUBLIC_SHOP_BASE_URL}/${slug}`;
}

/** Initials for a shop without a logo: one rule on app and web (packages/shared/src/initials.ts). */
export { initials } from '@oda/shared';

/** The seller's WhatsApp chat link with a friendly first line. */
export function whatsappLink(phone: string, shopName: string): string {
  const text = `Hi ${shopName}, I found your shop on oda.`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Can buyers order at all? The shared rule (`@oda/shared` ordering), also used by the app's Home. */
export { takingOrders } from '@oda/shared';

/** Preview images: the largest size up to 28 px at which `link` fits on one line in `width` px. */
export function linkFontSize(link: string, width: number): number {
  return Math.max(16, Math.min(28, Math.floor(width / (link.length * 0.58))));
}

/** The font family name the link-preview images use (see previewFonts). */
export const PREVIEW_FONT = 'oda';

/** Preview images draw with Bricolage Grotesque 700 and Inter 500 (assets/fonts, OFL; traced in next.config.ts). */
export async function previewFonts() {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const read = (file: string) => readFile(join(process.cwd(), 'assets', 'fonts', file));
  const [bold, medium] = await Promise.all([
    read('BricolageGrotesque_700Bold.ttf'),
    read('Inter_500Medium.ttf'),
  ]);
  // One family name: bold (names, prices) draws in Bricolage Grotesque, medium in Inter (#102).
  return [
    { name: PREVIEW_FONT, data: bold, weight: 700 as const, style: 'normal' as const },
    { name: PREVIEW_FONT, data: medium, weight: 500 as const, style: 'normal' as const },
  ];
}
