import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from './db';
import { serverEnv } from './env';
import { publicRepo, type PublicShop } from './repos/public';

// Loading a shop for a storefront page (M4): an old link redirects permanently to the current
// one (Next's permanentRedirect, a 308: same meaning as the spec's 301 for browsers and
// crawlers, decision #59); a missing, suspended or deleted shop is the branded 404.

export const loadShop = cache(async (slug: string, rest = ''): Promise<PublicShop> => {
  const found = await publicRepo(getDb()).findShop(slug);
  if (found.kind === 'redirect') permanentRedirect(`/${found.slug}${rest}`);
  if (found.kind === 'not_found') notFound();
  return found.shop;
});

export const shopData = (shop: PublicShop) => publicRepo(getDb()).shop(shop);

/** The shop's public link, e.g. https://oda-eta.vercel.app/demo-duka. */
export function shopLink(slug: string): string {
  return `${serverEnv().PUBLIC_SHOP_BASE_URL}/${slug}`;
}

/** Initials for a shop without a logo: "Demo Duka" → "DD". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** The seller's WhatsApp chat link with a friendly first line. */
export function whatsappLink(phone: string, shopName: string): string {
  const text = `Hi ${shopName}, I found your shop on oda.`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Can buyers order at all? Pay now (till/Pochi/Paybill) or pay on delivery (spec §5.2). */
export function takingOrders(shop: PublicShop): boolean {
  return !shop.isPaused && (shop.payNowAvailable || shop.acceptsPayOnDelivery);
}
