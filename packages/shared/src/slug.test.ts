import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, slugify, suggestSlugs, validateSlug } from './slug';

describe('slugify', () => {
  it.each([
    ['Amani Styles', 'amani-styles'],
    ["Wanjiku's Kitchen!", 'wanjiku-s-kitchen'],
    ['  Café Délice  ', 'cafe-delice'],
    ['Shoes & Bags', 'shoes-and-bags'],
    ['🔥 Hot Deals 🔥', 'hot-deals'],
    ['A---B', 'a-b'],
    ['A really long shop name that keeps going on', 'a-really-long-shop-name-that-k'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('never ends with a hyphen after truncation', () => {
    expect(slugify('abcdefghijklmnopqrstuvwxyz abc def')).not.toMatch(/-$/);
  });
});

describe('validateSlug', () => {
  it('accepts a normal slug', () => {
    expect(validateSlug('amani-styles')).toEqual({ ok: true });
    expect(validateSlug('abc')).toEqual({ ok: true });
    expect(validateSlug('a'.repeat(30))).toEqual({ ok: true });
  });

  it.each([
    ['ab', 'too_short'],
    ['a'.repeat(31), 'too_long'],
    ['Amani', 'invalid_characters'],
    ['amani_styles', 'invalid_characters'],
    ['amani styles', 'invalid_characters'],
    ['-amani', 'hyphens'],
    ['amani-', 'hyphens'],
    ['amani--styles', 'hyphens'],
    ['admin', 'reserved'],
    ['reset-password', 'reserved'],
  ])('rejects %s (%s)', (slug, problem) => {
    expect(validateSlug(slug)).toMatchObject({ ok: false, problem });
  });

  it('rejects every reserved word', () => {
    for (const word of RESERVED_SLUGS) {
      if (word.length >= 3)
        expect(validateSlug(word)).toMatchObject({ ok: false, problem: 'reserved' });
    }
  });
});

describe('suggestSlugs', () => {
  it('offers valid, untaken alternatives', () => {
    const taken = new Set(['amani-styles', 'amani-styles-ke']);
    const out = suggestSlugs('Amani Styles', (s) => taken.has(s));
    expect(out).toEqual(['amani-styles-shop', 'amani-styles-2', 'amani-styles-3']);
    for (const s of out) expect(validateSlug(s)).toEqual({ ok: true });
  });

  it('keeps long names within 30 characters', () => {
    const out = suggestSlugs('a'.repeat(30), () => false);
    for (const s of out) {
      expect(s.length).toBeLessThanOrEqual(30);
      expect(validateSlug(s)).toEqual({ ok: true });
    }
  });

  it('works for names with no usable characters', () => {
    expect(suggestSlugs('🔥🔥', () => false)[0]).toBe('shop-ke');
  });
});
