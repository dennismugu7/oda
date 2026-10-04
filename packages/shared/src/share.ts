import { formatKsh } from './money';
import type { Channel } from './schemas/enums';

// Sharing the shop link (spec §4, §5.2 step 6, §5.6): links carry a `?s=` source tag, the
// share buttons follow the channels the seller picked on step 2, and the ready-made post
// is a template caption in English or Swahili ("Try another"; no AI, decision #41 c).

export type ShareTarget =
  'whatsapp' | 'whatsapp_status' | 'tiktok' | 'instagram' | 'facebook' | 'more';

/** The `?s=` tag per share target (orders and Insights show "via TikTok" etc.). */
export const SHARE_SOURCE: Record<ShareTarget, string> = {
  whatsapp: 'wa',
  whatsapp_status: 'status',
  tiktok: 'tt',
  instagram: 'ig',
  facebook: 'fb',
  more: 'other',
};

export const SHARE_LABELS: Record<ShareTarget, string> = {
  whatsapp: 'WhatsApp',
  whatsapp_status: 'Status',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  more: 'More',
};

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$|\.local$/i;

/**
 * True for a base URL buyers can open: https and a public host (never localhost, an emulator
 * or LAN address). Deployed environments refuse anything else (owner Step 58).
 */
export function isPublicBaseUrl(url: string): boolean {
  // https://host[:port][/path…]; no URL global here (the package runs everywhere).
  const match = /^https:\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#]|$)/i.exec(url.trim());
  const host = match?.[1];
  return !!host && host.includes('.') && !PRIVATE_HOST.test(host);
}

/** `https://oda.mugu-labs.com/amani-styles?s=tt` */
export function shareUrl(baseUrl: string, slug: string, target: ShareTarget): string {
  return `${baseUrl.replace(/\/+$/, '')}/${slug}?s=${SHARE_SOURCE[target]}`;
}

/** The shop link as shown to people (no scheme, no tag): `oda.mugu-labs.com/amani-styles`. */
export function displayUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/${slug}`;
}

const DEFAULT_BUTTONS: ShareTarget[] = ['whatsapp', 'whatsapp_status', 'tiktok'];

/**
 * The share buttons on step 6: up to 3 of the seller's own channels in the order they were
 * picked (a market stall has no button), topped up with WhatsApp / Status / TikTok, then More.
 */
export function shareButtons(channels: readonly string[]): ShareTarget[] {
  const own = channels.filter((c): c is Exclude<Channel, 'market_stall'> =>
    ['whatsapp', 'whatsapp_status', 'tiktok', 'instagram', 'facebook'].includes(c),
  );
  const picked: ShareTarget[] = [];
  for (const c of [...own, ...DEFAULT_BUTTONS]) {
    if (!picked.includes(c)) picked.push(c);
    if (picked.length === 3) break;
  }
  return [...picked, 'more'];
}

export type CaptionLanguage = 'en' | 'sw';

export interface CaptionValues {
  shop: string;
  product: string;
  price: number;
  link: string;
}

type Filled = Omit<CaptionValues, 'price'> & { price: string };

const CAPTIONS: Record<CaptionLanguage, ((v: Filled) => string)[]> = {
  en: [
    (v) =>
      `New drops are in! Get the ${v.product} for ${v.price}. Order here and pay by M-Pesa: ${v.link}`,
    (v) =>
      `${v.shop} is now online 🎉 Order the ${v.product} (${v.price}) and pay the seller directly on M-Pesa: ${v.link}`,
    (v) => `Hi! You can now order from ${v.shop} here: ${v.link} · ${v.product} ${v.price}`,
    (v) => `Order the ${v.product} for ${v.price} in a few taps: ${v.link}`,
  ],
  sw: [
    (v) =>
      `Bidhaa mpya zimefika! Pata ${v.product} kwa ${v.price}. Agiza hapa na ulipe kwa M-Pesa: ${v.link}`,
    (v) =>
      `${v.shop} sasa iko mtandaoni 🎉 Agiza ${v.product} (${v.price}) na umlipe muuzaji moja kwa moja kwa M-Pesa: ${v.link}`,
    (v) =>
      `Habari! Sasa unaweza kuagiza kutoka ${v.shop} hapa: ${v.link} · ${v.product} ${v.price}`,
    (v) => `Agiza ${v.product} kwa ${v.price} kwa hatua chache tu: ${v.link}`,
  ],
};

export function captionCount(language: CaptionLanguage): number {
  return CAPTIONS[language].length;
}

/** Caption number `index` (wraps around, for "Try another"). */
export function caption(language: CaptionLanguage, index: number, values: CaptionValues): string {
  const list = CAPTIONS[language];
  const make = list[((index % list.length) + list.length) % list.length]!;
  return make({ ...values, price: formatKsh(values.price) });
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The post as it is shared (owner Step 58): the seller's own text, with the shop link (full,
 * or written without `https://`, with or without an old `?s=` tag) replaced by the link
 * tagged for this target. When the seller deleted the link, it is added back at the end.
 */
export function postForShare(
  text: string,
  baseUrl: string,
  slug: string,
  target: ShareTarget,
): { message: string; linkAdded: boolean } {
  const tagged = shareUrl(baseUrl, slug, target);
  const bare = displayUrl(baseUrl, slug);
  const link = new RegExp(`(?:https?://)?${escapeRegExp(bare)}(?:\\?s=[a-z]*)?(?![\\w-])`, 'gi');
  const trimmed = text.trim();
  if (trimmed.search(link) >= 0)
    return { message: trimmed.replace(link, tagged), linkAdded: false };
  return { message: trimmed ? `${trimmed}\n${tagged}` : tagged, linkAdded: true };
}
