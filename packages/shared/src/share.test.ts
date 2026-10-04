import { describe, expect, it } from 'vitest';
import { caption, captionCount, displayUrl, shareButtons, shareUrl } from './share';

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
