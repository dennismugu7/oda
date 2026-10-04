// "See what buyers see" (19b-preview, decision #60): the real buyer shop in the in-app
// browser (expo-web-browser, already in the 0.2.0 build), so it is never a copy that drifts.
import { SHOP_BASE_URL } from '@/config';
import { colors } from '@/theme';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export function shopPageUrl(slug: string, productId?: string): string {
  return `${SHOP_BASE_URL}/${slug}${productId ? `/p/${productId}` : ''}`;
}

/** Opens the page in the in-app browser; falls back to the phone's browser. */
export async function openBuyerView(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.navy,
      controlsColor: colors.textOnNavy,
      showTitle: true,
      enableBarCollapsing: true,
    });
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}
