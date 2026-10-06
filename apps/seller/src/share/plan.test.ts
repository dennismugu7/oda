import { describe, expect, it } from 'vitest';
import {
  captionsFor,
  captionText,
  captionToShare,
  firstChannel,
  imageKinds,
  shareButtonTitle,
  shareNotice,
  viaLine,
  type ShareData,
} from './plan';

const BASE = 'https://oda.test';
const data: ShareData = {
  shop: { name: 'Amani Styles', slug: 'amani-styles', logoUrl: null, linkPrefix: 'oda.test/' },
  latest: { id: 'p1', name: 'Ankara wrap dress', price: 2500, photoUrl: 'https://img/p1.jpg' },
  productCount: 12,
  channels: ['tiktok', 'whatsapp'],
};

describe('Share screen (19b-share)', () => {
  it('starts on the seller’s first channel, else WhatsApp', () => {
    expect(firstChannel(['market_stall', 'tiktok', 'whatsapp'])).toBe('tiktok');
    expect(firstChannel(['tiktok'])).toBe('tiktok');
    expect(firstChannel([])).toBe('whatsapp');
  });

  it('offers "New in" only with a product photo', () => {
    expect(imageKinds(data)).toEqual(['new', 'collection']);
    expect(imageKinds({ ...data, latest: null })).toEqual(['collection']);
    expect(imageKinds({ ...data, latest: { ...data.latest!, photoUrl: null } })).toEqual([
      'collection',
    ]);
  });

  it('captions show the plain link; the shared one is tagged for the channel', () => {
    const en = captionText(data, BASE, 'new', 'en', 0);
    expect(en).toBe(
      'New drops are in! Get the Ankara wrap dress for KSh 2,500. Order here and pay by M-Pesa: oda.test/amani-styles',
    );
    expect(captionText(data, BASE, 'collection', 'sw', 0)).toContain('bidhaa 12');
    expect(captionToShare(en, BASE, 'amani-styles', 'tiktok')).toContain(
      'https://oda.test/amani-styles?s=tt',
    );
    expect(captionToShare(en, BASE, 'amani-styles', 'whatsapp_status')).toContain('?s=status');
    // A seller who deleted the link still shares it.
    expect(captionToShare('Hello', BASE, 'amani-styles', 'instagram')).toBe(
      'Hello\nhttps://oda.test/amani-styles?s=ig',
    );
    expect(captionsFor('new', 'en')).toBeGreaterThan(1);
    expect(captionsFor('collection', 'sw')).toBeGreaterThan(1);
  });

  it('says where orders will show, and what to do in the share sheet', () => {
    expect(viaLine('tiktok')).toBe('Orders from this post will show as "via TikTok"');
    expect(viaLine('whatsapp_status')).toBe(
      'Orders from this post will show as "via WhatsApp Status"',
    );
    expect(shareButtonTitle('whatsapp_status')).toBe('Share to Status');
    expect(shareButtonTitle('facebook')).toBe('Share to Facebook');
    expect(shareNotice('whatsapp_status')).toContain('"My status"');
    expect(shareNotice('instagram')).toBe(
      'Pick Instagram. The caption is copied: paste it with your post.',
    );
  });
});
