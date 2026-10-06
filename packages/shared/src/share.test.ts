import { describe, expect, it } from 'vitest';
import {
  caption,
  captionCount,
  displayUrl,
  isPublicBaseUrl,
  postForShare,
  shareButtons,
  shareUrl,
  collectionCaption,
  collectionCaptionCount,
} from './share';

describe('share links', () => {
  it('tag the source', () => {
    expect(shareUrl('https://oda.mugu-labs.com/', 'amani-styles', 'tiktok')).toBe(
      'https://oda.mugu-labs.com/amani-styles?s=tt',
    );
    expect(shareUrl('https://oda.mugu-labs.com', 'amani-styles', 'whatsapp_status')).toBe(
      'https://oda.mugu-labs.com/amani-styles?s=status',
    );
    expect(shareUrl('https://oda.mugu-labs.com', 'amani-styles', 'more')).toBe(
      'https://oda.mugu-labs.com/amani-styles?s=other',
    );
  });

  it('show without the scheme', () => {
    expect(displayUrl('https://oda-eta.vercel.app/', 'amani-styles')).toBe(
      'oda-eta.vercel.app/amani-styles',
    );
  });
});

describe('share buttons (step 6)', () => {
  it("follow the seller's channels, up to 3, then More", () => {
    expect(shareButtons(['tiktok', 'instagram'])).toEqual([
      'tiktok',
      'instagram',
      'whatsapp',
      'more',
    ]);
    expect(shareButtons(['facebook', 'instagram', 'tiktok', 'whatsapp'])).toEqual([
      'facebook',
      'instagram',
      'tiktok',
      'more',
    ]);
  });

  it('default to WhatsApp, Status, TikTok (design 14), and skip a market stall', () => {
    expect(shareButtons([])).toEqual(['whatsapp', 'whatsapp_status', 'tiktok', 'more']);
    expect(shareButtons(['market_stall'])).toEqual([
      'whatsapp',
      'whatsapp_status',
      'tiktok',
      'more',
    ]);
  });
});

describe('captions', () => {
  const values = {
    shop: 'Amani Styles',
    product: 'Ankara wrap dress',
    price: 2500,
    link: 'oda.mugu-labs.com/amani-styles',
  };

  it('match design 14 for the first English caption', () => {
    expect(caption('en', 0, values)).toBe(
      'New drops are in! Get the Ankara wrap dress for KSh 2,500. Order here and pay by M-Pesa: oda.mugu-labs.com/amani-styles',
    );
  });

  it('have Swahili versions, and "Try another" cycles through them', () => {
    expect(captionCount('en')).toBe(captionCount('sw'));
    expect(caption('sw', 0, values)).toContain('Bidhaa mpya zimefika');
    expect(caption('en', captionCount('en'), values)).toBe(caption('en', 0, values));
    const all = Array.from({ length: captionCount('en') }, (_, i) => caption('en', i, values));
    expect(new Set(all).size).toBe(all.length);
    for (const text of [
      ...all,
      ...Array.from({ length: captionCount('sw') }, (_, i) => caption('sw', i, values)),
    ]) {
      expect(text).toContain(values.link);
      expect(text).toContain('KSh 2,500');
    }
  });
});

describe('shop links in shared posts (owner Step 58)', () => {
  const BASE = 'https://oda-eta.vercel.app';

  it('accepts only public https base URLs', () => {
    expect(isPublicBaseUrl('https://oda-eta.vercel.app')).toBe(true);
    expect(isPublicBaseUrl('https://oda.mugu-labs.com/')).toBe(true);
    for (const bad of [
      'http://localhost:3000',
      'https://localhost:3000',
      'http://oda-eta.vercel.app',
      'https://127.0.0.1',
      'https://10.0.2.2:3000',
      'https://192.168.1.20:3000',
      'https://172.20.0.1',
      'https://myphone.local',
      'not a url',
      '',
    ]) {
      expect(isPublicBaseUrl(bad), bad).toBe(false);
    }
  });

  it("tags the link in the seller's own text for the target", () => {
    const text = `Fresh stock! ${BASE}/amani-styles see you`;
    expect(postForShare(text, BASE, 'amani-styles', 'tiktok')).toEqual({
      message: `Fresh stock! ${BASE}/amani-styles?s=tt see you`,
      linkAdded: false,
    });
    expect(
      postForShare('Order: oda-eta.vercel.app/amani-styles?s=wa', BASE, 'amani-styles', 'more')
        .message,
    ).toBe(`Order: ${BASE}/amani-styles?s=other`);
  });

  it('adds the link back when the seller deleted it (or changed it to another shop)', () => {
    expect(postForShare('  Come and shop!  ', BASE, 'amani-styles', 'whatsapp')).toEqual({
      message: `Come and shop!\n${BASE}/amani-styles?s=wa`,
      linkAdded: true,
    });
    expect(postForShare(`${BASE}/amani-styles-2`, BASE, 'amani-styles', 'whatsapp').linkAdded).toBe(
      true,
    );
    expect(postForShare('', BASE, 'amani-styles', 'whatsapp').message).toBe(
      `${BASE}/amani-styles?s=wa`,
    );
  });

  it('every caption template carries the full https link', () => {
    for (const lang of ['en', 'sw'] as const) {
      for (let i = 0; i < captionCount(lang); i++) {
        const text = caption(lang, i, {
          shop: 'Amani Styles',
          product: 'Ankara wrap dress',
          price: 2500,
          link: `${BASE}/amani-styles`,
        });
        expect(postForShare(text, BASE, 'amani-styles', 'whatsapp').linkAdded).toBe(false);
      }
    }
  });
});

describe('collection captions (Share → Collection, M8b)', () => {
  const v = { shop: 'Amani Styles', count: 12, link: 'oda.test/amani-styles' };

  it('every one names the shop and carries the link, in English and Swahili', () => {
    for (const lang of ['en', 'sw'] as const) {
      expect(collectionCaptionCount(lang)).toBeGreaterThan(1);
      for (let i = 0; i < collectionCaptionCount(lang); i++) {
        const text = collectionCaption(lang, i, v);
        expect(text).toContain('Amani Styles');
        expect(text).toContain('oda.test/amani-styles');
      }
    }
  });

  it('"Try another" wraps around, and one piece is singular', () => {
    expect(collectionCaption('en', collectionCaptionCount('en'), v)).toBe(
      collectionCaption('en', 0, v),
    );
    expect(collectionCaption('en', 0, { ...v, count: 1 })).toContain('1 piece,');
    expect(collectionCaption('sw', 0, v)).toContain('bidhaa 12');
  });
});
