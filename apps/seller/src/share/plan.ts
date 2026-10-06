// The Share screen (19b-share, decision #78), its pure parts (unit-tested): the channel tabs,
// the caption for the picked image and language ("Try another", no AI), and what gets shared.
// The image goes through the phone's share sheet (no app takes an image and text together
// from another app), so the caption, with the link tagged for the channel, is copied first.
import {
  caption,
  captionCount,
  collectionCaption,
  collectionCaptionCount,
  displayUrl,
  postForShare,
  SHARE_LABELS,
  type CaptionLanguage,
  type ShareTarget,
} from '@oda/shared';

export const SHARE_CHANNELS = [
  'whatsapp',
  'whatsapp_status',
  'tiktok',
  'instagram',
  'facebook',
] as const satisfies readonly ShareTarget[];
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export type ImageKind = 'new' | 'collection';

export interface ShareData {
  shop: { name: string; slug: string; logoUrl: string | null; linkPrefix: string };
  latest: { id: string; name: string; price: number; photoUrl: string | null } | null;
  productCount: number;
  channels: string[];
}

/** The seller's first channel from onboarding step 2, else WhatsApp. */
export function firstChannel(channels: readonly string[]): ShareChannel {
  const own = channels.find((c): c is ShareChannel =>
    (SHARE_CHANNELS as readonly string[]).includes(c),
  );
  return own ?? 'whatsapp';
}

/** "New in" needs a product with a photo; otherwise only "Collection" is offered. */
export function imageKinds(data: ShareData): ImageKind[] {
  return data.latest?.photoUrl ? ['new', 'collection'] : ['collection'];
}

export function captionsFor(kind: ImageKind, language: CaptionLanguage): number {
  return kind === 'new' ? captionCount(language) : collectionCaptionCount(language);
}

/** The caption as shown: the link written without https:// or a tag. */
export function captionText(
  data: ShareData,
  baseUrl: string,
  kind: ImageKind,
  language: CaptionLanguage,
  index: number,
): string {
  const link = displayUrl(baseUrl, data.shop.slug);
  if (kind === 'new' && data.latest) {
    return caption(language, index, {
      shop: data.shop.name,
      product: data.latest.name,
      price: data.latest.price,
      link,
    });
  }
  return collectionCaption(language, index, {
    shop: data.shop.name,
    count: data.productCount,
    link,
  });
}

/** The caption as copied: its link replaced by the full link tagged for the channel. */
export function captionToShare(
  text: string,
  baseUrl: string,
  slug: string,
  channel: ShareChannel,
): string {
  return postForShare(text, baseUrl, slug, channel).message;
}

/** The line under the button: `Orders from this post will show as "via TikTok"`. */
export function viaLine(channel: ShareChannel): string {
  const name = channel === 'whatsapp_status' ? 'WhatsApp Status' : SHARE_LABELS[channel];
  return `Orders from this post will show as "via ${name}"`;
}

export function shareButtonTitle(channel: ShareChannel): string {
  return `Share to ${channel === 'whatsapp_status' ? 'Status' : SHARE_LABELS[channel]}`;
}

/** What to tell the seller once the share sheet is open. */
export function shareNotice(channel: ShareChannel): string {
  const paste = 'The caption is copied: paste it with your post.';
  switch (channel) {
    case 'whatsapp':
      return `Pick WhatsApp, then the chat or group. ${paste}`;
    case 'whatsapp_status':
      return `Pick WhatsApp, then "My status". ${paste}`;
    default:
      return `Pick ${SHARE_LABELS[channel]}. ${paste}`;
  }
}
