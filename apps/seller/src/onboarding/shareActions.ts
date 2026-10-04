// What each share button on step 6 does (owner Step 58). Pure apart from the injected phone
// actions, so it is unit-tested.
// - WhatsApp: WhatsApp opens with the post filled in (whatsapp://send?text=…).
// - Status: the same WhatsApp screen; the seller picks "My status" there.
// - TikTok, Instagram, Facebook: none of them accepts text from another app, so the post
//   is copied and the app opens (its website when the app isn't installed).
// - More: the phone's share sheet.
// Without WhatsApp, the WhatsApp buttons fall back to the share sheet and say so.
import type { ShareTarget } from '@oda/shared';

export interface ShareDeps {
  /** Resolves false when nothing on the phone can open the URL. */
  openUrl(url: string): Promise<boolean>;
  /** The system share sheet; resolves true when the seller picked an app. */
  shareSheet(message: string): Promise<boolean>;
  copy(text: string): Promise<void>;
}

export interface ShareOutcome {
  /** Whether it counts as "Share your link" done. */
  shared: boolean;
  /** A line to show the seller, if any. */
  notice: string | null;
}

const NO_WHATSAPP = "WhatsApp isn't on this phone, so we opened the share menu instead.";

const APPS: Partial<Record<ShareTarget, { name: string; app: string; web: string }>> = {
  tiktok: { name: 'TikTok', app: 'snssdk1233://', web: 'https://www.tiktok.com/' },
  instagram: { name: 'Instagram', app: 'instagram://app', web: 'https://www.instagram.com/' },
  facebook: { name: 'Facebook', app: 'fb://feed', web: 'https://www.facebook.com/' },
};

export async function shareTo(
  target: ShareTarget,
  message: string,
  deps: ShareDeps,
): Promise<ShareOutcome> {
  if (target === 'whatsapp' || target === 'whatsapp_status') {
    const opened = await deps.openUrl(`whatsapp://send?text=${encodeURIComponent(message)}`);
    if (opened) {
      return {
        shared: true,
        notice: target === 'whatsapp_status' ? 'Choose "My status" at the top of the list.' : null,
      };
    }
    return { shared: await deps.shareSheet(message), notice: NO_WHATSAPP };
  }
  const app = APPS[target];
  if (app) {
    await deps.copy(message);
    const opened = (await deps.openUrl(app.app)) || (await deps.openUrl(app.web));
    return {
      shared: opened,
      notice: opened
        ? 'Caption copied — paste it in your bio or post.'
        : `Caption copied, but ${app.name} didn't open. Paste it in ${app.name} yourself.`,
    };
  }
  return { shared: await deps.shareSheet(message), notice: null };
}
