import { describe, expect, it } from 'vitest';
import { rateButtonTitle, rateNext, STAR_LABELS } from './rate';

describe('rate the app (21-rate-app)', () => {
  it('asks Play for a review only once oda is on Google Play', () => {
    expect(rateNext(5, true)).toBe('review');
    expect(rateNext(4, true)).toBe('review');
    expect(rateNext(5, false)).toBe('not_on_play');
  });

  it('sends 1–3 stars to feedback instead', () => {
    for (const stars of [1, 2, 3]) {
      expect(rateNext(stars, true)).toBe('feedback');
      expect(rateButtonTitle(stars)).toBe('Tell us what to improve');
    }
    expect(rateButtonTitle(5)).toBe('Rate on Play Store');
    expect(STAR_LABELS[4]).toBe('Love it!');
  });
});
